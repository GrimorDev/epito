import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getSession, isSameOrigin } from "@/lib/server/auth";
import { withTenantTransaction } from "@/lib/server/database";
import { parseMt940Statement } from "@/lib/server/mt940";
import { matchTransaction } from "@/lib/server/payment-matching";
import { canEditTenantData } from "@/lib/platform-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

function uploadsRoot() {
  return path.resolve(/* turbopackIgnore: true */ process.env.EPITO_UPLOADS_DIR?.trim() || "/app/data/uploads");
}

function canImport(role: string | null, platformRole: string) {
  return canEditTenantData(platformRole) || ["owner", "admin", "accountant", "employee"].includes(role || "");
}

function yearMonthOf(isoDate: string): { year: number; month: number } {
  const parsed = new Date(isoDate);
  const valid = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return { year: valid.getUTCFullYear(), month: valid.getUTCMonth() + 1 };
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Nieprawidłowe źródło żądania." }, { status: 403 });
  const session = await getSession(request);
  if (!session?.tenantId || !canImport(session.membershipRole, session.platformRole)) {
    return NextResponse.json({ error: "Brak uprawnień." }, { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const clientCompanyId = form?.get("clientCompanyId");
  // MT940 files rarely carry a recognized MIME type in the browser (often
  // "application/octet-stream" or empty) — validated by extension instead.
  if (!(file instanceof File) || file.size < 1 || file.size > MAX_FILE_SIZE || !/\.(sta|940|txt)$/i.test(file.name)) {
    return NextResponse.json({ error: "Dodaj plik wyciągu bankowego w formacie MT940 (.sta/.940/.txt) o wielkości do 5 MB." }, { status: 400 });
  }
  if (typeof clientCompanyId !== "string" || !clientCompanyId) {
    return NextResponse.json({ error: "Wybierz firmę klienta, której dotyczy import." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let statement;
  try {
    statement = parseMt940Statement(buffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nie udało się przetworzyć pliku wyciągu.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const company = await withTenantTransaction(session.tenantId, session.userId, async (client) => {
    const result = await client.query<{ id: string }>(
      "select id from client_companies where id = $1 and deleted_at is null",
      [clientCompanyId],
    );
    return result.rows[0] || null;
  });
  if (!company) return NextResponse.json({ error: "Nie znaleziono firmy klienta." }, { status: 404 });

  const checksum = createHash("sha256").update(buffer).digest("hex");
  const alreadyImported = await withTenantTransaction(session.tenantId, session.userId, async (client) => {
    const result = await client.query(
      "select 1 from documents where tenant_id = $1 and client_company_id = $2 and checksum_sha256 = $3 and deleted_at is null",
      [session.tenantId, company.id, checksum],
    );
    return (result.rowCount ?? 0) > 0;
  });
  if (alreadyImported) {
    return NextResponse.json({ error: "Ten plik wyciągu został już zaimportowany." }, { status: 409 });
  }

  const creditTransactions = statement.transactions.filter((transaction) => transaction.direction === "credit");
  const referenceDate = creditTransactions[0]?.valueDate || statement.closingBalance?.date || new Date().toISOString().slice(0, 10);
  const { year, month } = yearMonthOf(referenceDate);
  const root = uploadsRoot();
  const relativeKey = `${session.tenantId}/${year}/${String(month).padStart(2, "0")}/${randomUUID()}.sta`;
  const absolutePath = path.resolve(root, relativeKey);
  if (!absolutePath.startsWith(`${root}${path.sep}`)) {
    return NextResponse.json({ error: "Nieprawidłowa ścieżka pliku." }, { status: 400 });
  }
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, buffer, { flag: "wx" });

  const documentId = await withTenantTransaction(session.tenantId, session.userId, async (client) => {
    const result = await client.query<{ id: string }>(
      `insert into documents (
        tenant_id, client_company_id, created_by, name, category, source, status,
        storage_key, mime_type, file_size, checksum_sha256, document_year, document_month,
        structured_data
      ) values ($1, $2, $3, $4, 'bank', 'upload', 'verified', $5, 'text/plain', $6, $7, $8, $9, $10::jsonb)
      returning id`,
      [
        session.tenantId,
        company.id,
        session.userId,
        `Wyciąg bankowy ${statement.statementNumber || ""}`.trim(),
        relativeKey,
        buffer.length,
        checksum,
        year,
        month,
        JSON.stringify({ bank_statement: { account_id: statement.accountId, statement_number: statement.statementNumber, imported_at: new Date().toISOString() } }),
      ],
    );
    return result.rows[0].id;
  });

  let matched = 0;
  let ambiguous = 0;
  let unmatched = 0;
  let skipped = 0;

  for (const transaction of creditTransactions) {
    await withTenantTransaction(session.tenantId, session.userId, async (client) => {
      const exists = await client.query(
        "select 1 from bank_statement_transactions where tenant_id = $1 and client_company_id = $2 and statement_reference = $3 and value_date = $4",
        [session.tenantId, company.id, transaction.statementReference, transaction.valueDate],
      );
      if ((exists.rowCount ?? 0) > 0) {
        skipped += 1;
        return;
      }

      const candidates = await client.query<{ id: string; amount: string; payment_reference: string }>(
        `select id, amount::text, payment_reference from payments
         where tenant_id = $1 and client_company_id = $2 and status = 'due'
           and metadata->>'source' = 'issued_invoice' and payment_reference is not null`,
        [session.tenantId, company.id],
      );
      const result = matchTransaction(
        { amount: transaction.amount, description: transaction.description },
        candidates.rows.map((row) => ({ id: row.id, amount: Number(row.amount), paymentReference: row.payment_reference })),
      );

      const matchedPaymentId = result.status === "unmatched" ? null : result.paymentId;
      const insertedTransaction = await client.query<{ id: string }>(
        `insert into bank_statement_transactions (
          tenant_id, client_company_id, document_id, value_date, amount, currency, description,
          counterparty_account, statement_reference, matched_payment_id, match_status
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        returning id`,
        [
          session.tenantId,
          company.id,
          documentId,
          transaction.valueDate,
          transaction.amount,
          transaction.currency,
          transaction.description,
          transaction.counterpartyAccount,
          transaction.statementReference,
          matchedPaymentId,
          result.status,
        ],
      );

      if (result.status === "matched") {
        matched += 1;
        await client.query(
          `update payments set status = 'paid', paid_at = $1, provider = 'bank_transfer', provider_reference = $2, updated_at = now() where id = $3`,
          [transaction.valueDate, insertedTransaction.rows[0].id, result.paymentId],
        );
        await client.query(
          "insert into audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, after_data) values ($1, $2, 'payment.reconciled_auto', 'payment', $3, jsonb_build_object('bank_statement_transaction_id', $4::uuid))",
          [session.tenantId, session.userId, result.paymentId, insertedTransaction.rows[0].id],
        );
      } else if (result.status === "ambiguous") {
        ambiguous += 1;
      } else {
        unmatched += 1;
      }
    });
  }

  return NextResponse.json({ ok: true, imported: creditTransactions.length - skipped, matched, ambiguous, unmatched, skipped }, { status: 201 });
}
