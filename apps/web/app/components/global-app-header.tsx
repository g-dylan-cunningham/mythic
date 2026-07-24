import Link from "next/link";
import { HoverText } from "@/app/components/hover-text";
import { PendingSubmitButton } from "@/app/components/pending-submit-button";
import { signOut } from "@/app/login/actions";
import { hoverTextCopy } from "@/lib/ui-copy/hovertext-copy";
import { createClient } from "@/utils/supabase/server";

type HeaderProfile = {
  email: string | null;
  full_name: string | null;
  role: string;
};

function displayName(profile: HeaderProfile | null, email: string | undefined) {
  return profile?.full_name || profile?.email || email || "Signed in";
}

function roleLabel(role: string | undefined) {
  return role ? role.replaceAll("_", " ") : "active";
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
    .select("email,full_name,role")
    .eq("id", user.id)
    .maybeSingle<HeaderProfile>();

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-800 bg-neutral-950/95 text-neutral-50 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
        <HoverText text={hoverTextCopy.links.dashboard}>
          <Link
            className="text-sm font-semibold tracking-tight text-neutral-100 hover:text-emerald-300"
            href="/dashboard"
          >
            Mythic Operations
          </Link>
        </HoverText>

        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0 text-right">
            <p className="truncate text-sm font-medium text-neutral-100">
              {displayName(profile, user.email)}
            </p>
            <p className="truncate text-xs capitalize text-neutral-500">
              {roleLabel(profile?.role)}
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
