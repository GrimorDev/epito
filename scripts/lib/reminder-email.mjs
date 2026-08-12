// Pure HTML builder, no network — testable directly. Mirrors the same
// bank-account grouping used in app/panel/page.tsx's bank-transfer-details
// block so the format the client sees matches what's already in the portal.
const TAX_TYPE_LABELS = {
  vat: "VAT",
  pit: "PIT",
  cit: "CIT",
  zus: "ZUS",
  invoice: "Faktura",
  other: "Inna płatność",
};

export function taxTypeLabel(taxType) {
  return TAX_TYPE_LABELS[taxType] || String(taxType || "").toUpperCase();
}

function formatMoney(amount, currency) {
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: currency || "PLN" }).format(Number(amount));
}

function formatBankAccount(account) {
  if (!account) return null;
  return account.replace(/(.{2})(.{4})(.{4})(.{4})(.{4})(.{4})(.{4})/, "$1 $2 $3 $4 $5 $6 $7");
}

function formatDate(isoDate) {
  if (!isoDate) return "—";
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "\"": return "&quot;";
      default: return "&#39;";
    }
  });
}

export function buildReminderEmailHtml({
  companyName,
  tenantName,
  taxType,
  periodLabel,
  amount,
  currency,
  dueDate,
  recipientName,
  bankAccountNumber,
  transferTitle,
  daysUntilDue,
}) {
  const label = taxTypeLabel(taxType);
  const formattedAccount = formatBankAccount(bankAccountNumber);
  const dayWord = daysUntilDue === 1 ? "dzień" : "dni";

  return `<!doctype html>
<html lang="pl">
<head><meta charset="utf-8" /></head>
<body style="font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color:#1a1a1a; margin:0; padding:32px; background:#f6f8f5;">
  <div style="max-width:480px; margin:0 auto; background:#fff; border-radius:14px; padding:32px;">
    <p style="color:#7e8e8a; font-size:12px; letter-spacing:.05em; text-transform:uppercase; margin:0 0 8px;">Przypomnienie o płatności</p>
    <h1 style="font-size:22px; margin:0 0 16px;">${escapeHtml(companyName)}, termin za ${daysUntilDue} ${dayWord}</h1>
    <p style="margin:0 0 20px; line-height:1.5;">${escapeHtml(label)}${periodLabel ? ` za ${escapeHtml(periodLabel)}` : ""} — termin płatności: <strong>${formatDate(dueDate)}</strong>.</p>
    <div style="background:#f2f6ee; border-radius:9px; padding:20px; margin-bottom:20px;">
      <div style="font-size:12px; color:#7e8e8a;">Kwota do zapłaty</div>
      <div style="font-size:28px; font-weight:700; margin:4px 0 16px;">${formatMoney(amount, currency)}</div>
      ${recipientName ? `<div style="font-size:12px; color:#7e8e8a;">Odbiorca</div><div style="font-size:15px; margin-bottom:12px;">${escapeHtml(recipientName)}</div>` : ""}
      ${formattedAccount ? `<div style="font-size:12px; color:#7e8e8a;">Rachunek odbiorcy</div><div style="font-size:15px; margin-bottom:12px; letter-spacing:.03em;">${escapeHtml(formattedAccount)}</div>` : ""}
      <div style="font-size:12px; color:#7e8e8a;">Tytuł przelewu</div>
      <div style="font-size:15px;">${escapeHtml(transferTitle || `${label} ${periodLabel || ""}`.trim())}</div>
    </div>
    <p style="color:#8a9490; font-size:12px; line-height:1.5;">To automatyczne przypomnienie z systemu Epito, wysłane w imieniu biura ${escapeHtml(tenantName)}. Epito nie pośredniczy w przepływie środków — to zwykły przelew na rachunek odbiorcy.</p>
  </div>
</body>
</html>`;
}
