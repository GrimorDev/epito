import assert from "node:assert/strict";
import test from "node:test";
import { parseBankStatement, transactionFingerprint } from "../lib/server/bank-statements.ts";

test("parses a Polish CSV statement with debit and credit transactions", () => {
  const csv = [
    "Data księgowania;Kwota;Waluta;Tytuł;Kontrahent;Numer rachunku;Referencja",
    '30.08.2026;-1 250,50;PLN;"VAT 07/2026 / EP-AABBCCDDEEFF00112233";Urząd Skarbowy;PL00112233445566778899001122;BANK-1',
    '30.08.2026;6088,50;PLN;"FV/2026/08/005 / EP-99887766554433221100";Kupujący;PL99887766554433221100998877;BANK-2',
  ].join("\n");
  const result = parseBankStatement(Buffer.from(csv, "utf8"), "historia.csv");

  assert.equal(result.format, "csv");
  assert.equal(result.transactions.length, 2);
  assert.deepEqual(result.transactions.map((transaction) => [transaction.direction, transaction.amount]), [["debit", 1250.5], ["credit", 6088.5]]);
});

test("parses a CAMT.053 entry and preserves payment reference in the description", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
    <BkToCstmrStmt><Stmt><Id>2026-08-30</Id><Acct><Id><IBAN>PL00112233445566778899001122</IBAN></Id></Acct>
      <Ntry><Amt Ccy="PLN">320.50</Amt><CdtDbtInd>CRDT</CdtDbtInd><BookgDt><Dt>2026-08-30</Dt></BookgDt>
        <NtryDtls><TxDtls><Refs><EndToEndId>BANK-77</EndToEndId></Refs><RltdPties><Dbtr><Pty><Nm>Nova Print</Nm></Pty></Dbtr><DbtrAcct><Id><IBAN>PL9999</IBAN></Id></DbtrAcct></RltdPties><RmtInf><Ustrd>Zapłata EP-ZZZZ9999</Ustrd></RmtInf></TxDtls></NtryDtls>
      </Ntry>
    </Stmt></BkToCstmrStmt>
  </Document>`;
  const result = parseBankStatement(Buffer.from(xml, "utf8"), "statement.xml");

  assert.equal(result.format, "camt053");
  assert.equal(result.accountId, "PL00112233445566778899001122");
  assert.deepEqual(result.transactions[0], {
    valueDate: "2026-08-30",
    direction: "credit",
    amount: 320.5,
    currency: "PLN",
    description: "Zapłata EP-ZZZZ9999",
    counterpartyName: "Nova Print",
    counterpartyAccount: "PL9999",
    externalReference: "BANK-77",
  });
});

test("creates a stable fingerprint and changes it when transaction direction changes", () => {
  const transaction = {
    valueDate: "2026-08-30",
    direction: "credit",
    amount: 100,
    currency: "PLN",
    description: "EP-ABC",
    counterpartyName: null,
    counterpartyAccount: null,
    externalReference: "1",
  };
  assert.equal(transactionFingerprint(transaction), transactionFingerprint({ ...transaction }));
  assert.notEqual(transactionFingerprint(transaction), transactionFingerprint({ ...transaction, direction: "debit" }));
});
