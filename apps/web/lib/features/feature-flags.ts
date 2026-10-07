import type { Profile } from "@/lib/auth/roles";
import { apparelOrderingRollout } from "../apparel-ordering/rollout.ts";

export const FEATURE_KEYS = [
  "apparelOrdering",
  "ssInventory",
  "printavoFetching",
  "productionSuite",
  "operationalReports",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];
export type FeatureFlags = Record<FeatureKey, boolean>;

const retainedFeaturesEnabled =
  process.env.MYTHIC_ENABLE_RETAINED_FEATURES === "true";

export const featureFlags: FeatureFlags = Object.freeze({
  apparelOrdering: apparelOrderingRollout.featureEnabled,
  ssInventory: true,
  printavoFetching: true,
  productionSuite: retainedFeaturesEnabled,
  operationalReports: retainedFeaturesEnabled,
});

export type FeatureAccessProfile = Pick<
  Profile,
  "authority_level" | "department" | "is_active" | "role"
>;

export function canAccessFeatureWithFlags(
  profile: FeatureAccessProfile | null | undefined,
  feature: FeatureKey,
  flags: FeatureFlags,
) {
  if (!profile?.is_active || !flags[feature]) {
    return false;
  }

  if (profile.role === "owner" || profile.role === "admin") {
    return true;
  }

  switch (feature) {
    case "apparelOrdering":
      return false;
    case "ssInventory":
      return profile.role === "staff" && profile.department === "sales";
    case "productionSuite":
      return profile.role === "staff";
    case "printavoFetching":
    case "operationalReports":
      return false;
  }
}

export function canAccessFeature(
  profile: FeatureAccessProfile | null | undefined,
  feature: FeatureKey,
) {
  return canAccessFeatureWithFlags(profile, feature, featureFlags);
}

export const dashboardTools = [
  {
    description:
      "Look up S&S styles and SKUs, check availability, and review warehouse quantities.",
    feature: "ssInventory",
    href: "/reporting/ss-inventory",
    label: "S&S Inventory",
    source: "S&S Activewear",
  },
  {
    description:
      "Fetch recent Printavo orders and inspect ingestion health without creating production work.",
    feature: "printavoFetching",
    href: "/reporting/printavo-sync",
    label: "Printavo Fetching",
    source: "Printavo",
  },
] as const satisfies ReadonlyArray<{
  description: string;
  feature: FeatureKey;
  href: string;
  label: string;
  source: string;
}>;
