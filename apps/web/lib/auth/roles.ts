export const APP_ROLES = ["owner", "admin", "staff", "customer"] as const;

export type AppRole = (typeof APP_ROLES)[number];

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: AppRole;
  is_active: boolean;
};

export function canManageUsers(role: AppRole | null | undefined) {
  return role === "owner" || role === "admin";
}

export function canViewReports(role: AppRole | null | undefined) {
  return role === "owner" || role === "admin";
}

export function canUseOperations(role: AppRole | null | undefined) {
  return role === "owner" || role === "admin" || role === "staff";
}

export function canUseCustomerPortal(role: AppRole | null | undefined) {
  return role === "customer";
}
