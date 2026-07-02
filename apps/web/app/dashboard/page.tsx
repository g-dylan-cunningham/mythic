import Link from "next/link";
import { PendingSubmitButton } from "@/app/components/pending-submit-button";
import { signOut } from "@/app/login/actions";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import {
  canManageUsers,
  canUseCustomerPortal,
  canUseOperations,
  canViewReports,
} from "@/lib/auth/roles";
import { reports } from "@/lib/reporting/reports";

const roleLabels = {
  owner: "Owner",
  admin: "Admin",
  staff: "Staff",
  customer: "Customer",
};

export default async function DashboardPage() {
  const { profile, user } = await getCurrentProfile();

  if (!profile || !profile.is_active) {
    return (
      <main className="min-h-screen bg-neutral-950 px-6 py-12 text-neutral-50">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-2xl font-semibold">Account pending</h1>
          <p className="mt-3 text-neutral-400">
            Your login works, but your Mythic profile is not active yet.
          </p>
          <form action={signOut} className="mt-6">
            <PendingSubmitButton
              className="rounded-md border border-neutral-700 px-4 py-2 text-sm"
              pendingLabel="Signing out"
            >
              Sign out
            </PendingSubmitButton>
          </form>
        </div>
      </main>
    );
  }

  const role = profile.role;
  const reportCount = canViewReports(role) ? reports.length : 0;

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
            <PendingSubmitButton
              className="h-10 rounded-md border border-neutral-700 px-4 text-sm font-medium transition hover:border-neutral-500"
              pendingLabel="Signing out"
            >
              Sign out
            </PendingSubmitButton>
          </form>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-sm text-neutral-400">Current role</p>
            <p className="mt-2 text-xl font-semibold">{roleLabels[role]}</p>
          </div>
          <Link
            className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 transition hover:border-emerald-500/60 hover:bg-neutral-800"
            href="/reporting"
          >
            <p className="text-sm text-neutral-400">Reports</p>
            <p className="mt-2 text-xl font-semibold">
              {canViewReports(role) ? `${reportCount} Available` : "Hidden"}
            </p>
          </Link>
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
          <Link
            className="rounded-lg border border-neutral-800 bg-neutral-900 p-5 transition hover:border-emerald-500/60"
            href="/reporting"
          >
            <h2 className="text-lg font-semibold">Reporting</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-400">
              Printavo sales reconciliation and S&S inventory test reports live
              here while we shape the data model.
            </p>
            <p className="mt-4 text-sm font-medium text-emerald-300">
              Open reporting
            </p>
          </Link>
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
      </div>
    </main>
  );
}
