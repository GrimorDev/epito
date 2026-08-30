import assert from "node:assert/strict";
import test from "node:test";
import { buildReminderEmailHtml, paymentTransferTitle, taxTypeLabel } from "../scripts/lib/reminder-email.mjs";

test("taxTypeLabel maps known tax types and falls back to uppercase for unknown ones", () => {
  assert.equal(taxTypeLabel("vat"), "VAT");
  assert.equal(taxTypeLabel("zus"), "ZUS");
  assert.equal(taxTypeLabel("mystery"), "MYSTERY");
});

test("paymentTransferTitle appends the immutable payment reference exactly once", () => {
  assert.equal(
    paymentTransferTitle({ transferTitle: "VAT 08/2026", taxType: "vat", periodLabel: "08/2026", paymentReference: "EP-A1B2C3D4" }),
    "VAT 08/2026 | Ref. EP-A1B2C3D4",
  );
  assert.equal(
    paymentTransferTitle({ transferTitle: "VAT 08/2026 | Ref. EP-A1B2C3D4", taxType: "vat", periodLabel: "08/2026", paymentReference: "EP-A1B2C3D4" }),
    "VAT 08/2026 | Ref. EP-A1B2C3D4",
  );
});

test("buildReminderEmailHtml includes amount, due date, and days-until-due", () => {
  const html = buildReminderEmailHtml({
    companyName: "Kowalski Studio sp. z o.o.",
    tenantName: "Biuro Rachunkowe Nowak",
    taxType: "vat",
    periodLabel: "lipiec 2026",
    amount: 7830,
    currency: "PLN",
    dueDate: "2026-08-20",
    recipientName: null,
    bankAccountNumber: null,
    transferTitle: null,
    daysUntilDue: 7,
  });
  assert.match(html, /Kowalski Studio sp\. z o\.o\./);
  assert.match(html, /termin za 7 dni/);
  assert.match(html, /20 sierpnia 2026/);
  assert.match(html, /7830|7 830/);
  assert.match(html, /Biuro Rachunkowe Nowak/);
});

test("buildReminderEmailHtml formats the bank account into 4-digit groups and shows recipient/title", () => {
  const html = buildReminderEmailHtml({
    companyName: "Test sp. z o.o.",
    tenantName: "Biuro",
    taxType: "invoice",
    periodLabel: "sierpień 2026",
    amount: 1500,
    currency: "PLN",
    dueDate: "2026-08-25",
    recipientName: "Nova Print sp. z o.o.",
    bankAccountNumber: "40124010661111001156329830",
    transferTitle: "FV/2026/08/12",
    daysUntilDue: 2,
  });
  assert.match(html, /40 1240 1066 1111 0011 5632 9830/);
  assert.match(html, /Nova Print sp\. z o\.o\./);
  assert.match(html, /FV\/2026\/08\/12/);
});

test("buildReminderEmailHtml falls back to a generated transfer title when none is provided", () => {
  const html = buildReminderEmailHtml({
    companyName: "Test sp. z o.o.",
    tenantName: "Biuro",
    taxType: "zus",
    periodLabel: "lipiec 2026",
    amount: 1773.96,
    currency: "PLN",
    dueDate: "2026-08-20",
    recipientName: null,
    bankAccountNumber: null,
    transferTitle: null,
    daysUntilDue: 2,
  });
  assert.match(html, /ZUS lipiec 2026/);
});

test("buildReminderEmailHtml escapes untrusted-looking values", () => {
  const html = buildReminderEmailHtml({
    companyName: '<script>alert(1)</script>',
    tenantName: "Biuro",
    taxType: "vat",
    periodLabel: "lipiec 2026",
    amount: 100,
    currency: "PLN",
    dueDate: "2026-08-20",
    recipientName: null,
    bankAccountNumber: null,
    transferTitle: null,
    daysUntilDue: 7,
  });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});
