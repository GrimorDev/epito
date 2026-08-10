import assert from "node:assert/strict";
import test from "node:test";
import { resolveTenantSlugFromHost } from "../lib/server/auth.ts";

const ORIGINAL_BASE_DOMAIN = process.env.EPITO_BASE_DOMAIN;

test.after(() => {
  if (ORIGINAL_BASE_DOMAIN === undefined) delete process.env.EPITO_BASE_DOMAIN;
  else process.env.EPITO_BASE_DOMAIN = ORIGINAL_BASE_DOMAIN;
});

test("resolveTenantSlugFromHost extracts the tenant slug from a portal subdomain", () => {
  process.env.EPITO_BASE_DOMAIN = "epito.pl";
  assert.equal(resolveTenantSlugFromHost("client2393.epito.pl"), "client2393");
  assert.equal(resolveTenantSlugFromHost("client2393.epito.pl:443"), "client2393");
});

test("resolveTenantSlugFromHost returns null for the bare base domain", () => {
  process.env.EPITO_BASE_DOMAIN = "epito.pl";
  assert.equal(resolveTenantSlugFromHost("epito.pl"), null);
  assert.equal(resolveTenantSlugFromHost("epito.pl:443"), null);
});

test("resolveTenantSlugFromHost returns null for reserved/non-tenant subdomains", () => {
  process.env.EPITO_BASE_DOMAIN = "epito.pl";
  for (const host of ["www.epito.pl", "app.epito.pl", "admin.epito.pl", "api.epito.pl", "mail.epito.pl", "ftp.epito.pl"]) {
    assert.equal(resolveTenantSlugFromHost(host), null, host);
  }
});

test("resolveTenantSlugFromHost returns null for an unrelated domain", () => {
  process.env.EPITO_BASE_DOMAIN = "epito.pl";
  assert.equal(resolveTenantSlugFromHost("client2393.evil.com"), null);
  assert.equal(resolveTenantSlugFromHost("notepito.pl"), null);
});

test("resolveTenantSlugFromHost rejects malformed or too-short labels", () => {
  process.env.EPITO_BASE_DOMAIN = "epito.pl";
  assert.equal(resolveTenantSlugFromHost("ab.epito.pl"), null); // shorter than the 3-char minimum
  assert.equal(resolveTenantSlugFromHost("Client2393.epito.pl"), "client2393"); // case-insensitive match
  assert.equal(resolveTenantSlugFromHost("sub.client2393.epito.pl"), null); // nested subdomain, not a single label
});

test("resolveTenantSlugFromHost is a safe no-op when EPITO_BASE_DOMAIN isn't configured", () => {
  delete process.env.EPITO_BASE_DOMAIN;
  assert.equal(resolveTenantSlugFromHost("client2393.epito.pl"), null);
  assert.equal(resolveTenantSlugFromHost("localhost:3000"), null);
});
