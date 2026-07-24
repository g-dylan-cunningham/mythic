import Link from "next/link";
import { redirect } from "next/navigation";
import { HoverText } from "@/app/components/hover-text";
import { PendingSubmitButton } from "@/app/components/pending-submit-button";
import { runManualPrintavoProductionSync } from "@/app/reporting/printavo-sync/actions";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { canViewReports } from "@/lib/auth/roles";
import { hoverTextCopy } from "@/lib/ui-copy/hovertext-copy";
import { createClient } from "@/utils/supabase/server";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type SyncRunRow = {
  id: string;
  source: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  records_seen: number;
  records_upserted: number;
  error_message: string | null;
};

type ProductionJobRow = {
  id: string;
  printavo_order_id: number;
  printavo_order_number: string | null;
  printavo_status_name: string | null;
  customer_name: string | null;
  job_name: string;
  current_phase_label_snapshot: string;
  created_at: string;
};

function valueOf(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "n/a";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function PrintavoProductionSyncPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { profile } = await getCurrentProfile();

  if (!profile || !profile.is_active || !canViewReports(profile.role)) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const supabase = await createClient();
  const [{ data: syncRuns }, { data: jobs }] = await Promise.all([
    supabase
      .from("sync_runs")
      .select(
        "id,source,status,started_at,finished_at,records_seen,records_upserted,error_message",
      )
      .eq("source", "printavo_orders")
      .order("started_at", { ascending: false })
      .limit(8)
      .returns<SyncRunRow[]>(),
    supabase
      .from("production_jobs")
      .select(
        "id,printavo_order_id,printavo_order_number,printavo_status_name,customer_name,job_name,current_phase_label_snapshot,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(8)
      .returns<ProductionJobRow[]>(),
  ]);
  const error = valueOf(params.error);
  const created = valueOf(params.created);
  const existing = valueOf(params.existing);
  const scanned = valueOf(params.scanned);
  const paid = valueOf(params.paid);

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-8">
        <header className="border-b border-neutral-800 pb-6">
          <div className="flex gap-4 text-sm text-neutral-400">
            <HoverText text={hoverTextCopy.links.dashboard}>
              <Link href="/dashboard" className="hover:text-neutral-200">
                Dashboard
              </Link>
            </HoverText>
            <HoverText text={hoverTextCopy.links.reporting}>
              <Link href="/reporting" className="hover:text-neutral-200">
                Reporting
              </Link>
            </HoverText>
          </div>
          <p className="mt-6 text-sm font-medium uppercase tracking-[0.2em] text-emerald-400">
            Printavo Sync POC
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Production job sync
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
            Fetches a small page of recently updated Printavo orders, stores raw
            payloads, detects paid orders, and creates Mythic production jobs
            idempotently.
          </p>
        </header>

        <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-semibold">Manual sync</h2>
              <p className="mt-1 text-sm text-neutral-400">
                POC defaults: one page, ten orders, retry/backoff for 429s.
              </p>
            </div>
            <form action={runManualPrintavoProductionSync}>
              <HoverText text={hoverTextCopy.actions.manualPrintavoSync}>
                <PendingSubmitButton
                  className="h-10 rounded-md border border-emerald-500/50 bg-emerald-500/10 px-4 text-sm font-medium text-emerald-100 transition hover:border-emerald-400"
                  pendingLabel="Syncing"
                >
                  Run sync
                </PendingSubmitButton>
              </HoverText>
            </form>
          </div>

          {error ? (
            <p className="mt-4 rounded-md border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-100">
              {error}
            </p>
          ) : null}

          {created || existing || scanned || paid ? (
            <HoverText
              className="mt-4 grid gap-3 text-sm sm:grid-cols-4"
              text={hoverTextCopy.reporting.syncStats}
            >
              <div className="rounded-md border border-neutral-800 bg-neutral-950 p-3">
                <p className="text-neutral-500">Orders scanned</p>
                <p className="mt-1 font-mono">{scanned ?? 0}</p>
              </div>
              <div className="rounded-md border border-neutral-800 bg-neutral-950 p-3">
                <p className="text-neutral-500">Paid orders</p>
                <p className="mt-1 font-mono">{paid ?? 0}</p>
              </div>
              <div className="rounded-md border border-neutral-800 bg-neutral-950 p-3">
                <p className="text-neutral-500">Jobs created</p>
                <p className="mt-1 font-mono">{created ?? 0}</p>
              </div>
              <div className="rounded-md border border-neutral-800 bg-neutral-950 p-3">
                <p className="text-neutral-500">Existing jobs</p>
                <p className="mt-1 font-mono">{existing ?? 0}</p>
              </div>
            </HoverText>
          ) : null}
        </section>

        <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="text-lg font-semibold">Recent sync runs</h2>
          <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-800">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-neutral-800 text-left text-neutral-200">
                <tr>
                  <th className="px-3 py-2 font-semibold">Started</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 text-right font-semibold">Seen</th>
                  <th className="px-3 py-2 text-right font-semibold">
                    Created
                  </th>
                  <th className="px-3 py-2 font-semibold">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800 bg-neutral-950">
                {(syncRuns ?? []).map((run) => (
                  <tr key={run.id}>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-neutral-200">
                      {formatDateTime(run.started_at)}
                    </td>
                    <td className="px-3 py-2 text-neutral-200">{run.status}</td>
                    <td className="px-3 py-2 text-right font-mono text-neutral-200">
                      {run.records_seen}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-neutral-200">
                      {run.records_upserted}
                    </td>
                    <td className="px-3 py-2 text-neutral-400">
                      {run.error_message ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="text-lg font-semibold">Recent production jobs</h2>
          <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-800">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-neutral-800 text-left text-neutral-200">
                <tr>
                  <th className="px-3 py-2 font-semibold">Printavo</th>
                  <th className="px-3 py-2 font-semibold">Job</th>
                  <th className="px-3 py-2 font-semibold">Customer</th>
                  <th className="px-3 py-2 font-semibold">Phase</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800 bg-neutral-950">
                {(jobs ?? []).map((job) => (
                  <tr key={job.id}>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-neutral-200">
                      {job.printavo_order_number ?? job.printavo_order_id}
                    </td>
                    <td className="px-3 py-2 text-neutral-200">
                      {job.job_name}
                    </td>
                    <td className="px-3 py-2 text-neutral-400">
                      {job.customer_name ?? ""}
                    </td>
                    <td className="px-3 py-2 text-neutral-200">
                      {job.current_phase_label_snapshot}
                    </td>
                    <td className="px-3 py-2 text-neutral-400">
                      {job.printavo_status_name ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
