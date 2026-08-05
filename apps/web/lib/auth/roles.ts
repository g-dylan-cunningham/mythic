export const APP_ROLES = [
  "owner",
  "admin",
  "staff",
  "customer",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const ORG_DEPARTMENTS = [
  "sales",
  "design",
  "production",
  "logistics",
  "operations",
] as const;

export type OrgDepartment = (typeof ORG_DEPARTMENTS)[number];

export const AUTHORITY_LEVELS = [
  "junior_employee",
  "senior_employee",
  "junior_manager",
  "senior_manager",
  "director",
] as const;

export type AuthorityLevel = (typeof AUTHORITY_LEVELS)[number];

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: AppRole;
  department: OrgDepartment | null;
  authority_level: AuthorityLevel;
  is_active: boolean;
};

export function isDepartmentManager(
  authorityLevel: AuthorityLevel | null | undefined,
) {
  return (
    authorityLevel === "junior_manager" ||
    authorityLevel === "senior_manager" ||
    authorityLevel === "director"
  );
}

export function canServeAsDepartmentManager(
  role: AppRole | null | undefined,
  authorityLevel: AuthorityLevel | null | undefined,
) {
  return (
    (role === "owner" || role === "admin" || role === "staff") &&
    isDepartmentManager(authorityLevel)
  );
}

export function isSeniorDepartmentMember(
  authorityLevel: AuthorityLevel | null | undefined,
) {
  return (
    authorityLevel === "senior_employee" ||
    authorityLevel === "junior_manager" ||
    authorityLevel === "senior_manager" ||
    authorityLevel === "director"
  );
}

export function canManageUsers(role: AppRole | null | undefined) {
  return role === "owner" || role === "admin";
}

export function canViewOwnerProductionOverview(
  role: AppRole | null | undefined,
) {
  return role === "owner";
}

export function canViewReports(role: AppRole | null | undefined) {
  return role === "owner" || role === "admin";
}

export function canUseOperations(role: AppRole | null | undefined) {
  return role === "owner" || role === "admin" || role === "staff";
}

export function canManageProduction(role: AppRole | null | undefined) {
  return role === "owner" || role === "admin" || role === "staff";
}

export function canWorkProductionTasks(role: AppRole | null | undefined) {
  return canManageProduction(role);
}

export function canUseCustomerPortal(role: AppRole | null | undefined) {
  return role === "customer";
}
