import Link from "next/link";
import { redirect } from "next/navigation";
import { HoverText } from "@/app/components/hover-text";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { canViewOwnerProductionOverview } from "@/lib/auth/roles";
import { hoverTextCopy } from "@/lib/ui-copy/hovertext-copy";
import { createClient } from "@/utils/supabase/server";

type OwnerOverviewJob = {
  id: string;
  printavo_order_id: number;
  printavo_order_number: string | null;
  printavo_status_name: string | null;
  customer_name: string | null;
  job_name: string;
  current_phase_key: string;
  current_phase_label_snapshot: string;
  due_date: string | null;
  priority: string;
  difficulty_score: number | null;
  estimated_minutes: number | null;
  created_at: string;
  production_tasks: Array<{
    blocked_reason: string | null;
    label_snapshot: string;
    status: string;
    track_snapshot: string;
    workflow_step_key: string;
    workflow_steps: {
      sort_order: number;
    } | null;
  }>;
};

type PhaseGroup = {
  key: string;
  label: string;
  jobs: OwnerOverviewJob[];
};

const productionPhaseOrder = [
  { key: "phase.needs_sourcing", label: "Needs sourcing" },
  { key: "phase.awaiting_goods", label: "Awaiting goods" },
  { key: "phase.goods_received", label: "Goods received" },
  { key: "phase.ready_for_production", label: "Ready for production" },
  { key: "phase.scheduled", label: "Scheduled" },
  { key: "phase.in_production", label: "In production" },
  { key: "phase.finishing_qc", label: "Finishing / QC" },
  { key: "phase.production_complete", label: "Production complete" },
] as const;

const phaseGateDependencies: Record<string, string[]> = {
  "phase.awaiting_goods": ["apparel.order_apparel"],
  "phase.goods_received": ["apparel.apparel_received"],
  "phase.ready_for_production": [
    "apparel.apparel_received",
    "art.ready_to_burn_screens",
    "prep.burn_screens",
    "prep.confirm_print_locations",
    "prep.confirm_ink_color_count",
    "prep.confirm_garment_handling",
    "prep.confirm_finishing_requirements",
    "prep.estimate_difficulty_time",
  ],
  "phase.scheduled": ["prep.assign_press_day"],
  "phase.in_production": ["production.in_production"],
  "phase.finishing_qc": ["production.finishing_qc"],
  "phase.production_complete": ["production.production_complete"],
};

const workstreamOrder = [
  { key: "artwork", label: "Artwork" },
  { key: "apparel", label: "Apparel" },
  { key: "production_prep", label: "Production Prep" },
  { key: "production", label: "Production" },
  { key: "customer_fulfillment", label: "Fulfillment" },
] as const;

const priorityClasses: Record<string, string> = {
  high: "border-orange-300/30 bg-orange-300/10 text-orange-100",
  low: "border-neutral-700 bg-neutral-900 text-neutral-300",
  normal: "border-neutral-700 bg-neutral-900 text-neutral-300",
  rush: "border-red-300/40 bg-red-300/10 text-red-100",
};

function formatDate(value: string | null) {
  if (!value) {
    return "No due date";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function formatMinutes(minutes: number | null) {
  if (!minutes) {
    return "No estimate";
  }

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

function taskSummary(tasks: OwnerOverviewJob["production_tasks"]) {
  const total = tasks.length;
  const complete = tasks.filter((task) => task.status === "complete").length;
  const blocked = tasks.filter((task) => task.status === "blocked").length;
  const percent = total === 0 ? 0 : Math.round((complete / total) * 100);

  return { blocked, complete, percent, total };
}

function sortedTasks(tasks: OwnerOverviewJob["production_tasks"]) {
  return [...tasks].sort(
    (left, right) =>
      (left.workflow_steps?.sort_order ?? 0) -
        (right.workflow_steps?.sort_order ?? 0) ||
      left.label_snapshot.localeCompare(right.label_snapshot),
  );
}

function workstreamStatuses(tasks: OwnerOverviewJob["production_tasks"]) {
  const tasksByWorkstream = new Map<string, OwnerOverviewJob["production_tasks"]>();

  for (const task of sortedTasks(tasks)) {
    tasksByWorkstream.set(task.track_snapshot, [
      ...(tasksByWorkstream.get(task.track_snapshot) ?? []),
      task,
    ]);
  }

  return workstreamOrder.map((workstream) => {
    const workstreamTasks = tasksByWorkstream.get(workstream.key) ?? [];
    const complete = workstreamTasks.filter(
      (task) => task.status === "complete" || task.status === "skipped",
    ).length;
    const blocked = workstreamTasks.filter(
      (task) => task.status === "blocked",
    ).length;
    const nextTask = workstreamTasks.find(
      (task) => task.status !== "complete" && task.status !== "skipped",
    );
    const isComplete =
      workstreamTasks.length > 0 && complete === workstreamTasks.length;

    return {
      blocked,
      complete,
      isComplete,
      key: workstream.key,
      label: workstream.label,
      nextTask,
      total: workstreamTasks.length,
    };
  });
}

function isCompleteEnough(task: OwnerOverviewJob["production_tasks"][number] | undefined) {
  return task?.status === "complete" || task?.status === "skipped";
}

function nextPhaseFor(currentPhaseKey: string) {
  const currentIndex = productionPhaseOrder.findIndex(
    (phase) => phase.key === currentPhaseKey,
  );

  if (currentIndex === -1) {
    return null;
  }

  return productionPhaseOrder[currentIndex + 1] ?? null;
}

function nextPhaseGate(
  job: OwnerOverviewJob,
  streams: ReturnType<typeof workstreamStatuses>,
) {
  const nextPhase = nextPhaseFor(job.current_phase_key);

  if (!nextPhase) {
    return {
      isReady: true,
      missingTasks: [],
      nextPhase: null,
      otherOpenStreams: streams.filter((stream) => !stream.isComplete),
    };
  }

  const tasksByWorkflowKey = new Map(
    job.production_tasks.map((task) => [task.workflow_step_key, task]),
  );

  const missingTasks = (phaseGateDependencies[nextPhase.key] ?? [])
    .map((workflowStepKey) => ({
      task: tasksByWorkflowKey.get(workflowStepKey),
      workflowStepKey,
    }))
    .filter(({ task }) => !isCompleteEnough(task));
  const missingWorkstreamKeys = new Set(
    missingTasks.map(({ task }) => task?.track_snapshot).filter(Boolean),
  );
  const otherOpenStreams = streams.filter(
    (stream) => !stream.isComplete && !missingWorkstreamKeys.has(stream.key),
  );

  return {
    isReady: missingTasks.length === 0,
    missingTasks,
    nextPhase,
    otherOpenStreams,
  };
}

function blockedTasks(tasks: OwnerOverviewJob["production_tasks"]) {
  return sortedTasks(tasks)
    .filter((task) => task.status === "blocked")
    .slice(0, 2);
}

function groupJobsByPhase(jobs: OwnerOverviewJob[]) {
  const groups = new Map<string, PhaseGroup>(
    productionPhaseOrder.map((phase) => [
      phase.key,
      { jobs: [], key: phase.key, label: phase.label },
    ]),
  );

  for (const job of jobs) {
    const existing = groups.get(job.current_phase_key);

    if (existing) {
      existing.jobs.push(job);
    } else {
      groups.set(job.current_phase_key, {
        jobs: [job],
        key: job.current_phase_key,
        label: job.current_phase_label_snapshot,
      });
    }
  }

  return Array.from(groups.values()).sort((left, right) => {
    const leftIndex = productionPhaseOrder.findIndex(
      (phase) => phase.key === left.key,
    );
    const rightIndex = productionPhaseOrder.findIndex(
      (phase) => phase.key === right.key,
    );

    if (leftIndex === -1 && rightIndex === -1) {
      return left.label.localeCompare(right.label);
    }

    if (leftIndex === -1) {
      return 1;
    }

    if (rightIndex === -1) {
      return -1;
    }

    return leftIndex - rightIndex;
  });
}

function dueStatus(value: string | null) {
  if (!value) {
    return "text-neutral-400";
  }

  const dueDate = new Date(`${value}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const soon = new Date(today);
  soon.setDate(today.getDate() + 3);

  if (dueDate < today) {
    return "text-red-200";
  }

  if (dueDate <= soon) {
    return "text-orange-200";
  }

  return "text-neutral-300";
}

export default async function OwnerProductionOverviewPage() {
  const { profile } = await getCurrentProfile();

  if (
    !profile ||
    !profile.is_active ||
    !canViewOwnerProductionOverview(profile.role)
  ) {
    redirect("/production");
  }

  const supabase = await createClient();
  const { data: jobs, error } = await supabase
    .from("production_jobs")
    .select(
      "id,printavo_order_id,printavo_order_number,printavo_status_name,customer_name,job_name,current_phase_key,current_phase_label_snapshot,due_date,priority,difficulty_score,estimated_minutes,created_at,production_tasks(blocked_reason,label_snapshot,status,track_snapshot,workflow_step_key,workflow_steps(sort_order))",
    )
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(150)
    .returns<OwnerOverviewJob[]>();

  if (error) {
    throw new Error(error.message);
  }

  const allJobs = jobs ?? [];
  const groups = groupJobsByPhase(allJobs);
  const blockedJobCount = allJobs.filter(
    (job) => taskSummary(job.production_tasks).blocked > 0,
  ).length;
  const totalTasks = allJobs.reduce(
    (count, job) => count + job.production_tasks.length,
    0,
  );
  const completedTasks = allJobs.reduce(
    (count, job) =>
      count +
      job.production_tasks.filter((task) => task.status === "complete").length,
    0,
  );
  const overallPercent =
    totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50">
      <div className="mx-auto flex max-w-[1800px] flex-col gap-8 px-6 py-8">
        <header className="flex flex-col justify-between gap-4 border-b border-neutral-800 pb-6 lg:flex-row lg:items-end">
          <div>
            <div className="flex flex-wrap gap-4 text-sm text-neutral-400">
              <HoverText text={hoverTextCopy.links.dashboard}>
                <Link href="/dashboard" className="hover:text-neutral-200">
                  Dashboard
                </Link>
              </HoverText>
              <HoverText text={hoverTextCopy.links.production}>
                <Link href="/production" className="hover:text-neutral-200">
                  Production
                </Link>
              </HoverText>
            </div>
            <p className="mt-6 text-sm font-medium uppercase tracking-[0.2em] text-emerald-400">
              Owner Overview
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">
              Production status board
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
              Read-only scan of every active production job by customer, order,
              phase, completion, blockers, and next visible task.
            </p>
          </div>

          <section className="grid gap-2 text-sm sm:grid-cols-3 lg:min-w-[520px]">
            <div className="rounded-md border border-neutral-800 bg-neutral-900 p-3">
              <p className="text-neutral-500">Jobs</p>
              <p className="mt-1 text-2xl font-semibold">{allJobs.length}</p>
            </div>
            <div className="rounded-md border border-neutral-800 bg-neutral-900 p-3">
              <p className="text-neutral-500">Blocked</p>
              <p className="mt-1 text-2xl font-semibold">{blockedJobCount}</p>
            </div>
            <div className="rounded-md border border-neutral-800 bg-neutral-900 p-3">
              <p className="text-neutral-500">Tasks complete</p>
              <p className="mt-1 text-2xl font-semibold">{overallPercent}%</p>
            </div>
          </section>
        </header>

        <section className="flex gap-4 overflow-x-auto pb-3">
          {groups.map((group) => (
            <details
              className="group flex max-h-[calc(100vh-220px)] min-w-[320px] flex-1 basis-[360px] flex-col rounded-lg border border-neutral-800 bg-neutral-900"
              key={group.key}
              open={group.jobs.length > 0}
            >
              <summary className="cursor-pointer list-none border-b border-neutral-800 px-4 py-3 [&::-webkit-details-marker]:hidden">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-neutral-100">
                      {group.label}
                    </h2>
                    <p className="mt-1 font-mono text-xs text-neutral-500">
                      {group.key}
                    </p>
                  </div>
                  <span className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 font-mono text-xs text-neutral-300">
                    {group.jobs.length}
                  </span>
                  <span
                    aria-hidden="true"
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-neutral-700 bg-neutral-950 text-sm leading-none text-neutral-300 transition group-open:hidden"
                    title="Expand phase"
                  >
                    +
                  </span>
                  <span
                    aria-hidden="true"
                    className="hidden h-7 w-7 items-center justify-center rounded-md border border-neutral-700 bg-neutral-950 text-sm leading-none text-neutral-300 transition group-open:flex"
                    title="Collapse phase"
                  >
                    -
                  </span>
                </div>
              </summary>

              <div className="flex flex-col gap-3 overflow-y-auto p-3">
                {group.jobs.map((job) => {
                  const summary = taskSummary(job.production_tasks);
                  const blocked = blockedTasks(job.production_tasks);
                  const streams = workstreamStatuses(job.production_tasks);
                  const gate = nextPhaseGate(job, streams);

                  return (
                    <HoverText
                      className="block"
                      key={job.id}
                      text={hoverTextCopy.production.ownerJobCard}
                    >
                      <Link
                        className="block rounded-lg border border-neutral-800 bg-neutral-950 p-4 transition hover:border-emerald-500/60 hover:bg-neutral-900"
                        href={`/production/${job.id}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-base font-semibold text-neutral-100">
                              {job.customer_name ?? "No customer"}
                            </p>
                            <p className="mt-1 line-clamp-2 text-sm leading-5 text-neutral-400">
                              {job.job_name}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded-md border px-2 py-1 text-xs font-medium ${
                              priorityClasses[job.priority] ??
                              priorityClasses.normal
                            }`}
                          >
                            {job.priority}
                          </span>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded-md border border-neutral-800 bg-neutral-900 p-2">
                            <p className="text-neutral-500">Printavo</p>
                            <p className="mt-1 truncate font-mono text-neutral-200">
                              {job.printavo_order_number ??
                                job.printavo_order_id}
                            </p>
                          </div>
                          <div className="rounded-md border border-neutral-800 bg-neutral-900 p-2">
                            <p className="text-neutral-500">Due</p>
                            <p
                              className={`mt-1 font-mono ${dueStatus(
                                job.due_date,
                              )}`}
                            >
                              {formatDate(job.due_date)}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-neutral-400">
                              {summary.complete}/{summary.total} tasks
                            </span>
                            <span className="font-mono text-neutral-300">
                              {summary.percent}%
                            </span>
                          </div>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-800">
                            <div
                              className="h-full rounded-full bg-emerald-400"
                              style={{ width: `${summary.percent}%` }}
                            />
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2 text-xs">
                          <span className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-neutral-300">
                            {formatMinutes(job.estimated_minutes)}
                          </span>
                          <span className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-neutral-300">
                            difficulty {job.difficulty_score ?? "n/a"}
                          </span>
                          {summary.blocked > 0 ? (
                            <span className="rounded-md border border-red-400/30 bg-red-400/10 px-2 py-1 text-red-100">
                              {summary.blocked} blocked
                            </span>
                          ) : null}
                        </div>

                        {blocked.length > 0 ? (
                          <div className="mt-4 rounded-md border border-red-400/20 bg-red-400/10 p-3">
                            <p className="text-xs font-medium uppercase tracking-wide text-red-100">
                              Blocked
                            </p>
                            <div className="mt-2 space-y-2">
                              {blocked.map((task) => (
                                <p
                                  className="text-xs leading-5 text-red-100"
                                  key={`${job.id}:${task.label_snapshot}`}
                                >
                                  {task.label_snapshot}
                                  {task.blocked_reason
                                    ? `: ${task.blocked_reason}`
                                    : ""}
                                </p>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        <div className="mt-4">
                          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                            Next phase gate
                          </p>
                          <div
                            className={`mt-2 rounded-md border p-3 ${
                              gate.isReady
                                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                                : "border-red-400/30 bg-red-400/10 text-red-100"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-xs font-semibold">
                                  {gate.nextPhase
                                    ? `Next: ${gate.nextPhase.label}`
                                    : "Final phase"}
                                </p>
                                <p className="mt-1 text-[11px] opacity-85">
                                  {gate.isReady
                                    ? "Ready to advance"
                                    : `${gate.missingTasks.length} requirement${
                                        gate.missingTasks.length === 1
                                          ? ""
                                          : "s"
                                      } remaining`}
                                </p>
                              </div>
                            </div>
                            {!gate.isReady ? (
                              <div className="mt-2 space-y-1">
                                {gate.missingTasks.slice(0, 4).map((item) => (
                                  <p
                                    className="truncate text-[11px]"
                                    key={item.workflowStepKey}
                                  >
                                    Needs:{" "}
                                    {item.task?.label_snapshot ??
                                      item.workflowStepKey}
                                  </p>
                                ))}
                                {gate.missingTasks.length > 4 ? (
                                  <p className="text-[11px] opacity-80">
                                    +{gate.missingTasks.length - 4} more
                                  </p>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </div>

                        {gate.otherOpenStreams.length > 0 ? (
                          <p className="mt-3 text-xs leading-5 text-neutral-500">
                            Other open workstreams:{" "}
                            {gate.otherOpenStreams
                              .map((stream) => stream.label)
                              .join(" · ")}
                          </p>
                        ) : null}

                        <p className="mt-4 truncate text-xs text-neutral-500">
                          Printavo status:{" "}
                          {job.printavo_status_name ?? "No status"}
                        </p>
                      </Link>
                    </HoverText>
                  );
                })}
                {group.jobs.length === 0 ? (
                  <p className="rounded-md border border-neutral-800 bg-neutral-950 px-3 py-6 text-center text-sm text-neutral-500">
                    No jobs in this phase.
                  </p>
                ) : null}
              </div>
            </details>
          ))}
        </section>

        {groups.length === 0 ? (
          <section className="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-10 text-center text-sm text-neutral-400">
            No production jobs yet. Run the manual Printavo sync to create the
            first production job.
          </section>
        ) : null}
      </div>
    </main>
  );
}
