import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getSession, isSameOrigin } from "@/lib/server/auth";
import { withTenantTransaction } from "@/lib/server/database";
import { parseJpkFaSalesInvoices } from "@/lib/server/jpk-fa";
import { canEditTenantData } from "@/lib/platform-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const allowedMimeTypes = new Set(["text/xml", "application/xml"]);

function uploadsRoot() {
  return path.resolve(/* turbopackIgnore: true */ process.env.EPITO_UPLOADS_DIR?.trim() || "/app/data/uploads");
}

function canImport(role: string | null, platformRole: string) {
  return canEditTenantData(platformRole) || ["owner", "admin", "accountant", "employee"].includes(role || "");
}

function yearMonthOf(isoDate: string | null): { year: number; month: number } {
  const parsed = isoDate ? new Date(isoDate) : new Date();
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
  if (!(file instanceof File) || file.size < 1 || file.size > MAX_FILE_SIZE || !allowedMimeTypes.has(file.type)) {
    return NextResponse.json({ error: "Dodaj plik JPK_FA w formacie XML o wielkości do 15 MB." }, { status: 400 });
  }
  if (typeof clientCompanyId !== "string" || !clientCompanyId) {
    return NextResponse.json({ error: "Wybierz firmę klienta, której dotyczy import." }, { status: 400 });
  }

  const xmlText = await file.text();
  let parsedFile;
  try {
    parsedFile = parseJpkFaSalesInvoices(xmlText);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nie udało się przetworzyć pliku JPK_FA.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const company = await withTenantTransaction(session.tenantId, session.userId, async (client) => {
    const result = await client.query<{ id: string; nip: string | null; name: string }>(
      "select id, nip, name from client_companies where id = $1 and deleted_at is null",
      [clientCompanyId],
    );
    return result.rows[0] || null;
  });
  if (!company) return NextResponse.json({ error: "Nie znaleziono firmy klienta." }, { status: 404 });

  if (company.nip && parsedFile.sellerNip && company.nip !== parsedFile.sellerNip) {
    return NextResponse.json({
      error: `Ten plik dotyczy NIP ${parsedFile.sellerNip}, a wybrana firma (${company.name}) ma NIP ${company.nip}. Wybierz właściwą firmę.`,
    }, { status: 400 });
  }

  const root = uploadsRoot();
  let imported = 0;
  let skipped = 0;

  for (const invoice of parsedFile.invoices) {
    const buffer = Buffer.from(invoice.rawXml, "utf8");
    const checksum = createHash("sha256").update(buffer).digest("hex");

    const alreadyStored = await withTenantTransaction(session.tenantId, session.userId, async (client) => {
      const result = await client.query(
        "select 1 from documents where tenant_id = $1 and client_company_id = $2 and checksum_sha256 = $3 and deleted_at is null",
        [session.tenantId, company.id, checksum],
      );
      return (result.rowCount ?? 0) > 0;
    });
    if (alreadyStored) {
      skipped += 1;
      continue;
    }

    const { year, month } = yearMonthOf(invoice.issuedAt);
    const relativeKey = `${session.tenantId}/${year}/${String(month).padStart(2, "0")}/${randomUUID()}.xml`;
    const absolutePath = path.resolve(root, relativeKey);
    if (!absolutePath.startsWith(`${root}${path.sep}`)) continue;
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, buffer, { flag: "wx" });

    const status = invoice.grossAmount !== null && invoice.issuedAt !== null ? "verified" : "requires_action";
    await withTenantTransaction(session.tenantId, session.userId, async (client) => {
      await client.query(
        `insert into documents (
          tenant_id, client_company_id, created_by, name, category, source, status,
          storage_key, mime_type, file_size, checksum_sha256, document_year, document_month,
          issued_at, amount, currency, structured_data
        ) values ($1, $2, $3, $4, 'sales', 'erp', $5, $6, 'application/xml', $7, $8, $9, $10, $11, $12, $13, $14::jsonb)`,
        [
          session.tenantId,
          company.id,
          session.userId,
          `Faktura ${invoice.invoiceNumber || "(bez numeru)"}`,
          status,
          relativeKey,
          buffer.length,
          checksum,
          year,
          month,
          invoice.issuedAt,
          invoice.grossAmount,
          invoice.currency,
          JSON.stringify({
            jpk_fa: {
              imported_at: new Date().toISOString(),
              buyer_nip: invoice.buyerNip,
              buyer_name: invoice.buyerName,
            },
          }),
        ],
      );
      await client.query(
        "insert into audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, after_data) values ($1, $2, 'document.jpk_fa_imported', 'client_company', $3, jsonb_build_object('invoice_number', $4::text))",
        [session.tenantId, session.userId, company.id, invoice.invoiceNumber],
      );
    });
    imported += 1;
  }

  return NextResponse.json({ ok: true, imported, skipped }, { status: 201 });
}
