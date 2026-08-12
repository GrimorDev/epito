// Pure HTML builder, no network — mirrors reminder-email.mjs's shape/style
// for the marketing site's pilot-request lead notification.
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

const COMPANIES_RANGE_LABELS = {
  "do 30": "do 30 firm",
  "31-100": "31-100 firm",
  "powyżej 100": "powyżej 100 firm",
};

export function leadCompaniesRangeLabel(companiesRange) {
  return COMPANIES_RANGE_LABELS[companiesRange] || companiesRange || "nie podano";
}

export function buildLeadNotificationEmailHtml({ name, email, companiesRange }) {
  return `<!doctype html>
<html lang="pl">
<head><meta charset="utf-8" /></head>
<body style="font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color:#1a1a1a; margin:0; padding:32px; background:#f6f8f5;">
  <div style="max-width:480px; margin:0 auto; background:#fff; border-radius:14px; padding:32px;">
    <p style="color:#7e8e8a; font-size:12px; letter-spacing:.05em; text-transform:uppercase; margin:0 0 8px;">Nowe zgłoszenie pilotażu</p>
    <h1 style="font-size:22px; margin:0 0 16px;">${escapeHtml(name)}</h1>
    <div style="background:#f2f6ee; border-radius:9px; padding:20px;">
      <div style="font-size:12px; color:#7e8e8a;">E-mail</div>
      <div style="font-size:15px; margin-bottom:12px;">${escapeHtml(email)}</div>
      <div style="font-size:12px; color:#7e8e8a;">Liczba obsługiwanych firm</div>
      <div style="font-size:15px;">${escapeHtml(leadCompaniesRangeLabel(companiesRange))}</div>
    </div>
    <p style="color:#8a9490; font-size:12px; line-height:1.5; margin-top:20px;">Zgłoszenie ze strony głównej Epito (sekcja "Zostań współtwórcą"). Odpowiedz bezpośrednio na tego maila, trafi prosto do zgłaszającego.</p>
  </div>
</body>
</html>`;
}
