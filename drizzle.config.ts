import { defineConfig } from "drizzle-kit";

export default defineConfig({
  // Legacy optional schema generator for the Cloudflare Sites demo only.
  // Docker and Portainer use db/postgres/migrations as the source of truth.
  out: "./drizzle",
  schema: "./db/schema.ts",
  dialect: "sqlite",
});
