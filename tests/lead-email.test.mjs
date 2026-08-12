import assert from "node:assert/strict";
import test from "node:test";
import { buildLeadNotificationEmailHtml, leadCompaniesRangeLabel } from "../scripts/lib/lead-email.mjs";

test("leadCompaniesRangeLabel maps known ranges and falls back for unknown ones", () => {
  assert.equal(leadCompaniesRangeLabel("do 30"), "do 30 firm");
  assert.equal(leadCompaniesRangeLabel("31-100"), "31-100 firm");
  assert.equal(leadCompaniesRangeLabel(undefined), "nie podano");
  assert.equal(leadCompaniesRangeLabel("mystery"), "mystery");
});

test("buildLeadNotificationEmailHtml includes name, email, and companies range", () => {
  const html = buildLeadNotificationEmailHtml({ name: "Anna Kowalska", email: "anna@twojebiuro.pl", companiesRange: "31-100" });
  assert.match(html, /Anna Kowalska/);
  assert.match(html, /anna@twojebiuro\.pl/);
  assert.match(html, /31-100 firm/);
});

test("buildLeadNotificationEmailHtml escapes untrusted-looking values", () => {
  const html = buildLeadNotificationEmailHtml({ name: "<script>alert(1)</script>", email: "a@b.pl", companiesRange: "do 30" });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});
