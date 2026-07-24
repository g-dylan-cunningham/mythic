import Link from "next/link";
import { redirect } from "next/navigation";
import { HoverText } from "@/app/components/hover-text";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { canManageProduction } from "@/lib/auth/roles";
import {
  productionQueues,
  taskMatchesQueue,
} from "@/lib/production-workflow/queues";
import { hoverTextCopy } from "@/lib/ui-copy/hovertext-copy";
import { createClient } from "@/utils/supabase/server";

type CommandCenterJob = {
  id: string;
  job_name: string;
  customer_name: string | null;
  current_phase_label_snapshot: string;
  due_date: string | null;
  priority: string;
  difficulty_score: number | null;
  estimated_minutes: number | null;
  production_tasks: Array<{
    assigned_role: string | null;
    blocked_reason: string | null;
    status: string;
    track_snapshot: string;
  }>;
};

function dueSoon(value: string | null) {
  if (!value) {
    return false;
  }

  const dueDate = new Date(`${value}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const soon = new Date(today);
  soon.setDate(today.getDate() + 3);

  return dueDate <= soon;
}

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (hours === 0) {
    return `${remainder}m`;
  }

  if (remainder === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainder}m`;
}

function formatDate(value: string | null) {
  if (!value) {
    return "No date";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

export default async function ProductionCommandCenterPage() {
  const { profile } = await getCurrentProfile();

  if (!profile || !profile.is_active || !canManageProduction(profile.role)) {
    redirect("/production");
  }

  const supabase = await createClient();
  const { data: jobs, error } = await supabase
    .from("production_jobs")
    .select(
      "id,job_name,customer_name,current_phase_label_snapshot,due_date,priority,difficulty_score,estimated_minutes,production_tasks(assigned_role,blocked_reason,status,track_snapshot)",
    )
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(100)
    .returns<CommandCenterJob[]>();

  if (error) {
    throw new Error(error.message);
  }

  const activeJobs = (jobs ?? []).filter(
    (job) => job.current_phase_label_snapshot !== "Production complete",
  );
  const tasks = activeJobs.flatMap((job) =>
    job.production_tasks.map((task) => ({
      ...task,
      job,
    })),
  );
  const blockedTasks = tasks.filter((task) => task.status === "blocked");
  const dueSoonJobs = activeJobs.filter((job) => dueSoon(job.due_date));
  const estimatedMinutes = activeJobs.reduce(
    (total, job) => total + (job.estimated_minutes ?? 0),
    0,
  );
  const highDifficultyJobs = activeJobs.filter(
    (job) => (job.difficulty_score ?? 0) >= 4,
  );
  const phaseCounts = new Map<string, number>();

  for (const job of activeJobs) {
    phaseCounts.set(
      job.current_phase_label_snapshot,
      (phaseCounts.get(job.current_phase_label_snapshot) ?? 0) + 1,
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-8">
        <header className="flex flex-col justify-between gap-4 border-b border-neutral-800 pb-6 sm:flex-row sm:items-end">
          <div>
            <HoverText text={hoverTextCopy.links.production}>
              <Link
                className="text-sm text-neutral-400 hover:text-neutral-200"
                href="/production"
              >
                Production
              </Link>
            </HoverText>
            <p className="mt-6 text-sm font-medium uppercase tracking-[0.2em] text-emerald-400">
              Command Center
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">
              Production lead view
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
              Medium-build control surface for queue health, blockers,
              receiving, fulfillment, estimates, and difficult work.
            </p>
          </div>
          <HoverText text={hoverTextCopy.actions.manualPrintavoSync}>
            <Link
              className="h-10 rounded-md border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 transition hover:border-emerald-500/60"
              href="/reporting/printavo-sync"
            >
              Manual Printavo sync
            </Link>
          </HoverText>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-sm text-neutral-400">Active jobs</p>
            <p className="mt-2 text-2xl font-semibold">{activeJobs.length}</p>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-sm text-neutral-400">Due soon</p>
            <p className="mt-2 text-2xl font-semibold">{dueSoonJobs.length}</p>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-sm text-neutral-400">Blocked tasks</p>
            <p className="mt-2 text-2xl font-semibold">{blockedTasks.length}</p>
          </div>
          <HoverText className="block" text={hoverTextCopy.production.estimate}>
            <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <p className="text-sm text-neutral-400">Estimated work</p>
              <p className="mt-2 text-2xl font-semibold">
                {formatMinutes(estimatedMinutes)}
              </p>
            </div>
          </HoverText>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          {productionQueues.map((queue) => {
            const queueTasks = tasks.filter((task) =>
              taskMatchesQueue(task, queue),
            );
            const uniqueJobs = new Set(queueTasks.map((task) => task.job.id));

            return (
              <HoverText
                className="block"
                key={queue.key}
                text={hoverTextCopy.links.queue}
              >
                <Link
                  className="block rounded-lg border border-neutral-800 bg-neutral-900 p-5 transition hover:border-emerald-500/60 hover:bg-neutral-800"
                  href={queue.href}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold">{queue.label}</h2>
                      <p className="mt-2 text-sm leading-6 text-neutral-400">
                        {queue.description}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-semibold">
                        {queueTasks.length}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {uniqueJobs.size} jobs
                      </p>
                    </div>
                  </div>
                </Link>
              </HoverText>
            );
          })}
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
            <h2 className="text-lg font-semibold">Jobs by phase</h2>
            <div className="mt-4 divide-y divide-neutral-800">
              {Array.from(phaseCounts.entries()).map(([phase, count]) => (
                <div className="flex justify-between py-3 text-sm" key={phase}>
                  <span className="text-neutral-300">{phase}</span>
                  <span className="font-mono text-neutral-100">{count}</span>
                </div>
              ))}
              {phaseCounts.size === 0 ? (
                <p className="py-3 text-sm text-neutral-400">No active jobs.</p>
              ) : null}
            </div>
          </div>

          <HoverText className="block" text={hoverTextCopy.production.watchList}>
            <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
            <h2 className="text-lg font-semibold">Watch list</h2>
            <div className="mt-4 divide-y divide-neutral-800">
              {[...highDifficultyJobs, ...dueSoonJobs]
                .filter(
                  (job, index, list) =>
                    list.findIndex((candidate) => candidate.id === job.id) ===
                    index,
                )
                .slice(0, 8)
                .map((job) => (
                  <Link
                    className="block py-3 text-sm hover:text-emerald-300"
                    href={`/production/${job.id}`}
                    key={job.id}
                  >
                    <div className="flex justify-between gap-4">
                      <span className="font-medium text-neutral-100">
                        {job.job_name}
                      </span>
                      <span className="font-mono text-neutral-400">
                        {formatDate(job.due_date)}
                      </span>
                    </div>
                    <p className="mt-1 text-neutral-500">
                      {job.customer_name ?? "No customer"} · difficulty{" "}
                      {job.difficulty_score ?? "n/a"}
                    </p>
                  </Link>
                ))}
            </div>
            </div>
          </HoverText>
        </section>
      </div>
    </main>
  );
}
