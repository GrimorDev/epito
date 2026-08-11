import type { InvoiceDetails } from "./ksef/client";

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "\"": return "&quot;";
      default: return "&#39;";
    }
  });
}

function formatMoney(value: number | null, currency: string): string {
  if (value === null) return "—";
  return `${value.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pl-PL");
}

export function renderInvoiceHtml(details: InvoiceDetails, ksefNumber: string | null, paymentReference?: string | null): string {
  const currency = details.currency || "PLN";
  const linesRows = details.lines.length
    ? details.lines
        .map(
          (line) => `<tr>
            <td>${escapeHtml(line.name || "—")}</td>
            <td class="num">${line.quantity ? escapeHtml(line.quantity) : "—"} ${line.unit ? escapeHtml(line.unit) : ""}</td>
            <td class="num">${formatMoney(line.netUnitPrice, currency)}</td>
            <td class="num">${line.vatRate ? escapeHtml(line.vatRate) + "%" : "—"}</td>
            <td class="num">${formatMoney(line.netAmount, currency)}</td>
          </tr>`,
        )
        .join("")
    : `<tr><td colspan="5" class="empty">Brak pozycji do wyświetlenia — zobacz oryginalny plik XML.</td></tr>`;

  return `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(details.invoiceNumber || "Faktura")}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 32px; font-size: 13px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #ddd; padding-bottom: 16px; margin-bottom: 20px; }
  .header .meta { text-align: right; }
  .meta .invoice-number { font-size: 22px; font-weight: 700; }
  .parties { display: flex; gap: 32px; margin-bottom: 20px; }
  .party { flex: 1; }
  .party h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; color: #555; margin: 0 0 6px; }
  .party p { margin: 2px 0; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #eee; }
  th { background: #f5f5f5; font-size: 11px; text-transform: uppercase; color: #555; }
  td.num, th.num { text-align: right; }
  td.empty { text-align: center; color: #888; padding: 20px; }
  .summary { display: flex; justify-content: flex-end; margin-bottom: 20px; }
  .summary table { width: 260px; }
  .summary td { border-bottom: none; padding: 4px 10px; }
  .summary .total td { font-weight: 700; font-size: 15px; border-top: 2px solid #1a1a1a; }
  .footer { color: #666; font-size: 12px; border-top: 1px solid #ddd; padding-top: 12px; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Faktura</h1>
      ${ksefNumber ? `<div>Numer KSeF: ${escapeHtml(ksefNumber)}</div>` : ""}
      <div>Data wystawienia: ${formatDate(details.issuedAt)}</div>
    </div>
    <div class="meta">
      <div class="invoice-number">${escapeHtml(details.invoiceNumber || "—")}</div>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <h2>Sprzedawca</h2>
      <p><strong>${escapeHtml(details.seller.name || "—")}</strong></p>
      <p>NIP: ${escapeHtml(details.seller.nip || "—")}</p>
      <p>${escapeHtml(details.seller.address || "—")}</p>
    </div>
    <div class="party">
      <h2>Nabywca</h2>
      <p><strong>${escapeHtml(details.buyer.name || "—")}</strong></p>
      <p>NIP: ${escapeHtml(details.buyer.nip || "—")}</p>
      <p>${escapeHtml(details.buyer.address || "—")}</p>
    </div>
  </div>

  <table>
    <thead>
      <tr><th>Nazwa</th><th class="num">Ilość</th><th class="num">Cena netto</th><th class="num">VAT</th><th class="num">Wartość netto</th></tr>
    </thead>
    <tbody>${linesRows}</tbody>
  </table>

  <div class="summary">
    <table>
      <tr class="total"><td>Do zapłaty (brutto)</td><td class="num">${formatMoney(details.grossAmount, currency)}</td></tr>
      <tr><td>Termin płatności</td><td class="num">${formatDate(details.paymentDueDate)}</td></tr>
    </table>
  </div>

  ${paymentReference ? `<div class="footer"><strong>Numer referencyjny płatności: ${escapeHtml(paymentReference)}</strong> — prosimy podać w tytule przelewu, aby płatność została rozpoznana automatycznie.</div>` : ""}
  <div class="footer">Dokument odtworzony z ustrukturyzowanej faktury XML pobranej z Krajowego Systemu e-Faktur.</div>
</body>
</html>`;
}
