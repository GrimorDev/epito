import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getSession, isSameOrigin } from "@/lib/server/auth";
import { withTenantTransaction } from "@/lib/server/database";
import { enqueueInvoiceIssue } from "@/lib/server/queues";
import { buildFa3InvoiceXml, computeInvoiceTotals, type InvoiceLineInput, type InvoiceVatRate } from "@/lib/server/invoice-fa3";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function canIssue(role: string | null, platformRole: string) {
  return platformRole === "supervisor" || ["owner", "admin", "accountant", "employee"].includes(role || "");
}

function uploadsRoot() {
  return path.resolve(/* turbopackIgnore: true */ process.env.EPITO_UPLOADS_DIR?.trim() || "/app/data/uploads");
}

const VAT_RATES: InvoiceVatRate[] = ["23", "8", "5", "0", "zw"];
const NIP_PATTERN = /^\d{10}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseLines(raw: unknown): InvoiceLineInput[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const lines: InvoiceLineInput[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") return null;
    const record = entry as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const unit = typeof record.unit === "string" ? record.unit.trim() : "";
    const quantity = Number(record.quantity);
    const netUnitPrice = Number(record.netUnitPrice);
    const vatRate = record.vatRate;
    if (!name || !unit) return null;
    if (!Number.isFinite(quantity) || quantity <= 0) return null;
    if (!Number.isFinite(netUnitPrice) || netUnitPrice < 0) return null;
    if (typeof vatRate !== "string" || !VAT_RATES.includes(vatRate as InvoiceVatRate)) return null;
    lines.push({ name, unit, quantity, netUnitPrice, vatRate: vatRate as InvoiceVatRate });
  }
  return lines;
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Nieprawidłowe źródło żądania." }, { status: 403 });
  const session = await getSession(request);
  if (!session?.tenantId || !canIssue(session.membershipRole, session.platformRole)) {
    return NextResponse.json({ error: "Brak uprawnień." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Nieprawidłowe dane." }, { status: 400 });

  const clientCompanyId = typeof body.clientCompanyId === "string" ? body.clientCompanyId : null;
  if (!clientCompanyId) return NextResponse.json({ error: "Wskaż firmę klienta." }, { status: 400 });

  const issuedAt = typeof body.issuedAt === "string" && DATE_PATTERN.test(body.issuedAt)
    ? body.issuedAt
    : new Date().toISOString().slice(0, 10);
  const dueDate = typeof body.dueDate === "string" && DATE_PATTERN.test(body.dueDate) ? body.dueDate : null;

  const lines = parseLines(body.lines);
  if (!lines) {
    return NextResponse.json({ error: "Dodaj co najmniej jedną poprawną pozycję (nazwa, jm, ilość, cena netto, stawka VAT)." }, { status: 400 });
  }

  const counterpartyId = typeof body.counterpartyId === "string" ? body.counterpartyId : null;
  const newCounterparty = body.counterparty && typeof body.counterparty === "object" ? body.counterparty as Record<string, unknown> : null;
  if (!counterpartyId && !newCounterparty) {
    return NextResponse.json({ error: "Wybierz kontrahenta lub podaj dane nowego." }, { status: 400 });
  }
  if (newCounterparty) {
    const name = typeof newCounterparty.name === "string" ? newCounterparty.name.trim() : "";
    const nip = typeof newCounterparty.nip === "string" ? newCounterparty.nip.trim() : "";
    if (!name) return NextResponse.json({ error: "Podaj nazwę nowego kontrahenta." }, { status: 400 });
    if (nip && !NIP_PATTERN.test(nip)) return NextResponse.json({ error: "NIP kontrahenta musi składać się z 10 cyfr." }, { status: 400 });
  }

  const companyAddress = typeof body.companyAddress === "string" ? body.companyAddress.trim() : "";
  const bankAccountNumber = typeof body.bankAccountNumber === "string" ? body.bankAccountNumber.trim() : "";

  try {
    const result = await withTenantTransaction(session.tenantId, session.userId, async (client) => {
      const companyResult = await client.query<{ id: string; name: string; nip: string | null; address: string | null; bank_account_number: string | null }>(
        "select id, name, nip, address, bank_account_number from client_companies where id = $1 and deleted_at is null",
        [clientCompanyId],
      );
      const company = companyResult.rows[0];
      if (!company) throw new HttpError(404, "Nie znaleziono firmy klienta.");
      if (!company.nip) throw new HttpError(400, "Firma klienta nie ma ustawionego NIP-u — uzupełnij go przed wystawieniem faktury.");
      const sellerNip = company.nip;

      let sellerAddress: string = company.address ?? "";
      if (!sellerAddress) {
        if (!companyAddress) throw new HttpError(400, "Uzupełnij adres firmy klienta — jest wymagany na fakturze.");
        sellerAddress = companyAddress;
        await client.query("update client_companies set address = $1, updated_at = now() where id = $2", [sellerAddress, company.id]);
      }

      let sellerBankAccount = company.bank_account_number;
      if (bankAccountNumber && bankAccountNumber !== sellerBankAccount) {
        sellerBankAccount = bankAccountNumber;
        await client.query("update client_companies set bank_account_number = $1, updated_at = now() where id = $2", [sellerBankAccount, company.id]);
      }

      let counterparty: { id: string; name: string; nip: string | null; address: string | null };
      if (counterpartyId) {
        const counterpartyResult = await client.query<{ id: string; name: string; nip: string | null; address: string | null }>(
          "select id, name, nip, address from counterparties where id = $1 and client_company_id = $2 and deleted_at is null",
          [counterpartyId, clientCompanyId],
        );
        if (!counterpartyResult.rows[0]) throw new HttpError(404, "Nie znaleziono kontrahenta.");
        counterparty = counterpartyResult.rows[0];
      } else {
        const name = String(newCounterparty!.name).trim();
        const nip = typeof newCounterparty!.nip === "string" ? newCounterparty!.nip.trim() : "";
        const address = typeof newCounterparty!.address === "string" ? newCounterparty!.address.trim() : "";
        const email = typeof newCounterparty!.email === "string" ? newCounterparty!.email.trim() : "";
        const inserted = await client.query<{ id: string; name: string; nip: string | null; address: string | null }>(
          `insert into counterparties (tenant_id, client_company_id, name, nip, address, email)
           values ($1, $2, $3, $4, $5, $6)
           returning id, name, nip, address`,
          [session.tenantId, clientCompanyId, name, nip || null, address || null, email || null],
        );
        counterparty = inserted.rows[0];
      }

      const totals = computeInvoiceTotals(lines);
      const [year, month] = issuedAt.split("-").map(Number);

      // Serialize numbering per (company, year, month) so two concurrent
      // requests can never compute the same "next" sequence number.
      await client.query("select pg_advisory_xact_lock(hashtext($1))", [`invoice-number:${clientCompanyId}:${year}:${month}`]);
      const sequenceResult = await client.query<{ next: number }>(
        `select coalesce(max(sequence_in_month), 0) + 1 as next from issued_invoices
         where tenant_id = $1 and client_company_id = $2
           and extract(year from issued_at) = $3 and extract(month from issued_at) = $4`,
        [session.tenantId, clientCompanyId, year, month],
      );
      const sequenceInMonth = sequenceResult.rows[0].next;
      const invoiceNumber = `FV/${year}/${String(month).padStart(2, "0")}/${String(sequenceInMonth).padStart(3, "0")}`;

      const invoiceXml = buildFa3InvoiceXml({
        invoiceNumber,
        issuedAt,
        currency: "PLN",
        seller: { nip: sellerNip, name: company.name, address: sellerAddress },
        buyer: { nip: counterparty.nip, name: counterparty.name, address: counterparty.address },
        lines,
        dueDate,
        bankAccountNumber: sellerBankAccount,
      });

      const buffer = Buffer.from(invoiceXml, "utf8");
      const checksum = createHash("sha256").update(buffer).digest("hex");
      const relativeKey = `${session.tenantId}/${year}/${String(month).padStart(2, "0")}/${randomUUID()}.xml`;
      const root = uploadsRoot();
      const absolutePath = path.resolve(root, relativeKey);
      if (!absolutePath.startsWith(`${root}${path.sep}`)) throw new HttpError(500, "Nieprawidłowa ścieżka pliku.");
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, buffer, { flag: "wx" });

      const documentResult = await client.query<{ id: string }>(
        `insert into documents (
          tenant_id, client_company_id, created_by, name, category, source, status,
          storage_key, mime_type, file_size, checksum_sha256, document_year, document_month,
          issued_at, amount, currency
        ) values ($1, $2, $3, $4, 'sales', 'api', 'processing', $5, 'application/xml', $6, $7, $8, $9, $10, $11, 'PLN')
        returning id`,
        [
          session.tenantId,
          clientCompanyId,
          session.userId,
          `Faktura ${invoiceNumber}`,
          relativeKey,
          buffer.length,
          checksum,
          year,
          month,
          issuedAt,
          totals.grossTotal,
        ],
      );
      const documentId = documentResult.rows[0].id;

      const invoiceResult = await client.query<{ id: string }>(
        `insert into issued_invoices (
          tenant_id, client_company_id, counterparty_id, document_id, invoice_number, sequence_in_month,
          issued_at, due_date, currency, bank_account_number, lines, invoice_xml,
          net_total, vat_total, gross_total, status, created_by
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, 'PLN', $9, $10::jsonb, $11, $12, $13, $14, 'queued', $15)
        returning id`,
        [
          session.tenantId,
          clientCompanyId,
          counterparty.id,
          documentId,
          invoiceNumber,
          sequenceInMonth,
          issuedAt,
          dueDate,
          sellerBankAccount,
          JSON.stringify(lines),
          invoiceXml,
          totals.netTotal,
          totals.vatTotal,
          totals.grossTotal,
          session.userId,
        ],
      );
      const invoiceId = invoiceResult.rows[0].id;

      await client.query(
        "insert into audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, after_data) values ($1, $2, 'invoice.issued', 'issued_invoice', $3, jsonb_build_object('invoice_number', $4::text))",
        [session.tenantId, session.userId, invoiceId, invoiceNumber],
      );

      return { invoiceId, invoiceNumber };
    });

    await enqueueInvoiceIssue(result.invoiceId, session.tenantId, session.userId);

    return NextResponse.json({ ok: true, invoiceNumber: result.invoiceNumber }, { status: 201 });
  } catch (error) {
    if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Failed to issue invoice", error);
    return NextResponse.json({ error: "Nie udało się wystawić faktury." }, { status: 500 });
  }
}

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
