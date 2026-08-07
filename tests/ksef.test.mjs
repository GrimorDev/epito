import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { decryptSecret, encryptSecret } from "../scripts/lib/crypto-secrets.mjs";
import { parseInvoiceSummary } from "../scripts/lib/ksef-client.mjs";

test("encryptSecret/decryptSecret round-trips a KSeF token", () => {
  const key = randomBytes(32);
  const ciphertext = encryptSecret("ksef-test-token-123", key);
  assert.ok(Buffer.isBuffer(ciphertext));
  assert.equal(decryptSecret(ciphertext, key), "ksef-test-token-123");
});

test("decryptSecret fails with the wrong key", () => {
  const ciphertext = encryptSecret("secret-value", randomBytes(32));
  assert.throws(() => decryptSecret(ciphertext, randomBytes(32)));
});

test("parseInvoiceSummary extracts amount, date and NIPs from a namespaced FA(2)-style invoice", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <tns:Faktura xmlns:tns="http://crd.gov.pl/wzor/2023/06/29/12648/">
      <tns:Fa>
        <tns:KodWaluty>PLN</tns:KodWaluty>
        <tns:P_1>2026-08-01</tns:P_1>
        <tns:P_15>1230.50</tns:P_15>
      </tns:Fa>
      <tns:Podmiot1>
        <tns:DaneIdentyfikacyjne><tns:NIP>5252931842</tns:NIP></tns:DaneIdentyfikacyjne>
      </tns:Podmiot1>
      <tns:Podmiot2>
        <tns:DaneIdentyfikacyjne><tns:NIP>1234567890</tns:NIP></tns:DaneIdentyfikacyjne>
      </tns:Podmiot2>
      <tns:Platnosc>
        <tns:TerminPlatnosci>
          <tns:Termin>2026-08-21</tns:Termin>
        </tns:TerminPlatnosci>
      </tns:Platnosc>
    </tns:Faktura>`;

  const summary = parseInvoiceSummary(xml);
  assert.equal(summary.issuedAt, "2026-08-01");
  assert.equal(summary.grossAmount, 1230.5);
  assert.equal(summary.currency, "PLN");
  assert.equal(summary.sellerNip, "5252931842");
  assert.equal(summary.buyerNip, "1234567890");
  assert.equal(summary.paymentDueDate, "2026-08-21");
});

test("parseInvoiceSummary resolves missing fields to null instead of throwing", () => {
  const summary = parseInvoiceSummary("<Faktura><Fa><KodWaluty>PLN</KodWaluty></Fa></Faktura>");
  assert.equal(summary.issuedAt, null);
  assert.equal(summary.grossAmount, null);
  assert.equal(summary.currency, "PLN");
  assert.equal(summary.sellerNip, null);
  assert.equal(summary.buyerNip, null);
  assert.equal(summary.paymentDueDate, null);
});
