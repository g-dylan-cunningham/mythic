import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { HoverText } from "@/app/components/hover-text";
import { PendingSubmitButton } from "@/app/components/pending-submit-button";
import { ProductionJobMapModal } from "@/app/production/[jobId]/production-job-map-modal";
import { ReopenDecisionModalButton } from "@/app/production/[jobId]/reopen-decision-modal-button";
import { TaskDecisionModalButton } from "@/app/production/[jobId]/task-decision-modal-button";
import { TaskStatusModalButton } from "@/app/production/[jobId]/task-status-modal-button";
import {
  advanceProductionPhase,
  addProductionTaskCollaborator,
  addProductionTaskComment,
  assignProductionTask,
  blockProductionTask,
  changeProductionTaskDepartment,
  completeProductionTask,
  reopenProductionTask,
  removeProductionTaskCollaborator,
  resolveArtworkNeededProductionTask,
  unblockProductionTask,
  unassignProductionTask,
  updateProductionTaskOwningManager,
} from "@/app/production/actions";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import {
  ORG_DEPARTMENTS,
  canManageProduction,
  canManageUsers,
  canUseOperations,
  canViewOwnerProductionOverview,
  canWorkProductionTasks,
  isDepartmentManager,
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
  workflow_definition_id: string;
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
  owning_department: string | null;
  outcome_key: string | null;
  outcome_label_snapshot: string | null;
  outcome_note: string | null;
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

type ProfileOption = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  department: string | null;
  authority_level: string;
};

type TaskCollaboratorRow = {
  id: string;
  production_task_id: string;
  user_id: string;
  collaborator_role: string;
  removed_at: string | null;
};

type TaskCommentRow = {
  id: string;
  production_task_id: string;
  author_user_id: string | null;
  comment_type: string;
  body: string;
  created_at: string;
};

type ProductionJobOwnerRow = {
  department: string | null;
  owner_role: string;
  production_job_id: string;
  user_id: string;
};

type ProductionEventRow = {
  id: string;
  production_task_id: string | null;
  actor_user_id: string | null;
  event_type: string;
  source: string;
  from_state_label_snapshot: string | null;
  to_state_label_snapshot: string | null;
  reason: string | null;
  note: string | null;
  created_at: string;
};

type WorkflowDependencyRow = {
  dependency_type: string;
  depends_on_step_key: string;
  step_key: string;
};

const trackLabels: Record<string, string> = {
  apparel: "Apparel",
  artwork: "Artwork",
  customer_fulfillment: "Customer Fulfillment",
  production: "Production",
  production_prep: "Production Prep",
};

const selfAssignedTaskClass =
  "border-l-4 border-l-emerald-400 bg-emerald-400/10 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.18)]";

function selfAssignedChip() {
  return (
    <span className="rounded-md border border-emerald-400/40 bg-emerald-400/10 px-2 py-1 text-xs font-medium text-emerald-100">
      Assigned to you
    </span>
  );
}

const taskPhaseLabels: Record<string, string[]> = {
  "apparel.confirm_garment_requirements": ["Needs sourcing"],
  "apparel.build_supplier_cart": ["Needs sourcing"],
  "apparel.approve_cart": ["Needs sourcing"],
  "apparel.order_apparel": ["Needs sourcing", "Awaiting goods"],
  "apparel.apparel_shipped": ["Awaiting goods"],
  "apparel.apparel_received": ["Goods received"],
  "art.confirm_artwork_needed": ["Needs sourcing"],
  "art.create_revise_artwork": ["Needs sourcing"],
  "art.send_artwork_approval": ["Needs sourcing"],
  "art.artwork_approved": ["Ready for production"],
  "art.ready_to_burn_screens": ["Ready for production"],
  "prep.burn_screens": ["Ready for production"],
  "prep.confirm_print_locations": ["Ready for production"],
  "prep.confirm_ink_color_count": ["Ready for production"],
  "prep.confirm_garment_handling": ["Ready for production"],
  "prep.confirm_finishing_requirements": ["Ready for production"],
  "prep.estimate_difficulty_time": ["Ready for production"],
  "prep.assign_press_day": ["Scheduled"],
  "production.ready_for_production": ["Ready for production"],
  "production.in_production": ["In production"],
  "production.finishing_qc": ["Finishing / QC"],
  "production.production_complete": ["Production complete"],
  "fulfillment.ready_inventory": ["After production complete"],
  "fulfillment.shipped_picked_up": ["After production complete"],
  "fulfillment.received_by_customer": ["After production complete"],
};

const statusClasses: Record<string, string> = {
  blocked: "border-red-400/30 bg-red-400/10 text-red-100",
  cancelled: "border-neutral-600 bg-neutral-800 text-neutral-300",
  complete: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100",
  in_progress: "border-blue-400/30 bg-blue-400/10 text-blue-100",
  open: "border-neutral-700 bg-neutral-900 text-neutral-300",
  skipped: "border-neutral-600 bg-neutral-800 text-neutral-300",
};

const artworkNeededDecisionOptions = [
  {
    description:
      "Artwork work is required. Keep create/revise artwork and approval tasks active.",
    label: "Artwork needed",
    value: "artwork_needed",
  },
  {
    description:
      "No artwork creation or approval is needed. Skip the downstream artwork tasks.",
    label: "Artwork not needed",
    value: "artwork_not_needed",
  },
  {
    description:
      "More information is needed before deciding. Block this task for follow-up.",
    label: "Customer follow-up needed",
    value: "customer_followup_needed",
  },
];

function isArtworkNeededDecisionTask(task: ProductionTaskRow) {
  return task.workflow_step_key === "art.confirm_artwork_needed";
}

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

function labelize(value: string | null | undefined) {
  return value ? value.replaceAll("_", " ") : "not assigned";
}

function profileName(profile: ProfileOption | undefined) {
  return profile?.full_name || profile?.email || "Unassigned";
}

function eligibleAssigneesForTask(
  task: ProductionTaskRow,
  profiles: ProfileOption[],
) {
  const departmentEmployees = profiles.filter(
    (profile) =>
      profile.role === "staff" &&
      profile.department &&
      profile.department === task.owning_department,
  );
  const currentAssignee = task.assigned_user_id
    ? profiles.find((profile) => profile.id === task.assigned_user_id)
    : undefined;

  if (
    currentAssignee &&
    !departmentEmployees.some((profile) => profile.id === currentAssignee.id)
  ) {
    return [currentAssignee, ...departmentEmployees];
  }

  return departmentEmployees;
}

function phasesForTask(workflowStepKey: string) {
  return taskPhaseLabels[workflowStepKey] ?? ["Phase mapping pending"];
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

function eventStateLabel(
  value: string | null,
  profilesById: Map<string, ProfileOption>,
) {
  if (!value) {
    return null;
  }

  return profileName(profilesById.get(value)) === "Unassigned"
    ? labelize(value)
    : profileName(profilesById.get(value));
}

function groupedByTask<T extends { production_task_id: string }>(rows: T[]) {
  const groups = new Map<string, T[]>();

  for (const row of rows) {
    groups.set(row.production_task_id, [
      ...(groups.get(row.production_task_id) ?? []),
      row,
    ]);
  }

  return groups;
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
    { data: staffProfiles, error: profileError },
    { data: comments, error: commentError },
    { data: jobOwners, error: jobOwnerError },
    suggestions,
  ] = await Promise.all([
    supabase
      .from("production_jobs")
      .select(
        "id,workflow_definition_id,printavo_order_id,printavo_order_number,printavo_status_id,printavo_status_name,customer_name,job_name,current_phase_key,current_phase_label_snapshot,due_date,priority,difficulty_score,estimated_minutes",
      )
      .eq("id", jobId)
      .single<ProductionJobDetail>(),
    supabase
      .from("production_tasks")
      .select(
        "id,workflow_step_key,label_snapshot,track_snapshot,owning_department,outcome_key,outcome_label_snapshot,outcome_note,status,assigned_role,assigned_user_id,blocked_reason,started_at,completed_at,created_at,workflow_steps(sort_order)",
      )
      .eq("production_job_id", jobId)
      .order("track_snapshot", { ascending: true })
      .returns<ProductionTaskRow[]>(),
    supabase
      .from("production_job_events")
      .select(
        "id,production_task_id,actor_user_id,event_type,source,from_state_label_snapshot,to_state_label_snapshot,reason,note,created_at",
      )
      .eq("production_job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(200)
      .returns<ProductionEventRow[]>(),
    supabase
      .from("profiles")
      .select("id,email,full_name,role,department,authority_level")
      .eq("is_active", true)
      .in("role", ["owner", "admin", "staff"])
      .order("department", { ascending: true })
      .order("full_name", { ascending: true })
      .returns<ProfileOption[]>(),
    supabase
      .from("production_task_comments")
      .select("id,production_task_id,author_user_id,comment_type,body,created_at")
      .eq("production_job_id", jobId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(120)
      .returns<TaskCommentRow[]>(),
    supabase
      .from("production_job_owners")
      .select("production_job_id,user_id,department,owner_role")
      .eq("production_job_id", jobId)
      .eq("owner_role", "department_manager")
      .is("removed_at", null)
      .returns<ProductionJobOwnerRow[]>(),
    suggestNextActions(supabase, jobId),
  ]);

  if (jobError) {
    notFound();
  }

  if (taskError || eventError || profileError || commentError || jobOwnerError) {
    throw new Error(
      taskError?.message ??
        eventError?.message ??
        profileError?.message ??
        commentError?.message ??
        jobOwnerError?.message,
    );
  }

  if (!job) {
    notFound();
  }

  const { data: dependencies, error: dependencyError } = await supabase
    .from("workflow_dependencies")
    .select("step_key,depends_on_step_key,dependency_type")
    .eq("workflow_definition_id", job.workflow_definition_id)
    .returns<WorkflowDependencyRow[]>();

  if (dependencyError) {
    throw new Error(dependencyError.message);
  }

  const canMutateTasks = canWorkProductionTasks(profile.role);
  const canAdvance = canManageProduction(profile.role);
  const canManageTaskRouting =
    canManageUsers(profile.role) || isDepartmentManager(profile.authority_level);
  const taskIds = (tasks ?? []).map((task) => task.id);
  const { data: collaborators, error: collaboratorError } =
    taskIds.length > 0
      ? await supabase
          .from("production_task_collaborators")
          .select(
            "id,production_task_id,user_id,collaborator_role,removed_at",
          )
          .in("production_task_id", taskIds)
          .is("removed_at", null)
          .returns<TaskCollaboratorRow[]>()
      : { data: [], error: null };

  if (collaboratorError) {
    throw new Error(collaboratorError.message);
  }

  const profilesById = new Map(
    (staffProfiles ?? []).map((staffProfile) => [staffProfile.id, staffProfile]),
  );
  const managerOwnersByDepartment = new Map(
    (jobOwners ?? [])
      .filter((owner) => owner.department)
      .map((owner) => [owner.department, owner]),
  );
  const commentsByTask = groupedByTask(comments ?? []);
  const eventsByTask = groupedByTask(
    (events ?? []).filter(
      (event): event is ProductionEventRow & { production_task_id: string } =>
        Boolean(event.production_task_id),
    ),
  );
  const collaboratorsByTask = groupedByTask(collaborators ?? []);
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
            {canViewOwnerProductionOverview(profile.role) ? (
              <HoverText text={hoverTextCopy.links.ownerOverview}>
                <Link
                  href="/production/owner-overview"
                  className="hover:text-neutral-200"
                >
                  Owner overview
                </Link>
              </HoverText>
            ) : null}
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
            <div className="flex flex-col gap-3 lg:min-w-[520px]">
              <div className="grid gap-2 text-sm sm:grid-cols-4">
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
                  <p className="mt-1 font-mono">
                    {job.difficulty_score ?? "n/a"}
                  </p>
                </div>
                <div className="rounded-md border border-neutral-800 bg-neutral-900 p-3">
                  <p className="text-neutral-500">Estimate</p>
                  <p className="mt-1 font-mono">
                    {job.estimated_minutes ? `${job.estimated_minutes}m` : "n/a"}
                  </p>
                </div>
              </div>
              <div className="flex justify-end">
                <ProductionJobMapModal
                  dependencies={dependencies ?? []}
                  job={job}
                  jobOwners={jobOwners ?? []}
                  profiles={staffProfiles ?? []}
                  tasks={tasks ?? []}
                  trackLabels={trackLabels}
                />
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
                      <p className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-neutral-500">
                        Workstream
                      </p>
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
                      title="Expand workstream"
                    >
                      +
                    </span>
                    <span
                      aria-hidden="true"
                      className="hidden h-8 w-8 items-center justify-center rounded-md border border-neutral-700 bg-neutral-950 text-lg leading-none text-neutral-300 transition group-open:flex"
                      title="Collapse workstream"
                    >
                      -
                    </span>
                  </summary>
                  <div className="divide-y divide-neutral-800">
                  {trackTasks.map((task) => {
                    const isAssignedToCurrentUser =
                      task.assigned_user_id === profile.id;

                    return (
                    <div
                      className={`px-5 py-4 ${
                        isAssignedToCurrentUser ? selfAssignedTaskClass : ""
                      }`}
                      id={`task-${task.id}`}
                      key={task.id}
                    >
                      {(() => {
                        const taskComments = commentsByTask.get(task.id) ?? [];
                        const taskCollaborators =
                          collaboratorsByTask.get(task.id) ?? [];
                        const assignedProfile = task.assigned_user_id
                          ? profilesById.get(task.assigned_user_id)
                          : undefined;
                        const managerOwner = task.owning_department
                          ? managerOwnersByDepartment.get(task.owning_department)
                          : undefined;
                        const managerOwnerProfile = managerOwner
                          ? profilesById.get(managerOwner.user_id)
                          : undefined;
                        const eligibleManagers = (staffProfiles ?? []).filter(
                          (staffProfile) =>
                            staffProfile.role === "staff" &&
                            staffProfile.department === task.owning_department &&
                            isDepartmentManager(
                              staffProfile.authority_level as Parameters<
                                typeof isDepartmentManager
                              >[0],
                            ),
                        );
                        const eligibleAssignees = eligibleAssigneesForTask(
                          task,
                          staffProfiles ?? [],
                        );

                        return (
                      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                        <div className="min-w-0 flex-1">
                          {(() => {
                            const taskEvents = eventsByTask.get(task.id) ?? [];

                            return (
                              <>
                          <div className="flex flex-wrap items-center gap-2">
                            {statusBadge(task.status)}
                            <h3 className="font-medium text-neutral-100">
                              {task.label_snapshot}
                            </h3>
                            {isAssignedToCurrentUser ? selfAssignedChip() : null}
                          </div>
                          <p className="mt-2 font-mono text-xs text-neutral-500">
                            {task.workflow_step_key}
                          </p>
                          <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                            {canManageTaskRouting ? (
                              <details className="group/department rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2">
                                <summary className="flex cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
                                  <div className="min-w-0">
                                    <p className="font-medium uppercase tracking-[0.14em] text-neutral-500">
                                      Owning department
                                    </p>
                                    <p className="mt-1 truncate capitalize text-neutral-200">
                                      {labelize(task.owning_department)}
                                    </p>
                                  </div>
                                  <span
                                    aria-hidden="true"
                                    className="mt-3 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-neutral-700 bg-neutral-900 text-base font-semibold leading-none text-neutral-200 group-open/department:hidden"
                                  >
                                    +
                                  </span>
                                  <span
                                    aria-hidden="true"
                                    className="mt-3 hidden h-5 w-5 shrink-0 items-center justify-center rounded-md border border-neutral-700 bg-neutral-900 text-base font-semibold leading-none text-neutral-200 group-open/department:flex"
                                  >
                                    -
                                  </span>
                                </summary>
                                <form
                                  action={changeProductionTaskDepartment}
                                  className="mt-3 flex flex-col gap-2 border-t border-neutral-800 pt-3"
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
                                  <select
                                    className="h-9 rounded-md border border-neutral-700 bg-neutral-950 px-2 text-sm text-neutral-100"
                                    defaultValue={task.owning_department ?? ""}
                                    name="owningDepartment"
                                    required
                                  >
                                    <option value="">Choose department</option>
                                    {ORG_DEPARTMENTS.map((department) => (
                                      <option
                                        key={department}
                                        value={department}
                                      >
                                        {labelize(department)}
                                      </option>
                                    ))}
                                  </select>
                                  <PendingSubmitButton
                                    className="h-9 rounded-md border border-blue-400/40 bg-blue-400/10 px-3 text-sm text-blue-100"
                                    pendingLabel="Updating"
                                  >
                                    Update department
                                  </PendingSubmitButton>
                                </form>
                              </details>
                            ) : (
                              <div className="rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2">
                                <p className="font-medium uppercase tracking-[0.14em] text-neutral-500">
                                  Owning department
                                </p>
                                <p className="mt-1 capitalize text-neutral-200">
                                  {labelize(task.owning_department)}
                                </p>
                              </div>
                            )}
                            {canManageTaskRouting ? (
                              <details className="group/manager rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2">
                                <summary className="flex cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
                                  <div className="min-w-0">
                                    <p className="font-medium uppercase tracking-[0.14em] text-neutral-500">
                                      Owning manager
                                    </p>
                                    <p className="mt-1 truncate text-neutral-200">
                                      {profileName(managerOwnerProfile)}
                                    </p>
                                  </div>
                                  <span
                                    aria-hidden="true"
                                    className="mt-3 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-neutral-700 bg-neutral-900 text-base font-semibold leading-none text-neutral-200 group-open/manager:hidden"
                                  >
                                    +
                                  </span>
                                  <span
                                    aria-hidden="true"
                                    className="mt-3 hidden h-5 w-5 shrink-0 items-center justify-center rounded-md border border-neutral-700 bg-neutral-900 text-base font-semibold leading-none text-neutral-200 group-open/manager:flex"
                                  >
                                    -
                                  </span>
                                </summary>
                                <form
                                  action={updateProductionTaskOwningManager}
                                  className="mt-3 flex flex-col gap-2 border-t border-neutral-800 pt-3"
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
                                  <input
                                    name="department"
                                    type="hidden"
                                    value={task.owning_department ?? ""}
                                  />
                                  <select
                                    className="h-9 rounded-md border border-neutral-700 bg-neutral-950 px-2 text-sm text-neutral-100"
                                    defaultValue={managerOwner?.user_id ?? ""}
                                    name="assignedManagerId"
                                  >
                                    <option value="">Unclaimed</option>
                                    {eligibleManagers.map((managerProfile) => (
                                      <option
                                        key={managerProfile.id}
                                        value={managerProfile.id}
                                      >
                                        {profileName(managerProfile)} ·{" "}
                                        {labelize(managerProfile.department)}
                                      </option>
                                    ))}
                                  </select>
                                  {eligibleManagers.length === 0 ? (
                                    <p className="text-xs leading-5 text-orange-200">
                                      No active managers were found for{" "}
                                      {labelize(task.owning_department)}.
                                    </p>
                                  ) : null}
                                  <PendingSubmitButton
                                    className="h-9 rounded-md border border-blue-400/40 bg-blue-400/10 px-3 text-sm text-blue-100"
                                    disabled={
                                      !task.owning_department ||
                                      eligibleManagers.length === 0
                                    }
                                    pendingLabel="Updating"
                                  >
                                    Update manager
                                  </PendingSubmitButton>
                                </form>
                              </details>
                            ) : (
                              <div className="rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2">
                                <p className="font-medium uppercase tracking-[0.14em] text-neutral-500">
                                  Owning manager
                                </p>
                                <p className="mt-1 text-neutral-200">
                                  {profileName(managerOwnerProfile)}
                                </p>
                              </div>
                            )}
                            {canManageTaskRouting ? (
                              <details className="group/assignee rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2">
                                <summary className="flex cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
                                  <div className="min-w-0">
                                    <p className="font-medium uppercase tracking-[0.14em] text-neutral-500">
                                      Primary assignee
                                    </p>
                                    <p className="mt-1 truncate text-neutral-200">
                                      {profileName(assignedProfile)}
                                    </p>
                                  </div>
                                  <span
                                    aria-hidden="true"
                                    className="mt-3 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-neutral-700 bg-neutral-900 text-base font-semibold leading-none text-neutral-200 group-open/assignee:hidden"
                                  >
                                    +
                                  </span>
                                  <span
                                    aria-hidden="true"
                                    className="mt-3 hidden h-5 w-5 shrink-0 items-center justify-center rounded-md border border-neutral-700 bg-neutral-900 text-base font-semibold leading-none text-neutral-200 group-open/assignee:flex"
                                  >
                                    -
                                  </span>
                                </summary>
                                <form
                                  action={assignProductionTask}
                                  className="mt-3 flex flex-col gap-2 border-t border-neutral-800 pt-3"
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
                                  <select
                                    className="h-9 rounded-md border border-neutral-700 bg-neutral-950 px-2 text-sm text-neutral-100"
                                    defaultValue={task.assigned_user_id ?? ""}
                                    name="assignedUserId"
                                    required
                                  >
                                    <option value="">Choose user</option>
                                    {eligibleAssignees.map((staffProfile) => (
                                      <option
                                        key={staffProfile.id}
                                        value={staffProfile.id}
                                      >
                                        {profileName(staffProfile)} ·{" "}
                                        {labelize(staffProfile.department)}
                                      </option>
                                    ))}
                                  </select>
                                  {eligibleAssignees.length === 0 ? (
                                    <p className="text-xs leading-5 text-orange-200">
                                      No active staff users were found for{" "}
                                      {labelize(task.owning_department)}.
                                    </p>
                                  ) : null}
                                  <PendingSubmitButton
                                    className="h-9 rounded-md border border-emerald-400/40 bg-emerald-400/10 px-3 text-sm text-emerald-100"
                                    disabled={eligibleAssignees.length === 0}
                                    pendingLabel="Updating"
                                  >
                                    Update assignee
                                  </PendingSubmitButton>
                                </form>
                              </details>
                            ) : (
                              <div className="rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2">
                                <p className="font-medium uppercase tracking-[0.14em] text-neutral-500">
                                  Primary assignee
                                </p>
                                <p className="mt-1 text-neutral-200">
                                  {profileName(assignedProfile)}
                                </p>
                              </div>
                            )}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
                              Phase
                            </span>
                            {phasesForTask(task.workflow_step_key).map(
                              (phase) => (
                                <span
                                  className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-300"
                                  key={`${task.id}:${phase}`}
                                >
                                  {phase}
                                </span>
                              ),
                            )}
                          </div>
                          {task.blocked_reason ? (
                            <p className="mt-2 rounded-md border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-100">
                              {task.blocked_reason}
                            </p>
                          ) : null}
                          {task.outcome_label_snapshot ? (
                            <p className="mt-2 rounded-md border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-100">
                              Decision: {task.outcome_label_snapshot}
                              {task.outcome_note ? ` · ${task.outcome_note}` : ""}
                            </p>
                          ) : null}
                          {task.completed_at ? (
                            <p className="mt-2 text-xs text-neutral-500">
                              Completed {formatDateTime(task.completed_at)}
                            </p>
                          ) : null}
                          <details className="group/additional mt-4 rounded-md border border-neutral-800 bg-neutral-950">
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-medium text-neutral-200 [&::-webkit-details-marker]:hidden">
                              <span>Additional</span>
                              <span
                                aria-hidden="true"
                                className="flex h-5 w-5 items-center justify-center rounded-md border border-neutral-700 bg-neutral-900 text-base font-semibold leading-none text-neutral-200 group-open/additional:hidden"
                              >
                                +
                              </span>
                              <span
                                aria-hidden="true"
                                className="hidden h-5 w-5 items-center justify-center rounded-md border border-neutral-700 bg-neutral-900 text-base font-semibold leading-none text-neutral-200 group-open/additional:flex"
                              >
                                -
                              </span>
                            </summary>
                            <div className="flex flex-col gap-4 border-t border-neutral-800 p-3">
                              {canManageTaskRouting ? (
                                <div className="flex flex-col gap-3">
                                  <details className="rounded-md border border-neutral-800 p-3">
                                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-neutral-200 [&::-webkit-details-marker]:hidden">
                                      <span>Assign task owner</span>
                                      <span className="text-xs text-neutral-500">
                                        {profileName(assignedProfile)}
                                      </span>
                                    </summary>
                                    <form
                                      action={assignProductionTask}
                                      className="mt-2 flex flex-col gap-2"
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
                                      <select
                                        className="h-9 rounded-md border border-neutral-700 bg-neutral-950 px-2 text-sm text-neutral-100"
                                        defaultValue={task.assigned_user_id ?? ""}
                                        name="assignedUserId"
                                        required
                                      >
                                        <option value="">Choose user</option>
                                        {eligibleAssignees.map((staffProfile) => (
                                          <option
                                            key={staffProfile.id}
                                            value={staffProfile.id}
                                          >
                                            {profileName(staffProfile)} ·{" "}
                                            {labelize(staffProfile.department)}
                                          </option>
                                        ))}
                                      </select>
                                      {eligibleAssignees.length === 0 ? (
                                        <p className="text-xs leading-5 text-orange-200">
                                          No active staff users were found for{" "}
                                          {labelize(task.owning_department)}.
                                          Change the owning department or create a
                                          user in that department.
                                        </p>
                                      ) : null}
                                      <PendingSubmitButton
                                        className="h-9 rounded-md border border-emerald-400/40 bg-emerald-400/10 px-3 text-sm text-emerald-100"
                                        pendingLabel="Assigning"
                                      >
                                        Assign
                                      </PendingSubmitButton>
                                    </form>
                                    {task.assigned_user_id ? (
                                      <form
                                        action={unassignProductionTask}
                                        className="mt-3 flex flex-col gap-2 border-t border-neutral-800 pt-3 sm:flex-row sm:items-center sm:justify-between"
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
                                        <p className="text-sm text-neutral-400">
                                          Remove the current task owner.
                                        </p>
                                        <PendingSubmitButton
                                          className="h-9 rounded-md border border-orange-400/40 bg-orange-400/10 px-3 text-sm text-orange-100"
                                          pendingLabel="Unassigning"
                                        >
                                          Unassign
                                        </PendingSubmitButton>
                                      </form>
                                    ) : null}
                                  </details>
                                  <details className="rounded-md border border-neutral-800 p-3">
                                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-neutral-200 [&::-webkit-details-marker]:hidden">
                                      <span>Change owning department</span>
                                      <span className="text-xs capitalize text-neutral-500">
                                        {labelize(task.owning_department)}
                                      </span>
                                    </summary>
                                    <form
                                      action={changeProductionTaskDepartment}
                                      className="mt-2 flex flex-col gap-2"
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
                                      <select
                                        className="h-9 rounded-md border border-neutral-700 bg-neutral-950 px-2 text-sm text-neutral-100"
                                        defaultValue={task.owning_department ?? ""}
                                        name="owningDepartment"
                                        required
                                      >
                                        <option value="">Choose department</option>
                                        {ORG_DEPARTMENTS.map((department) => (
                                          <option
                                            key={department}
                                            value={department}
                                          >
                                            {labelize(department)}
                                          </option>
                                        ))}
                                      </select>
                                      <PendingSubmitButton
                                        className="h-9 rounded-md border border-blue-400/40 bg-blue-400/10 px-3 text-sm text-blue-100"
                                        pendingLabel="Changing"
                                      >
                                        Change owner
                                      </PendingSubmitButton>
                                    </form>
                                  </details>
                                </div>
                              ) : null}

                              <details className="rounded-md border border-neutral-800 p-3">
                                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-neutral-200 [&::-webkit-details-marker]:hidden">
                                  <span>Collaborators</span>
                                  <span className="text-xs text-neutral-500">
                                    {taskCollaborators.length} active
                                  </span>
                                </summary>
                                <div className="mt-2 flex flex-col gap-2">
                                  {taskCollaborators.map((collaborator) => (
                                    <div
                                      className="flex flex-col gap-2 rounded-md bg-neutral-900 p-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                                      key={collaborator.id}
                                    >
                                      <span>
                                        {profileName(
                                          profilesById.get(collaborator.user_id),
                                        )}{" "}
                                        <span className="text-neutral-500">
                                          · {labelize(collaborator.collaborator_role)}
                                        </span>
                                      </span>
                                      {canManageTaskRouting ? (
                                        <form action={removeProductionTaskCollaborator}>
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
                                          <input
                                            name="collaboratorId"
                                            type="hidden"
                                            value={collaborator.id}
                                          />
                                          <PendingSubmitButton
                                            className="h-8 rounded-md border border-neutral-700 px-2 text-xs text-neutral-200"
                                            pendingLabel="Removing"
                                          >
                                            Remove
                                          </PendingSubmitButton>
                                        </form>
                                      ) : null}
                                    </div>
                                  ))}
                                  {taskCollaborators.length === 0 ? (
                                    <p className="text-sm text-neutral-500">
                                      No collaborators yet.
                                    </p>
                                  ) : null}
                                </div>
                                {canManageTaskRouting ? (
                                  <form
                                    action={addProductionTaskCollaborator}
                                    className="mt-3 grid gap-2 lg:grid-cols-[1fr_160px_auto]"
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
                                    <select
                                      className="h-9 rounded-md border border-neutral-700 bg-neutral-950 px-2 text-sm text-neutral-100"
                                      name="userId"
                                      required
                                    >
                                      <option value="">Choose user</option>
                                      {(staffProfiles ?? []).map((staffProfile) => (
                                        <option
                                          key={staffProfile.id}
                                          value={staffProfile.id}
                                        >
                                          {profileName(staffProfile)}
                                        </option>
                                      ))}
                                    </select>
                                    <select
                                      className="h-9 rounded-md border border-neutral-700 bg-neutral-950 px-2 text-sm text-neutral-100"
                                      name="collaboratorRole"
                                      required
                                    >
                                      <option value="watcher">Watcher</option>
                                      <option value="contributor">Contributor</option>
                                      <option value="reviewer">Reviewer</option>
                                      <option value="manager_observer">
                                        Manager observer
                                      </option>
                                    </select>
                                    <PendingSubmitButton
                                      className="h-9 rounded-md border border-neutral-700 px-3 text-sm text-neutral-100"
                                      pendingLabel="Adding"
                                    >
                                      Add
                                    </PendingSubmitButton>
                                  </form>
                                ) : null}
                              </details>

                              <details className="rounded-md border border-neutral-800 p-3">
                                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-neutral-200 [&::-webkit-details-marker]:hidden">
                                  <span>Notes</span>
                                  <span className="text-xs text-neutral-500">
                                    {taskComments.length} notes
                                  </span>
                                </summary>
                                <form
                                  action={addProductionTaskComment}
                                  className="mt-3 flex flex-col gap-2"
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
                                  <select
                                    className="h-9 rounded-md border border-neutral-700 bg-neutral-950 px-2 text-sm text-neutral-100"
                                    name="commentType"
                                    defaultValue="comment"
                                  >
                                    <option value="comment">Note</option>
                                    <option value="blocker">Blocker</option>
                                    <option value="resolution">Resolution</option>
                                    <option value="handoff">Handoff</option>
                                    <option value="internal_note">
                                      Internal note
                                    </option>
                                  </select>
                                  <textarea
                                    className="min-h-20 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-2 text-sm text-neutral-100"
                                    name="body"
                                    placeholder="Add task context, handoff details, blocker detail, or resolution notes"
                                    required
                                  />
                                  <PendingSubmitButton
                                    className="h-9 rounded-md border border-neutral-700 px-3 text-sm text-neutral-100"
                                    pendingLabel="Adding"
                                  >
                                    Add note
                                  </PendingSubmitButton>
                                </form>
                                <div className="mt-4 flex flex-col gap-3">
                                  {taskComments.slice(0, 5).map((comment) => (
                                    <div
                                      className="rounded-md bg-neutral-900 p-3"
                                      key={comment.id}
                                    >
                                      <p className="text-sm leading-5 text-neutral-200">
                                        {comment.body}
                                      </p>
                                      <p className="mt-2 text-xs capitalize text-neutral-500">
                                        {labelize(comment.comment_type)} ·{" "}
                                        {profileName(
                                          comment.author_user_id
                                            ? profilesById.get(comment.author_user_id)
                                            : undefined,
                                        )}{" "}
                                        · {formatDateTime(comment.created_at)}
                                      </p>
                                    </div>
                                  ))}
                                  {taskComments.length === 0 ? (
                                    <p className="text-sm text-neutral-500">
                                      No notes yet.
                                    </p>
                                  ) : null}
                                </div>
                              </details>

                              <details className="rounded-md border border-neutral-800 p-3">
                                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-neutral-200 [&::-webkit-details-marker]:hidden">
                                  <span>Task history</span>
                                  <span className="text-xs text-neutral-500">
                                    {taskEvents.length} events ·{" "}
                                    {taskComments.length} notes
                                  </span>
                                </summary>
                                <div className="mt-3 flex flex-col gap-3 border-t border-neutral-800 pt-3">
                                  <div>
                                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
                                      Structured events
                                    </p>
                                    <div className="mt-2 flex flex-col gap-2">
                                      {taskEvents.slice(0, 8).map((event) => {
                                        const fromState = eventStateLabel(
                                          event.from_state_label_snapshot,
                                          profilesById,
                                        );
                                        const toState = eventStateLabel(
                                          event.to_state_label_snapshot,
                                          profilesById,
                                        );

                                        return (
                                          <div
                                            className="rounded-md bg-neutral-900 p-3"
                                            key={event.id}
                                          >
                                            <p className="text-sm font-medium capitalize text-neutral-100">
                                              {event.event_type.replaceAll(
                                                "_",
                                                " ",
                                              )}
                                            </p>
                                            <p className="mt-1 text-xs text-neutral-500">
                                              {formatDateTime(event.created_at)} ·{" "}
                                              {event.source} ·{" "}
                                              {profileName(
                                                event.actor_user_id
                                                  ? profilesById.get(
                                                      event.actor_user_id,
                                                    )
                                                  : undefined,
                                              )}
                                            </p>
                                            {toState ? (
                                              <p className="mt-2 text-sm text-neutral-300">
                                                {fromState
                                                  ? `${fromState} -> `
                                                  : ""}
                                                {toState}
                                              </p>
                                            ) : null}
                                            {event.reason || event.note ? (
                                              <p className="mt-2 text-sm leading-5 text-neutral-400">
                                                {event.reason ?? event.note}
                                              </p>
                                            ) : null}
                                          </div>
                                        );
                                      })}
                                      {taskEvents.length === 0 ? (
                                        <p className="text-sm text-neutral-500">
                                          No structured events yet.
                                        </p>
                                      ) : null}
                                    </div>
                                  </div>

                                  <div>
                                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-500">
                                      Recent notes
                                    </p>
                                    <div className="mt-2 flex flex-col gap-2">
                                      {taskComments.slice(0, 5).map((comment) => (
                                        <div
                                          className="rounded-md bg-neutral-900 p-3"
                                          key={`history:${comment.id}`}
                                        >
                                          <p className="text-sm leading-5 text-neutral-200">
                                            {comment.body}
                                          </p>
                                          <p className="mt-2 text-xs capitalize text-neutral-500">
                                            {labelize(comment.comment_type)} ·{" "}
                                            {profileName(
                                              comment.author_user_id
                                                ? profilesById.get(
                                                    comment.author_user_id,
                                                  )
                                                : undefined,
                                            )}{" "}
                                            · {formatDateTime(comment.created_at)}
                                          </p>
                                        </div>
                                      ))}
                                      {taskComments.length === 0 ? (
                                        <p className="text-sm text-neutral-500">
                                          No notes yet.
                                        </p>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              </details>
                            </div>
                          </details>
                              </>
                            );
                          })()}
                        </div>

                        {canMutateTasks ? (
                          <div className="flex min-w-56 flex-col gap-2">
                            {task.status === "complete" ? (
                              <div className="flex justify-end">
                                {isArtworkNeededDecisionTask(task) &&
                                task.outcome_key ? (
                                  <HoverText text="Reopen this decision and clear its outcome. If artwork tasks were skipped because artwork was not needed, those tasks will be reopened.">
                                    <ReopenDecisionModalButton
                                      action={reopenProductionTask}
                                      jobId={job.id}
                                      priorOutcomeLabel={
                                        task.outcome_label_snapshot
                                      }
                                      restoresSkippedTasks={
                                        task.outcome_key === "artwork_not_needed"
                                      }
                                      taskId={task.id}
                                    />
                                  </HoverText>
                                ) : (
                                  <form action={reopenProductionTask}>
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
                                )}
                              </div>
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
                              <>
                                <HoverText
                                  className="w-full"
                                  text={
                                    isArtworkNeededDecisionTask(task)
                                      ? "Record whether artwork work is needed. This decision can skip downstream artwork tasks when artwork is not needed."
                                      : hoverTextCopy.actions.completeTask
                                  }
                                >
                                  {isArtworkNeededDecisionTask(task) ? (
                                    <TaskDecisionModalButton
                                      action={resolveArtworkNeededProductionTask}
                                      buttonClassName="h-9 w-full rounded-md border border-emerald-400/40 bg-emerald-400/10 px-3 text-sm text-emerald-100 transition hover:border-emerald-300"
                                      buttonLabel="Record decision"
                                      decisionName="Is artwork needed?"
                                      jobId={job.id}
                                      modalTitle={task.label_snapshot}
                                      options={artworkNeededDecisionOptions}
                                      taskId={task.id}
                                      title="Record artwork decision"
                                    />
                                  ) : (
                                    <TaskStatusModalButton
                                      action={completeProductionTask}
                                      buttonClassName="h-9 w-full rounded-md border border-emerald-400/40 bg-emerald-400/10 px-3 text-sm text-emerald-100 transition hover:border-emerald-300"
                                      buttonLabel="Complete"
                                      fieldName="note"
                                      jobId={job.id}
                                      modalTitle={`Complete ${task.label_snapshot}`}
                                      placeholder="Optional completion note"
                                      submitClassName="h-9 rounded-md border border-emerald-400/40 bg-emerald-400/10 px-3 text-sm text-emerald-100 transition hover:border-emerald-300"
                                      taskId={task.id}
                                      title="Complete task"
                                    />
                                  )}
                                </HoverText>
                                <HoverText
                                  className="w-full"
                                  text={hoverTextCopy.actions.blockTask}
                                >
                                  <TaskStatusModalButton
                                    action={blockProductionTask}
                                    buttonClassName="h-9 w-full rounded-md border border-red-400/30 px-3 text-sm text-red-100 transition hover:border-red-300"
                                    buttonLabel="Block"
                                    fieldName="reason"
                                    jobId={job.id}
                                    modalTitle={`Block ${task.label_snapshot}`}
                                    placeholder="Optional block note"
                                    submitClassName="h-9 rounded-md border border-red-400/30 px-3 text-sm text-red-100 transition hover:border-red-300"
                                    taskId={task.id}
                                    title="Block task"
                                  />
                                </HoverText>
                              </>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                        );
                      })()}
                    </div>
                    );
                  })}
                  </div>
                </details>
              );
            })}
          </section>

          <aside className="flex flex-col gap-5">
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
