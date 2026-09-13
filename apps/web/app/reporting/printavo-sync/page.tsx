import Link from "next/link";
import { redirect } from "next/navigation";
import { HoverText } from "@/app/components/hover-text";
import { PendingSubmitButton } from "@/app/components/pending-submit-button";
import { runManualPrintavoFetch } from "@/app/reporting/printavo-sync/actions";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { canAccessFeature } from "@/lib/features/feature-flags";
import { hoverTextCopy } from "@/lib/ui-copy/hovertext-copy";
import { createClient } from "@/utils/supabase/server";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type SyncRunRow = {
  error_message: string | null;
  finished_at: string | null;
  id: string;
  records_seen: number;
  records_upserted: number;
  source: string;
  started_at: string;
  status: string;
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

export default async function PrintavoSyncPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { profile } = await getCurrentProfile();

  if (!canAccessFeature(profile, "printavoFetching")) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const supabase = await createClient();
  const { data: syncRuns, error: syncRunsError } = await supabase
    .from("sync_runs")
    .select(
      "id,source,status,started_at,finished_at,records_seen,records_upserted,error_message",
    )
    .eq("source", "printavo_orders")
    .order("started_at", { ascending: false })
    .limit(8)
    .returns<SyncRunRow[]>();

  if (syncRunsError) {
    throw new Error(syncRunsError.message);
  }

  const error = valueOf(params.error);
  const pages = valueOf(params.pages);
  const scanned = valueOf(params.scanned);
  const snapshots = valueOf(params.snapshots);

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-8">
        <header className="border-b border-neutral-800 pb-6">
          <HoverText text={hoverTextCopy.links.dashboard}>
            <Link
              className="text-sm text-neutral-400 hover:text-neutral-200"
              href="/dashboard"
            >
              Dashboard
            </Link>
          </HoverText>
          <p className="mt-6 text-sm font-medium uppercase tracking-[0.2em] text-emerald-400">
            Printavo
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Order fetching
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
            Fetch recent Printavo orders and preserve source snapshots for
            Mythic tools. This action does not create production jobs or tasks.
          </p>
        </header>

        <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-semibold">Manual fetch</h2>
              <p className="mt-1 text-sm text-neutral-400">
                Fetches one page of ten recently updated orders with retry and
                rate-limit backoff.
              </p>
            </div>
            <form action={runManualPrintavoFetch}>
              <HoverText text={hoverTextCopy.actions.manualPrintavoSync}>
                <PendingSubmitButton
                  className="h-10 rounded-md border border-emerald-500/50 bg-emerald-500/10 px-4 text-sm font-medium text-emerald-100 transition hover:border-emerald-400"
                  pendingLabel="Fetching"
                >
                  Fetch orders
                </PendingSubmitButton>
              </HoverText>
            </form>
          </div>

          {error ? (
            <p className="mt-4 rounded-md border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-100">
              {error}
            </p>
          ) : null}

          {pages || scanned || snapshots ? (
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-md border border-neutral-800 bg-neutral-950 p-3">
                <p className="text-neutral-500">Pages fetched</p>
                <p className="mt-1 font-mono">{pages ?? 0}</p>
              </div>
              <div className="rounded-md border border-neutral-800 bg-neutral-950 p-3">
                <p className="text-neutral-500">Orders fetched</p>
                <p className="mt-1 font-mono">{scanned ?? 0}</p>
              </div>
              <div className="rounded-md border border-neutral-800 bg-neutral-950 p-3">
                <p className="text-neutral-500">Snapshots stored</p>
                <p className="mt-1 font-mono">{snapshots ?? 0}</p>
              </div>
            </div>
          ) : null}
        </section>

        <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="text-lg font-semibold">Recent fetches</h2>
          <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-800">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-neutral-800 text-left text-neutral-200">
                <tr>
                  <th className="px-3 py-2 font-semibold">Started</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 text-right font-semibold">
                    Orders
                  </th>
                  <th className="px-3 py-2 text-right font-semibold">
                    Snapshots
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
                    <td className="px-3 py-2 capitalize text-neutral-200">
                      {run.status}
                    </td>
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
      </div>
    </main>
  );
}
