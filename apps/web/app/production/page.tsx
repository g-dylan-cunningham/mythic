import Link from "next/link";
import { redirect } from "next/navigation";
import { HoverText } from "@/app/components/hover-text";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import {
  canUseOperations,
  canViewOwnerProductionOverview,
} from "@/lib/auth/roles";
import { hoverTextCopy } from "@/lib/ui-copy/hovertext-copy";
import { createClient } from "@/utils/supabase/server";

type ProductionJobRow = {
  id: string;
  printavo_order_id: number;
  printavo_order_number: string | null;
  printavo_status_name: string | null;
  customer_name: string | null;
  job_name: string;
  current_phase_label_snapshot: string;
  due_date: string | null;
  priority: string;
  created_at: string;
  production_tasks: Array<{
    status: string;
  }>;
};

function formatDate(value: string | null) {
  if (!value) {
    return "No date";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function taskSummary(tasks: ProductionJobRow["production_tasks"]) {
  const total = tasks.length;
  const complete = tasks.filter((task) => task.status === "complete").length;
  const blocked = tasks.filter((task) => task.status === "blocked").length;

  return { blocked, complete, total };
}

export default async function ProductionJobsPage() {
  const { profile } = await getCurrentProfile();

  if (!profile || !profile.is_active || !canUseOperations(profile.role)) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const { data: jobs, error } = await supabase
    .from("production_jobs")
    .select(
      "id,printavo_order_id,printavo_order_number,printavo_status_name,customer_name,job_name,current_phase_label_snapshot,due_date,priority,created_at,production_tasks(status)",
    )
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<ProductionJobRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-8">
        <header className="flex flex-col justify-between gap-4 border-b border-neutral-800 pb-6 sm:flex-row sm:items-end">
          <div>
            <HoverText text={hoverTextCopy.links.dashboard}>
              <Link
                className="text-sm text-neutral-400 hover:text-neutral-200"
                href="/dashboard"
              >
                Dashboard
              </Link>
            </HoverText>
            <p className="mt-6 text-sm font-medium uppercase tracking-[0.2em] text-emerald-400">
              Production
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">
              Jobs
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
              Minimal production queue for validating Printavo-to-Mythic flow,
              task dependencies, suggestions, and event logging.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canViewOwnerProductionOverview(profile.role) ? (
              <HoverText text={hoverTextCopy.links.ownerOverview}>
                <Link
                  className="h-10 rounded-md border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 transition hover:border-emerald-500/60"
                  href="/production/owner-overview"
                >
                  Owner overview
                </Link>
              </HoverText>
            ) : null}
            <HoverText text={hoverTextCopy.links.commandCenter}>
              <Link
                className="h-10 rounded-md border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 transition hover:border-emerald-500/60"
                href="/production/command-center"
              >
                Command center
              </Link>
            </HoverText>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <HoverText className="block" text={hoverTextCopy.production.commandCenterCard}>
            <Link
              className="block rounded-lg border border-neutral-800 bg-neutral-900 p-5 transition hover:border-emerald-500/60 hover:bg-neutral-800"
              href="/production/command-center"
            >
              <h2 className="text-lg font-semibold">Lead command center</h2>
              <p className="mt-2 text-sm leading-6 text-neutral-400">
                Queue health, blockers, estimates, receiving, fulfillment, and
                jobs that need lead attention.
              </p>
            </Link>
          </HoverText>
          {canViewOwnerProductionOverview(profile.role) ? (
            <HoverText
              className="block"
              text={hoverTextCopy.links.ownerOverview}
            >
              <Link
                className="block rounded-lg border border-neutral-800 bg-neutral-900 p-5 transition hover:border-emerald-500/60 hover:bg-neutral-800"
                href="/production/owner-overview"
              >
                <h2 className="text-lg font-semibold">Owner overview</h2>
                <p className="mt-2 text-sm leading-6 text-neutral-400">
                  Read-only Kanban-style board for scanning customers, order
                  context, phases, completion, and blockers.
                </p>
              </Link>
            </HoverText>
          ) : null}
          <HoverText className="block" text={hoverTextCopy.production.receivingCard}>
            <Link
              className="block rounded-lg border border-neutral-800 bg-neutral-900 p-5 transition hover:border-emerald-500/60 hover:bg-neutral-800"
              href="/production/queues/receiving"
            >
              <h2 className="text-lg font-semibold">Receiving queue</h2>
              <p className="mt-2 text-sm leading-6 text-neutral-400">
                Apparel-side tasks that need receipt, exception handling, or
                release toward production.
              </p>
            </Link>
          </HoverText>
          <HoverText className="block" text={hoverTextCopy.links.blockedQueue}>
            <Link
              className="block rounded-lg border border-neutral-800 bg-neutral-900 p-5 transition hover:border-emerald-500/60 hover:bg-neutral-800"
              href="/production/queues/blocked"
            >
              <h2 className="text-lg font-semibold">Blocked work</h2>
              <p className="mt-2 text-sm leading-6 text-neutral-400">
                Any task blocked by missing goods, art issues, supplier
                problems, or leadership decisions.
              </p>
            </Link>
          </HoverText>
        </section>

        <section className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-neutral-800 text-left text-neutral-200">
              <tr>
                <th className="px-4 py-3 font-semibold">Job</th>
                <th className="px-4 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 font-semibold">Phase</th>
                <th className="px-4 py-3 font-semibold">Due</th>
                <th className="px-4 py-3 font-semibold">Tasks</th>
                <th className="px-4 py-3 font-semibold">Printavo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800 bg-neutral-950">
              {(jobs ?? []).map((job) => {
                const summary = taskSummary(job.production_tasks);

                return (
                  <tr className="hover:bg-neutral-900" key={job.id}>
                    <td className="px-4 py-3">
                      <HoverText text={hoverTextCopy.links.jobDetail}>
                        <Link
                          className="font-medium text-neutral-50 hover:text-emerald-300"
                          href={`/production/${job.id}`}
                        >
                          {job.job_name}
                        </Link>
                      </HoverText>
                      <p className="mt-1 text-xs uppercase tracking-wide text-neutral-500">
                        {job.priority}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-neutral-300">
                      {job.customer_name ?? "Unassigned"}
                    </td>
                    <td className="px-4 py-3 text-neutral-200">
                      {job.current_phase_label_snapshot}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-neutral-300">
                      {formatDate(job.due_date)}
                    </td>
                    <td className="px-4 py-3 text-neutral-300">
                      <span className="font-mono">
                        {summary.complete}/{summary.total}
                      </span>
                      {summary.blocked > 0 ? (
                        <HoverText text={hoverTextCopy.production.blockedBadge}>
                          <span className="ml-2 rounded-md border border-red-400/30 bg-red-400/10 px-2 py-1 text-xs text-red-100">
                            {summary.blocked} blocked
                          </span>
                        </HoverText>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-mono text-neutral-300">
                        {job.printavo_order_number ?? job.printavo_order_id}
                      </p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {job.printavo_status_name ?? "No status"}
                      </p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {(jobs ?? []).length === 0 ? (
            <div className="border-t border-neutral-800 px-4 py-10 text-center text-sm text-neutral-400">
              No production jobs yet. Run the manual Printavo sync to create the
              first one.
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
