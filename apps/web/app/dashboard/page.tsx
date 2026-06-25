import { redirect } from "next/navigation";
import { signOut } from "@/app/login/actions";
import { testPrintavoConnection } from "@/lib/printavo/client";
import {
  canManageUsers,
  canUseCustomerPortal,
  canUseOperations,
  canViewReports,
  type Profile,
} from "@/lib/auth/roles";
import { createClient } from "@/utils/supabase/server";

const roleLabels = {
  owner: "Owner",
  admin: "Admin",
  staff: "Staff",
  customer: "Customer",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,email,full_name,role,is_active")
    .eq("id", user.id)
    .single<Profile>();

  if (!profile || !profile.is_active) {
    return (
      <main className="min-h-screen bg-neutral-950 px-6 py-12 text-neutral-50">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-2xl font-semibold">Account pending</h1>
          <p className="mt-3 text-neutral-400">
            Your login works, but your Mythic profile is not active yet.
          </p>
          <form action={signOut} className="mt-6">
            <button className="rounded-md border border-neutral-700 px-4 py-2 text-sm">
              Sign out
            </button>
          </form>
        </div>
      </main>
    );
  }

  const role = profile.role;
  const printavoConnection = canViewReports(role)
    ? await testPrintavoConnection()
    : null;

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-8">
        <header className="flex flex-col justify-between gap-4 border-b border-neutral-800 pb-6 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-400">
              Mythic Operations
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">
              Dashboard
            </h1>
            <p className="mt-2 text-sm text-neutral-400">
              Signed in as {profile.email ?? user.email}
            </p>
          </div>
          <form action={signOut}>
            <button className="h-10 rounded-md border border-neutral-700 px-4 text-sm font-medium transition hover:border-neutral-500">
              Sign out
            </button>
          </form>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-sm text-neutral-400">Current role</p>
            <p className="mt-2 text-xl font-semibold">{roleLabels[role]}</p>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-sm text-neutral-400">Reports</p>
            <p className="mt-2 text-xl font-semibold">
              {canViewReports(role) ? "Enabled" : "Hidden"}
            </p>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-sm text-neutral-400">Operations</p>
            <p className="mt-2 text-xl font-semibold">
              {canUseOperations(role) ? "Enabled" : "Hidden"}
            </p>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-sm text-neutral-400">Users</p>
            <p className="mt-2 text-xl font-semibold">
              {canManageUsers(role) ? "Enabled" : "Hidden"}
            </p>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
            <h2 className="text-lg font-semibold">Reporting</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-400">
              Weekly sales, monthly sales, approvals, and reconciliation will
              live here once Printavo sync starts.
            </p>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
            <h2 className="text-lg font-semibold">Procurement</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-400">
              Approved jobs, garment requirements, mappings, and S&S inventory
              checks will live here.
            </p>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
            <h2 className="text-lg font-semibold">
              {canUseCustomerPortal(role) ? "Customer portal" : "Access model"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-neutral-400">
              Owner, admin, staff, and customer roles are reserved in the data
              model, even though the first product surface is internal.
            </p>
          </div>
        </section>

        {printavoConnection ? (
          <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-lg font-semibold">Printavo connection</h2>
                <p className="mt-1 text-sm text-neutral-400">
                  Read-only account endpoint test.
                </p>
              </div>
              <span
                className={
                  printavoConnection.ok
                    ? "rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-xs font-medium text-emerald-200"
                    : "rounded-md border border-red-400/30 bg-red-400/10 px-2 py-1 text-xs font-medium text-red-200"
                }
              >
                {printavoConnection.ok ? "Connected" : "Failed"}
              </span>
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-neutral-500">Endpoint</dt>
                <dd className="mt-1 font-mono text-neutral-200">
                  {printavoConnection.url ?? "Not requested"}
                </dd>
              </div>
              <div>
                <dt className="text-neutral-500">Status</dt>
                <dd className="mt-1 font-mono text-neutral-200">
                  {printavoConnection.status ?? "n/a"}
                </dd>
              </div>
            </dl>
            <pre className="mt-4 max-h-96 overflow-auto rounded-md border border-neutral-800 bg-neutral-950 p-4 text-xs leading-5 text-neutral-300">
              {JSON.stringify(
                printavoConnection.ok
                  ? printavoConnection.data
                  : {
                      error: printavoConnection.error,
                      data: printavoConnection.data,
                    },
                null,
                2,
              )}
            </pre>
          </section>
        ) : null}
      </div>
    </main>
  );
}
