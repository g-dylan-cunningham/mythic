import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import {
  canAccessFeature,
  dashboardTools,
} from "@/lib/features/feature-flags";

function labelize(value: string | null | undefined) {
  return value?.replaceAll("_", " ") ?? "Not assigned";
}

function displayName(profile: {
  email: string | null;
  full_name: string | null;
}) {
  return profile.full_name || profile.email || "there";
}

export default async function DashboardPage() {
  const { profile, user } = await getCurrentProfile();

  if (!profile?.is_active) {
    return (
      <main className="min-h-screen bg-neutral-950 px-6 py-12 text-neutral-50">
        <div className="mx-auto max-w-3xl rounded-lg border border-amber-400/30 bg-amber-400/10 p-6">
          <h1 className="text-xl font-semibold">Account inactive</h1>
          <p className="mt-2 text-sm leading-6 text-amber-100/80">
            Your account exists, but it is not currently enabled for Mythic
            tools. Ask an administrator to review your account.
          </p>
        </div>
      </main>
    );
  }

  const availableTools = dashboardTools.filter((tool) =>
    canAccessFeature(profile, tool.feature),
  );

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-8">
        <header className="border-b border-neutral-800 pb-6">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-400">
            Dashboard
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Hi, {displayName(profile)}.
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
            Your dashboard shows the Mythic tools currently available to your
            team.
          </p>
        </header>

        <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
            Your account
          </p>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-md border border-neutral-800 bg-neutral-950 px-4 py-3">
              <p className="text-neutral-500">Department</p>
              <p className="mt-1 font-medium capitalize text-neutral-100">
                {labelize(profile.department)}
              </p>
            </div>
            <div className="rounded-md border border-neutral-800 bg-neutral-950 px-4 py-3">
              <p className="text-neutral-500">Role</p>
              <p className="mt-1 font-medium capitalize text-neutral-100">
                {labelize(profile.role)}
              </p>
            </div>
            <div className="rounded-md border border-neutral-800 bg-neutral-950 px-4 py-3">
              <p className="text-neutral-500">Authority</p>
              <p className="mt-1 font-medium capitalize text-neutral-100">
                {labelize(profile.authority_level)}
              </p>
            </div>
          </div>
          <p className="mt-4 text-xs text-neutral-500">
            Signed in as {profile.email ?? user.email}.
          </p>
        </section>

        <section>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
            Your tools
          </p>
          <h2 className="mt-2 text-2xl font-semibold">Available now</h2>

          {availableTools.length > 0 ? (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {availableTools.map((tool) => (
                <Link
                  className="block rounded-lg border border-neutral-800 bg-neutral-900 p-5 transition hover:border-emerald-500/60 hover:bg-neutral-800"
                  href={tool.href}
                  key={tool.feature}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                    {tool.source}
                  </p>
                  <h3 className="mt-3 text-xl font-semibold">{tool.label}</h3>
                  <p className="mt-2 text-sm leading-6 text-neutral-400">
                    {tool.description}
                  </p>
                  <p className="mt-5 text-sm font-medium text-emerald-300">
                    Open tool
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-900 p-5">
              <p className="font-medium text-neutral-200">
                No tools are assigned to your account yet.
              </p>
              <p className="mt-2 text-sm leading-6 text-neutral-400">
                Your account and permissions are ready. New tools will appear
                here as they are rolled out to your department.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
