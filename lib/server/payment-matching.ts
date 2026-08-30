export type MatchableTransaction = {
  amount: number;
  description: string;
  currency?: string;
  direction?: "credit" | "debit";
};

export type MatchCandidatePayment = {
  id: string;
  amount: number;
  paymentReference: string;
  currency?: string;
  direction?: "credit" | "debit";
};

export type MatchResult = { status: "matched"; paymentId: string } | { status: "unmatched" } | { status: "ambiguous"; paymentId: string };

function normalize(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Amounts come from Postgres numeric(18,2) as strings-turned-numbers or
// floats parsed from bank text — compare in integer grosze to avoid float
// rounding (0.1 + 0.2 !== 0.3) producing a false "amount mismatch".
function amountsEqual(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}

// References are unique per tenant (enforced by a DB constraint), so at most
// one candidate should ever match. If the reference is found but the amount
// is off — a partial payment, or the client fat-fingered the transfer — this
// deliberately never auto-approves; it surfaces as "ambiguous" for a human
// to resolve instead of silently marking the wrong money as received.
export function matchTransaction(transaction: MatchableTransaction, candidates: MatchCandidatePayment[]): MatchResult {
  const normalizedDescription = normalize(transaction.description);
  const found = candidates.find((candidate) => {
    const normalizedReference = normalize(candidate.paymentReference);
    return normalizedReference.length > 0 && normalizedDescription.includes(normalizedReference);
  });
  if (!found) return { status: "unmatched" };
  const currencyMatches = !transaction.currency || !found.currency || transaction.currency.toUpperCase() === found.currency.toUpperCase();
  const directionMatches = !transaction.direction || !found.direction || transaction.direction === found.direction;
  if (amountsEqual(transaction.amount, found.amount) && currencyMatches && directionMatches) return { status: "matched", paymentId: found.id };
  return { status: "ambiguous", paymentId: found.id };
}
