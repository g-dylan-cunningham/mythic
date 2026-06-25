type SupabaseTarget = "development" | "local";

type SupabaseConfig = {
  publishableKey: string;
  target: SupabaseTarget;
  url: string;
};

const TARGETS = ["development", "local"] as const;

function readTarget(): SupabaseTarget {
  const target = process.env.NEXT_PUBLIC_SUPABASE_TARGET;

  if (!target) {
    return "development";
  }

  if (TARGETS.includes(target as SupabaseTarget)) {
    return target as SupabaseTarget;
  }

  throw new Error(
    `Invalid NEXT_PUBLIC_SUPABASE_TARGET "${target}". Expected "development" or "local".`,
  );
}

export function getSupabaseConfig(): SupabaseConfig {
  const target = readTarget();
  const prefix =
    target === "local"
      ? "NEXT_PUBLIC_SUPABASE_LOCAL"
      : "NEXT_PUBLIC_SUPABASE_DEV";

  const url =
    process.env[`${prefix}_URL`] ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env[`${prefix}_PUBLISHABLE_KEY`] ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      `Missing Supabase ${target} configuration. Check apps/web/.env.local.`,
    );
  }

  return {
    publishableKey,
    target,
    url,
  };
}
