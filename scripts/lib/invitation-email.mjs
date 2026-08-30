function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function buildInvitationEmailHtml({ fullName, tenantName, companyName, activationUrl, expiresAt }) {
  const safeUrl = escapeHtml(activationUrl);
  return `<!doctype html><html lang="pl"><body style="margin:0;background:#f3f5f1;color:#102825;font-family:Arial,sans-serif"><div style="max-width:620px;margin:0 auto;padding:36px 20px"><div style="background:#fff;border:1px solid #dce5df;border-radius:18px;padding:32px"><strong style="font-size:20px">EPITO</strong><h1 style="font-size:28px;margin:28px 0 12px">Aktywuj dostęp do portalu</h1><p style="line-height:1.65">Dzień dobry ${escapeHtml(fullName)},</p><p style="line-height:1.65">${escapeHtml(tenantName)} zaprasza Cię do bezpiecznego portalu firmy ${escapeHtml(companyName)}.</p><p style="margin:28px 0"><a href="${safeUrl}" style="display:inline-block;background:#b9f24b;color:#102825;text-decoration:none;font-weight:700;padding:14px 20px;border-radius:10px">Ustaw hasło i aktywuj konto</a></p><p style="color:#60736f;font-size:14px;line-height:1.6">Link jest jednorazowy i wygasa ${escapeHtml(expiresAt)}. Jeżeli nie oczekujesz tej wiadomości, zignoruj ją.</p></div></div></body></html>`;
}
