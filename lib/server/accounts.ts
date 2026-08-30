import { getPool, withUserTransaction } from "./database";
import type { PlatformRole } from "../platform-access";

export type LoginIdentity = {
  userId: string;
  email: string;
  fullName: string;
  platformRole: PlatformRole;
  passwordHash: string;
  authVersion: number;
};

export type TenantMembership = {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  membershipRole: "owner" | "admin" | "accountant" | "employee" | "viewer";
  accessScope: "tenant" | "assigned_companies";
};

export async function findLoginIdentity(email: string): Promise<LoginIdentity | null> {
  const pool = await getPool();
  const result = await pool.query<{
    user_id: string;
    email: string;
    full_name: string;
    platform_role: LoginIdentity["platformRole"];
    password_hash: string;
    auth_version: number;
  }>("select * from epito_get_login_identity($1)", [email]);

  const row = result.rows[0];
  if (!row) return null;
  return {
    userId: row.user_id,
    email: row.email,
    fullName: row.full_name,
    platformRole: row.platform_role,
    passwordHash: row.password_hash,
    authVersion: row.auth_version,
  };
}

export async function listUserMemberships(userId: string): Promise<TenantMembership[]> {
  return withUserTransaction(userId, async (client) => {
    const result = await client.query<{
      tenant_id: string;
      tenant_slug: string;
      tenant_name: string;
      membership_role: TenantMembership["membershipRole"];
      access_scope: TenantMembership["accessScope"];
    }>("select * from epito_user_memberships()");

    return result.rows.map((row) => ({
      tenantId: row.tenant_id,
      tenantSlug: row.tenant_slug,
      tenantName: row.tenant_name,
      membershipRole: row.membership_role,
      accessScope: row.access_scope,
    }));
  });
}
