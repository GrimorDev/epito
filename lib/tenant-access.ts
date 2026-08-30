// Centralizes tenant-membership-role read/write gates so the client panel,
// the office back-office, and the API routes agree on the same boundaries.
// Previously each call site (or nothing at all, for the overview read
// endpoint and the /office page) re-implemented its own ad-hoc role list.
import { canEditTenantData } from "./platform-access";

export type MembershipRole = "owner" | "admin" | "accountant" | "employee" | "viewer";

const MANAGE_ROLES: MembershipRole[] = ["owner", "admin"];
const FINANCIAL_ROLES: MembershipRole[] = ["owner", "admin", "accountant"];
const FINANCIAL_READ_ROLES: MembershipRole[] = ["owner", "admin", "accountant", "viewer"];
const DOCUMENT_ROLES: MembershipRole[] = ["owner", "admin", "accountant", "employee"];

function has(role: string | null | undefined, list: MembershipRole[]) {
  return Boolean(role && list.includes(role as MembershipRole));
}

// Team roster and organization settings — owner/admin only.
export function canManageTeam(role: string | null | undefined, platformRole?: string | null) {
  return has(role, MANAGE_ROLES) || canEditTenantData(platformRole);
}
export const canManageSettings = canManageTeam;

// Payments (incl. bank account numbers) and KSeF connection data — full
// read for owner/admin/accountant/viewer; employee never sees this.
export function canViewFinancials(role: string | null | undefined, platformRole?: string | null) {
  return has(role, FINANCIAL_READ_ROLES) || canEditTenantData(platformRole);
}

// Creating/editing payments, triggering KSeF sync, issuing/retrying/
// cancelling invoices — owner/admin/accountant only, never employee/viewer.
export function canMutateFinancials(role: string | null | undefined, platformRole?: string | null) {
  return has(role, FINANCIAL_ROLES) || canEditTenantData(platformRole);
}

// Uploading/importing documents — owner/admin/accountant/employee; viewer
// stays read-only everywhere.
export function canMutateDocuments(role: string | null | undefined, platformRole?: string | null) {
  return has(role, DOCUMENT_ROLES) || canEditTenantData(platformRole);
}

// Support messaging (client <-> office tickets) — owner/admin/accountant/
// employee; viewer has zero actions anywhere, including here. Shares
// DOCUMENT_ROLES's role list today but is its own named entitlement since
// the two are conceptually distinct (a future change to one shouldn't
// silently change the other).
export function canUseMessaging(role: string | null | undefined, platformRole?: string | null) {
  return has(role, DOCUMENT_ROLES) || canEditTenantData(platformRole);
}

// /office back-office: owner/admin/accountant, plus audited technical data
// operators. Helpdesk and moderators stay in the support surface and never
// receive financial/document access.
export function canAccessOffice(role: string | null | undefined, platformRole?: string | null) {
  return has(role, FINANCIAL_ROLES) || canEditTenantData(platformRole);
}
