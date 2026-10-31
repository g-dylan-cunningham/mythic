import Link from "next/link";
import { HoverText } from "@/app/components/hover-text";
import { PendingSubmitButton } from "@/app/components/pending-submit-button";
import { signOut } from "@/app/login/actions";
import {
  type AppRole,
  type AuthorityLevel,
  type OrgDepartment,
} from "@/lib/auth/roles";
import { hoverTextCopy } from "@/lib/ui-copy/hovertext-copy";
import { createClient } from "@/utils/supabase/server";
import { canAccessFeature, dashboardTools } from "@/lib/features/feature-flags";

type HeaderProfile = {
  authority_level: AuthorityLevel;
  department: OrgDepartment | null;
  email: string | null;
  full_name: string | null;
  role: AppRole;
  is_active: boolean;
};

function displayName(profile: HeaderProfile | null, email: string | undefined) {
  return profile?.full_name || profile?.email || email || "Signed in";
}

function roleLabel(role: string | undefined) {
  return role ? role.replaceAll("_", " ") : "active";
}

function orgLabel(profile: HeaderProfile | null) {
  if (!profile?.department) {
    return roleLabel(profile?.role);
  }

  return `${profile.department.replaceAll("_", " ")} · ${profile.authority_level.replaceAll("_", " ")}`;
}

export async function GlobalAppHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("email,full_name,role,department,authority_level,is_active")
    .eq("id", user.id)
    .maybeSingle<HeaderProfile>();

  const tools = dashboardTools.filter((tool) => canAccessFeature(profile, tool.feature));

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-800 bg-neutral-950/95 text-neutral-50 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-3">
        <HoverText text={hoverTextCopy.links.dashboard}>
          <Link
            className="text-sm font-semibold tracking-tight text-neutral-100 hover:text-emerald-300"
            href="/dashboard"
          >
            Mythic Operations
          </Link>
        </HoverText>

        <div className="flex min-w-0 items-center gap-3">
          {tools.length > 0 ? (
            <details className="group relative">
              <summary className="cursor-pointer rounded-md border border-neutral-700 px-3 py-2 text-sm">Tools</summary>
              <nav aria-label="Tools" className="absolute right-0 z-50 mt-2 w-64 rounded-lg border border-neutral-800 bg-neutral-950 p-2 shadow-xl">
                {tools.map((tool) => (
                  <Link key={tool.href} href={tool.href} className="block rounded-md px-3 py-3 text-sm text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800">
                    {tool.label}
                  </Link>
                ))}
              </nav>
            </details>
          ) : null}
          <Link
            className="hidden text-sm text-neutral-400 hover:text-neutral-200 sm:block"
            href="/dashboard"
          >
            Dashboard
          </Link>
          <div className="min-w-0 text-right">
            <p className="truncate text-sm font-medium text-neutral-100">
              {displayName(profile, user.email)}
            </p>
            <p className="truncate text-xs capitalize text-neutral-500">
              {orgLabel(profile)}
            </p>
          </div>
          <form action={signOut}>
            <HoverText text={hoverTextCopy.actions.signOut}>
              <PendingSubmitButton
                className="h-9 rounded-md border border-neutral-700 px-3 text-sm font-medium text-neutral-200 transition hover:border-neutral-500"
                pendingLabel="Signing out"
              >
                Logout
              </PendingSubmitButton>
            </HoverText>
          </form>
        </div>
      </div>
    </header>
  );
}
