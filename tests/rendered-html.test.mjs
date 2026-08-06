import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Epito landing page with demo and B2B entry points", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Epito, portal klienta dla biur rachunkowych<\/title>/i);
  assert.match(html, /Mniej pytań o podatki/);
  assert.match(html, /href="\/panel"/);
  assert.match(html, /href="\/logowanie"/);
  assert.match(html, /"@type":"SoftwareApplication"/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("keeps public demo and production data flows explicitly separated", async () => {
  const [demo, supervisor, workspace, login, compose, migration] = await Promise.all([
    readFile(new URL("../app/panel/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/supervisor/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/workspace/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/logowanie/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../docker-compose.yml", import.meta.url), "utf8"),
    readFile(new URL("../db/postgres/migrations/0002_auth_and_supervisor.sql", import.meta.url), "utf8"),
  ]);

  assert.match(demo, /const initialPayments/);
  assert.match(supervisor, /\/api\/supervisor\/tenants/);
  assert.match(workspace, /\/api\/workspace\/overview/);
  assert.match(login, /\/api\/auth\/login/);
  assert.match(compose, /pull_policy:\s*\$\{EPITO_PULL_POLICY:-build\}/);
  assert.match(compose, /SUPERVISOR_PASSWORD_FILE:\s*\/run\/secrets\/supervisor_password/);
  assert.match(compose, /supervisor_password:\s*\n\s*environment:\s*EPITO_SUPERVISOR_PASSWORD/);
  assert.match(compose, /redis_password:\s*\n\s*environment:\s*EPITO_REDIS_PASSWORD/);
  assert.match(migration, /create table user_credentials/);
  assert.match(migration, /epito_create_tenant_with_owner/);
  assert.match(migration, /app_is_supervisor/);
  assert.doesNotMatch(compose, /EPITO_SUPERVISOR_EMAIL:\s*[^$\n]+@gmail\.com/i);
  assert.doesNotMatch(compose, /^[ \t]*SUPERVISOR_PASSWORD:\s*[^$\n]+/m);
});
