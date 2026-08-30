import assert from "node:assert/strict";
import test from "node:test";
import { matchTransaction } from "../lib/server/payment-matching.ts";

const candidates = [
  { id: "pay-1", amount: 1500, paymentReference: "EP-4F7K9QRT" },
  { id: "pay-2", amount: 320.5, paymentReference: "EP-ZZZZ9999" },
];

test("matchTransaction matches when the reference is in the description and the amount is exact", () => {
  const result = matchTransaction({ amount: 1500, description: "PRZELEW TYTULEM FAKTURA EP-4F7K9QRT ZAPLATA" }, candidates);
  assert.deepEqual(result, { status: "matched", paymentId: "pay-1" });
});

test("matchTransaction is case- and punctuation-insensitive when locating the reference", () => {
  const result = matchTransaction({ amount: 320.5, description: "przelew, tytulem: ep zzzz 9999" }, candidates);
  assert.deepEqual(result, { status: "matched", paymentId: "pay-2" });
});

test("matchTransaction flags ambiguous when the reference matches but the amount doesn't", () => {
  const result = matchTransaction({ amount: 1000, description: "FAKTURA EP-4F7K9QRT" }, candidates);
  assert.deepEqual(result, { status: "ambiguous", paymentId: "pay-1" });
});

test("matchTransaction returns unmatched when no reference appears in the description", () => {
  const result = matchTransaction({ amount: 1500, description: "PRZELEW WLASNY BEZ TYTULU" }, candidates);
  assert.deepEqual(result, { status: "unmatched" });
});

test("matchTransaction avoids float rounding false negatives on the amount comparison", () => {
  const result = matchTransaction({ amount: 0.1 + 0.2, description: "EP-4F7K9QRT" }, [{ id: "pay-3", amount: 0.3, paymentReference: "EP-4F7K9QRT" }]);
  assert.deepEqual(result, { status: "matched", paymentId: "pay-3" });
});

test("matchTransaction refuses automatic approval when currency or direction differs", () => {
  const transaction = { amount: 1500, description: "EP-4F7K9QRT", currency: "EUR", direction: "debit" };
  const candidate = [{ ...candidates[0], currency: "PLN", direction: "credit" }];
  assert.deepEqual(matchTransaction(transaction, candidate), { status: "ambiguous", paymentId: "pay-1" });
});
