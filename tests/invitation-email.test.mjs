import assert from "node:assert/strict";
import test from "node:test";
import { buildInvitationEmailHtml } from "../scripts/lib/invitation-email.mjs";

test("invitation email contains the activation link and escapes untrusted names", () => {
  const html = buildInvitationEmailHtml({
    fullName: "<Anna>",
    tenantName: "Biuro & Partnerzy",
    companyName: "Klient sp. z o.o.",
    activationUrl: "https://klient.epito.pl/aktywacja?token=abc",
    expiresAt: "2.09.2026, 12:00",
  });
  assert.match(html, /https:\/\/klient\.epito\.pl\/aktywacja\?token=abc/);
  assert.match(html, /&lt;Anna&gt;/);
  assert.match(html, /Biuro &amp; Partnerzy/);
  assert.doesNotMatch(html, /<Anna>/);
});
