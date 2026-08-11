export const platformRoles = [
  "helpdesk",
  "moderator",
  "developer",
  "admin",
  "supervisor",
] as const;

export type PlatformRole = "none" | "support" | (typeof platformRoles)[number];

export const platformRoleLabels: Record<PlatformRole, string> = {
  none: "Brak dostępu do platformy",
  support: "Helpdesk",
  helpdesk: "Helpdesk",
  moderator: "Moderator",
  developer: "Developer",
  admin: "Administrator",
  supervisor: "Supervisor",
};

export const platformRoleDescriptions: Record<(typeof platformRoles)[number], string> = {
  helpdesk: "Obsługa zgłoszeń i podgląd danych organizacji.",
  moderator: "Kontrola treści, zdarzeń i zgłoszeń wymagających reakcji.",
  developer: "Diagnostyka techniczna oraz naprawy w panelach klientów.",
  admin: "Zarządzanie organizacjami i operacjami platformy.",
  supervisor: "Pełna kontrola nad platformą, zespołem i uprawnieniami.",
};

const platformStaffRoleSet = new Set<string>(["support", ...platformRoles]);

export function isPlatformStaff(role: string | null | undefined): role is Exclude<PlatformRole, "none"> {
  return Boolean(role && platformStaffRoleSet.has(role));
}

export function canManagePlatformTeam(role: string | null | undefined) {
  return role === "supervisor";
}

export function canManageOrganizations(role: string | null | undefined) {
  return role === "supervisor";
}

export function canEditTenantData(role: string | null | undefined) {
  return role === "supervisor" || role === "admin" || role === "developer";
}

export function platformTenantAccessLabel(role: string | null | undefined) {
  return canEditTenantData(role) ? "Podgląd i edycja" : "Bezpieczny podgląd";
}
