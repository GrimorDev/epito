import assert from "node:assert/strict";
import test from "node:test";
import { parseMt940Statement } from "../lib/server/mt940.ts";

const SAMPLE = [
  ":20:STMT0001",
  ":25:PL61109010140000071219812874",
  ":28C:00001/001",
  ":60F:C260801PLN10000,00",
  ":61:260805C1500,00NTRFEP-4F7K9QRT//REF001",
  ":86:PRZELEW PRZYCHODZACY TYTULEM FAKTURA EP-4F7K9QRT ZAPLATA",
  ":61:260806D250,50NCHGNONREF",
  ":86:OPLATA ZA PROWADZENIE RACHUNKU",
  ":62F:C260806PLN11249,50",
].join("\r\n");

test("parseMt940Statement extracts account/statement metadata and balances", () => {
  const statement = parseMt940Statement(SAMPLE);
  assert.equal(statement.accountId, "PL61109010140000071219812874");
  assert.equal(statement.statementNumber, "00001/001");
  assert.deepEqual(statement.openingBalance, { date: "2026-08-01", amount: 10000, currency: "PLN" });
  assert.deepEqual(statement.closingBalance, { date: "2026-08-06", amount: 11249.5, currency: "PLN" });
});

test("parseMt940Statement extracts a credit transaction with its :86: description", () => {
  const statement = parseMt940Statement(SAMPLE);
  const [credit] = statement.transactions;
  assert.equal(credit.direction, "credit");
  assert.equal(credit.valueDate, "2026-08-05");
  assert.equal(credit.amount, 1500);
  assert.equal(credit.currency, "PLN");
  assert.equal(credit.reference, "EP-4F7K9QRT");
  assert.match(credit.description, /EP-4F7K9QRT/);
});

test("parseMt940Statement extracts a debit transaction and falls back to a synthetic reference when NONREF", () => {
  const statement = parseMt940Statement(SAMPLE);
  const [, debit] = statement.transactions;
  assert.equal(debit.direction, "debit");
  assert.equal(debit.valueDate, "2026-08-06");
  assert.equal(debit.amount, 250.5);
  assert.equal(debit.reference, "NONREF");
  assert.match(debit.statementReference, /^L1-260806-250,50$/);
});

test("parseMt940Statement decodes windows-1250 bytes when the input isn't valid UTF-8", () => {
  // 0xA3 is "Ł" in windows-1250 but an invalid standalone UTF-8 continuation
  // byte — this forces the strict UTF-8 decode to throw and exercises the
  // windows-1250 fallback path.
  const statementBytes = Buffer.concat([
    Buffer.from(":61:260805C100,00NTRFEP-TEST0001\r\n:86:", "ascii"),
    Buffer.from([0xa3]),
    Buffer.from("ATNOSC EP-TEST0001", "ascii"),
  ]);
  const statement = parseMt940Statement(statementBytes);
  assert.equal(statement.transactions.length, 1);
  assert.equal(statement.transactions[0].description, "ŁATNOSC EP-TEST0001");
});

test("parseMt940Statement extracts an IBAN-looking counterparty account from the description when present", () => {
  const statement = parseMt940Statement(SAMPLE + "\r\n:61:260807C300,00NTRFEP-ZZZZ9999\r\n:86:PRZELEW PL61109010140000071219812874 EP-ZZZZ9999");
  const last = statement.transactions.at(-1);
  assert.equal(last.counterpartyAccount, "PL61109010140000071219812874");
});
