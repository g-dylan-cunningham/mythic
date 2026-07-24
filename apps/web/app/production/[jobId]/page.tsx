import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { HoverText } from "@/app/components/hover-text";
import { PendingSubmitButton } from "@/app/components/pending-submit-button";
import {
  advanceProductionPhase,
  blockProductionTask,
  completeProductionTask,
  reopenProductionTask,
  unblockProductionTask,
} from "@/app/production/actions";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import {
  canManageProduction,
  canUseOperations,
  canWorkProductionTasks,
} from "@/lib/auth/roles";
import { suggestNextActions } from "@/lib/production-workflow/engine";
import { hoverTextCopy } from "@/lib/ui-copy/hovertext-copy";
import { createClient } from "@/utils/supabase/server";

type Params = Promise<{ jobId: string }>;
type SearchParams = Promise<{
  advanceStage?: string;
  toPhaseKey?: string;
}>;

type ProductionJobDetail = {
  id: string;
  printavo_order_id: number;
  printavo_order_number: string | null;
  printavo_status_id: number | null;
  printavo_status_name: string | null;
  customer_name: string | null;
  job_name: string;
  current_phase_key: string;
  current_phase_label_snapshot: string;
  due_date: string | null;
  priority: string;
  difficulty_score: number | null;
  estimated_minutes: number | null;
};

type ProductionTaskRow = {
  id: string;
  workflow_step_key: string;
  label_snapshot: string;
  track_snapshot: string;
  status: string;
  assigned_role: string | null;
  assigned_user_id: string | null;
  blocked_reason: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  workflow_steps: {
    sort_order: number;
  } | null;
};

type ProductionEventRow = {
  id: string;
  actor_user_id: string | null;
  event_type: string;
  source: string;
  from_state_label_snapshot: string | null;
  to_state_label_snapshot: string | null;
  reason: string | null;
  note: string | null;
  created_at: string;
};

const trackLabels: Record<string, string> = {
  apparel: "Apparel",
  artwork: "Artwork",
  customer_fulfillment: "Customer Fulfillment",
  production: "Production",
  production_prep: "Production Prep",
};

const statusClasses: Record<string, string> = {
  blocked: "border-red-400/30 bg-red-400/10 text-red-100",
  cancelled: "border-neutral-600 bg-neutral-800 text-neutral-300",
  complete: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100",
  in_progress: "border-blue-400/30 bg-blue-400/10 text-blue-100",
  open: "border-neutral-700 bg-neutral-900 text-neutral-300",
  skipped: "border-neutral-600 bg-neutral-800 text-neutral-300",
};

function formatDate(value: string | null) {
  if (!value) {
    return "No date";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(new Date(`${value}T00:00:00`));
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function labelForTrack(track: string) {
  return trackLabels[track] ?? track.replaceAll("_", " ");
}

function groupedTasks(tasks: ProductionTaskRow[]) {
  const groups = new Map<string, ProductionTaskRow[]>();

  for (const task of [...tasks].sort(
    (left, right) =>
      (left.workflow_steps?.sort_order ?? 0) -
        (right.workflow_steps?.sort_order ?? 0) ||
      left.label_snapshot.localeCompare(right.label_snapshot),
  )) {
    groups.set(task.track_snapshot, [
      ...(groups.get(task.track_snapshot) ?? []),
      task,
    ]);
  }

  return Array.from(groups.entries());
}

function isTrackComplete(tasks: ProductionTaskRow[]) {
  return tasks.every(
    (task) => task.status === "complete" || task.status === "skipped",
  );
}

function statusBadge(status: string) {
  return (
    <span
      className={`rounded-md border px-2 py-1 text-xs font-medium ${
        statusClasses[status] ?? statusClasses.open
      }`}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

export default async function ProductionJobDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { jobId } = await params;
  const query = await searchParams;
  const { profile } = await getCurrentProfile();

  if (!profile || !profile.is_active || !canUseOperations(profile.role)) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const [
    { data: job, error: jobError },
    { data: tasks, error: taskError },
    { data: events, error: eventError },
    suggestions,
  ] = await Promise.all([
    supabase
      .from("production_jobs")
      .select(
        "id,printavo_order_id,printavo_order_number,printavo_status_id,printavo_status_name,customer_name,job_name,current_phase_key,current_phase_label_snapshot,due_date,priority,difficulty_score,estimated_minutes",
      )
      .eq("id", jobId)
      .single<ProductionJobDetail>(),
    supabase
      .from("production_tasks")
      .select(
        "id,workflow_step_key,label_snapshot,track_snapshot,status,assigned_role,assigned_user_id,blocked_reason,started_at,completed_at,created_at,workflow_steps(sort_order)",
      )
      .eq("production_job_id", jobId)
      .order("track_snapshot", { ascending: true })
      .returns<ProductionTaskRow[]>(),
    supabase
      .from("production_job_events")
      .select(
        "id,actor_user_id,event_type,source,from_state_label_snapshot,to_state_label_snapshot,reason,note,created_at",
      )
      .eq("production_job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<ProductionEventRow[]>(),
    suggestNextActions(supabase, jobId),
  ]);

  if (jobError) {
    notFound();
  }

  if (taskError || eventError) {
    throw new Error(taskError?.message ?? eventError?.message);
  }

  if (!job) {
    notFound();
  }

  const canMutateTasks = canWorkProductionTasks(profile.role);
  const canAdvance = canManageProduction(profile.role);
  const completeCount = (tasks ?? []).filter(
    (task) => task.status === "complete",
  ).length;
  const stageAdvancePrompt =
    query.advanceStage === "1" && query.toPhaseKey
      ? suggestions.find(
          (suggestion) =>
            suggestion.type === "advance_phase" &&
            suggestion.workflowStepKey === query.toPhaseKey,
        )
      : null;

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50">
      {stageAdvancePrompt && canAdvance ? (
        <div
          aria-labelledby="advance-stage-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/80 px-4"
          role="dialog"
        >
          <div className="w-full max-w-md rounded-lg border border-neutral-700 bg-neutral-900 p-6 shadow-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-400">
              Stage ready
            </p>
            <h2
              className="mt-3 text-xl font-semibold tracking-tight"
              id="advance-stage-title"
            >
              Advance stage from current stage to next stage?
            </h2>
            <p className="mt-3 text-sm leading-6 text-neutral-400">
              {job.current_phase_label_snapshot} to {stageAdvancePrompt.label}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <HoverText text="Close this prompt and leave the job in its current stage.">
                <Link
                  className="h-10 rounded-md border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 transition hover:border-neutral-500"
                  href={`/production/${job.id}`}
                >
                  No
                </Link>
              </HoverText>
              <form action={advanceProductionPhase}>
                <input name="jobId" type="hidden" value={job.id} />
                <input
                  name="toPhaseKey"
                  type="hidden"
                  value={stageAdvancePrompt.workflowStepKey}
                />
                <HoverText text={hoverTextCopy.actions.advancePhase}>
                  <PendingSubmitButton
                    className="h-10 rounded-md border border-blue-400/40 bg-blue-400/10 px-4 text-sm font-medium text-blue-100 transition hover:border-blue-300"
                    pendingLabel="Advancing"
                  >
                    Advance
                  </PendingSubmitButton>
                </HoverText>
              </form>
            </div>
          </div>
        </div>
      ) : null}
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-8">
        <header className="border-b border-neutral-800 pb-6">
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
            <HoverText text={hoverTextCopy.jobDetail.printavoSync}>
              <Link
                href="/reporting/printavo-sync"
                className="hover:text-neutral-200"
              >
                Printavo sync
              </Link>
            </HoverText>
          </div>
          <p className="mt-6 text-sm font-medium uppercase tracking-[0.2em] text-emerald-400">
            {job.current_phase_label_snapshot}
          </p>
          <div className="mt-3 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">
                {job.job_name}
              </h1>
              <p className="mt-2 text-sm text-neutral-400">
                {job.customer_name ?? "No customer"} · Printavo{" "}
                {job.printavo_order_number ?? job.printavo_order_id}
              </p>
            </div>
            <div className="grid gap-2 text-sm sm:grid-cols-4 lg:min-w-[520px]">
              <div className="rounded-md border border-neutral-800 bg-neutral-900 p-3">
                <p className="text-neutral-500">Due</p>
                <p className="mt-1 font-mono">{formatDate(job.due_date)}</p>
              </div>
              <div className="rounded-md border border-neutral-800 bg-neutral-900 p-3">
                <p className="text-neutral-500">Tasks</p>
                <p className="mt-1 font-mono">
                  {completeCount}/{tasks?.length ?? 0}
                </p>
              </div>
              <div className="rounded-md border border-neutral-800 bg-neutral-900 p-3">
                <p className="text-neutral-500">Difficulty</p>
                <p className="mt-1 font-mono">{job.difficulty_score ?? "n/a"}</p>
              </div>
              <div className="rounded-md border border-neutral-800 bg-neutral-900 p-3">
                <p className="text-neutral-500">Estimate</p>
                <p className="mt-1 font-mono">
                  {job.estimated_minutes ? `${job.estimated_minutes}m` : "n/a"}
                </p>
              </div>
            </div>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="flex flex-col gap-5">
            {groupedTasks(tasks ?? []).map(([track, trackTasks]) => {
              const trackComplete = isTrackComplete(trackTasks);
              const trackCompleteCount = trackTasks.filter(
                (task) => task.status === "complete",
              ).length;

              return (
                <details
                  className="group rounded-lg border border-neutral-800 bg-neutral-900"
                  key={track}
                  open={!trackComplete}
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 border-b border-neutral-800 px-5 py-4 [&::-webkit-details-marker]:hidden">
                    <div>
                      <HoverText text={hoverTextCopy.jobDetail.taskTrack}>
                        <h2 className="text-lg font-semibold capitalize">
                          {labelForTrack(track)}
                        </h2>
                      </HoverText>
                      <p className="mt-1 text-xs text-neutral-500">
                        {trackCompleteCount}/{trackTasks.length} tasks complete
                      </p>
                    </div>
                    <span
                      aria-hidden="true"
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-neutral-700 bg-neutral-950 text-lg leading-none text-neutral-300 transition group-open:hidden"
                      title="Expand section"
                    >
                      +
                    </span>
                    <span
                      aria-hidden="true"
                      className="hidden h-8 w-8 items-center justify-center rounded-md border border-neutral-700 bg-neutral-950 text-lg leading-none text-neutral-300 transition group-open:flex"
                      title="Collapse section"
                    >
                      -
                    </span>
                  </summary>
                  <div className="divide-y divide-neutral-800">
                  {trackTasks.map((task) => (
                    <div className="px-5 py-4" key={task.id}>
                      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            {statusBadge(task.status)}
                            <h3 className="font-medium text-neutral-100">
                              {task.label_snapshot}
                            </h3>
                          </div>
                          <p className="mt-2 font-mono text-xs text-neutral-500">
                            {task.workflow_step_key}
                          </p>
                          {task.blocked_reason ? (
                            <p className="mt-2 rounded-md border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-100">
                              {task.blocked_reason}
                            </p>
                          ) : null}
                          {task.completed_at ? (
                            <p className="mt-2 text-xs text-neutral-500">
                              Completed {formatDateTime(task.completed_at)}
                            </p>
                          ) : null}
                        </div>

                        {canMutateTasks ? (
                          <div className="flex min-w-56 flex-col gap-2">
                            {task.status === "complete" ? (
                              <form
                                action={reopenProductionTask}
                                className="flex justify-end"
                              >
                                <input
                                  name="jobId"
                                  type="hidden"
                                  value={job.id}
                                />
                                <input
                                  name="taskId"
                                  type="hidden"
                                  value={task.id}
                                />
                                <HoverText
                                  text={hoverTextCopy.actions.reopenTask}
                                >
                                  <PendingSubmitButton
                                    aria-label="Reopen completed task"
                                    className="h-9 w-9 rounded-md border border-neutral-700 bg-neutral-950 text-base text-neutral-200 transition hover:border-orange-300/60 hover:text-orange-100"
                                    pendingLabel="..."
                                    title="Reopen completed task"
                                  >
                                    ↩
                                  </PendingSubmitButton>
                                </HoverText>
                              </form>
                            ) : null}
                            {task.status === "blocked" ? (
                              <form action={unblockProductionTask}>
                                <input name="jobId" type="hidden" value={job.id} />
                                <input name="taskId" type="hidden" value={task.id} />
                                <HoverText
                                  className="w-full"
                                  text={hoverTextCopy.actions.unblockTask}
                                >
                                  <PendingSubmitButton
                                    className="h-9 w-full rounded-md border border-blue-400/40 bg-blue-400/10 px-3 text-sm text-blue-100"
                                    pendingLabel="Unblocking"
                                  >
                                    Unblock
                                  </PendingSubmitButton>
                                </HoverText>
                              </form>
                            ) : null}
                            {task.status !== "complete" &&
                            task.status !== "cancelled" &&
                            task.status !== "blocked" ? (
                              <form
                                action={completeProductionTask}
                                className="flex gap-2"
                              >
                                <input name="jobId" type="hidden" value={job.id} />
                                <input name="taskId" type="hidden" value={task.id} />
                                <input
                                  className="min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-2 text-sm text-neutral-100 outline-none focus:border-emerald-300"
                                  name="note"
                                  placeholder="Completion note"
                                />
                                <HoverText
                                  text={hoverTextCopy.actions.completeTask}
                                >
                                  <PendingSubmitButton
                                    className="h-9 rounded-md border border-emerald-400/40 bg-emerald-400/10 px-3 text-sm text-emerald-100"
                                    pendingLabel="Completing"
                                  >
                                    Complete
                                  </PendingSubmitButton>
                                </HoverText>
                              </form>
                            ) : null}
                            {task.status !== "complete" &&
                            task.status !== "cancelled" &&
                            task.status !== "blocked" ? (
                              <form action={blockProductionTask} className="flex gap-2">
                                <input name="jobId" type="hidden" value={job.id} />
                                <input name="taskId" type="hidden" value={task.id} />
                                <input
                                  className="min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-2 text-sm text-neutral-100 outline-none focus:border-red-300"
                                  name="reason"
                                  placeholder="Block reason"
                                />
                                <HoverText text={hoverTextCopy.actions.blockTask}>
                                  <PendingSubmitButton
                                    className="h-9 rounded-md border border-red-400/30 px-3 text-sm text-red-100"
                                    pendingLabel="Blocking"
                                  >
                                    Block
                                  </PendingSubmitButton>
                                </HoverText>
                              </form>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  </div>
                </details>
              );
            })}
          </section>

          <aside className="flex flex-col gap-5">
            <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
              <HoverText text={hoverTextCopy.jobDetail.suggestions}>
                <h2 className="text-lg font-semibold">
                  Suggested next actions
                </h2>
              </HoverText>
              <div className="mt-4 flex flex-col gap-3">
                {suggestions.length === 0 ? (
                  <p className="text-sm text-neutral-400">
                    No suggestions yet. Complete prerequisite tasks to unlock
                    the next action.
                  </p>
                ) : null}
                {suggestions.slice(0, 8).map((suggestion) => (
                  <div
                    className="rounded-md border border-neutral-800 bg-neutral-950 p-3"
                    key={`${suggestion.type}:${suggestion.workflowStepKey}`}
                  >
                    <p className="text-sm font-medium text-neutral-100">
                      {suggestion.label}
                    </p>
                    <p className="mt-1 text-sm leading-5 text-neutral-400">
                      {suggestion.prompt}
                    </p>
                    <p className="mt-2 font-mono text-xs text-neutral-500">
                      {suggestion.track} · {suggestion.type}
                    </p>
                    {suggestion.type === "complete_milestone" &&
                    suggestion.taskId &&
                    canMutateTasks ? (
                      <form action={completeProductionTask} className="mt-3">
                        <input name="jobId" type="hidden" value={job.id} />
                        <input
                          name="taskId"
                          type="hidden"
                          value={suggestion.taskId}
                        />
                        <HoverText
                          className="w-full"
                          text={hoverTextCopy.actions.markSuggestedComplete}
                        >
                          <PendingSubmitButton
                            className="h-9 w-full rounded-md border border-emerald-400/40 bg-emerald-400/10 px-3 text-sm text-emerald-100"
                            pendingLabel="Completing"
                          >
                            Mark complete
                          </PendingSubmitButton>
                        </HoverText>
                      </form>
                    ) : null}
                    {suggestion.type === "advance_phase" && canAdvance ? (
                      <form action={advanceProductionPhase} className="mt-3">
                        <input name="jobId" type="hidden" value={job.id} />
                        <input
                          name="toPhaseKey"
                          type="hidden"
                          value={suggestion.workflowStepKey}
                        />
                        <HoverText
                          className="w-full"
                          text={hoverTextCopy.actions.advancePhase}
                        >
                          <PendingSubmitButton
                            className="h-9 w-full rounded-md border border-blue-400/40 bg-blue-400/10 px-3 text-sm text-blue-100"
                            pendingLabel="Advancing"
                          >
                            Advance phase
                          </PendingSubmitButton>
                        </HoverText>
                      </form>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
              <HoverText text={hoverTextCopy.jobDetail.eventTimeline}>
                <h2 className="text-lg font-semibold">Event timeline</h2>
              </HoverText>
              <div className="mt-4 flex flex-col gap-4">
                {(events ?? []).map((event) => (
                  <div
                    className="border-l border-neutral-700 pl-4"
                    key={event.id}
                  >
                    <p className="text-sm font-medium text-neutral-100">
                      {event.event_type.replaceAll("_", " ")}
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {formatDateTime(event.created_at)} · {event.source}
                    </p>
                    {event.to_state_label_snapshot ? (
                      <p className="mt-2 text-sm text-neutral-300">
                        {event.from_state_label_snapshot
                          ? `${event.from_state_label_snapshot} -> `
                          : ""}
                        {event.to_state_label_snapshot}
                      </p>
                    ) : null}
                    {event.reason || event.note ? (
                      <p className="mt-2 text-sm leading-5 text-neutral-400">
                        {event.reason ?? event.note}
                      </p>
                    ) : null}
                  </div>
                ))}
                {(events ?? []).length === 0 ? (
                  <p className="text-sm text-neutral-400">No events yet.</p>
                ) : null}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
