import Link from "next/link";
import { redirect } from "next/navigation";
import { HoverText } from "@/app/components/hover-text";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { canUseOperations, type OrgDepartment } from "@/lib/auth/roles";
import {
  labelForTrack,
  phasesForTask,
} from "@/lib/production-workflow/task-display";
import { hoverTextCopy } from "@/lib/ui-copy/hovertext-copy";
import { createClient } from "@/utils/supabase/server";

type WorkbenchTaskRow = {
  id: string;
  assigned_user_id: string | null;
  blocked_reason: string | null;
  label_snapshot: string;
  owning_department: OrgDepartment | null;
  status: string;
  track_snapshot: string;
  workflow_step_key: string;
  workflow_steps: {
    sort_order: number;
  } | null;
  production_jobs: {
    id: string;
    customer_name: string | null;
    current_phase_label_snapshot: string;
    due_date: string | null;
    job_name: string;
    priority: string;
    printavo_order_number: string | null;
    workflow_definition_id: string;
  } | null;
};

type WorkflowDependencyRow = {
  dependency_type: string;
  depends_on_step_key: string;
  step_key: string;
  workflow_definition_id: string;
};

const terminalStatuses = new Set(["cancelled", "complete", "skipped"]);

const statusClasses: Record<string, string> = {
  blocked: "border-red-400/30 bg-red-400/10 text-red-100",
  in_progress: "border-blue-400/30 bg-blue-400/10 text-blue-100",
  open: "border-neutral-700 bg-neutral-900 text-neutral-300",
};

function labelize(value: string | null | undefined) {
  return value ? value.replaceAll("_", " ") : "not assigned";
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "No due date";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function statusBadge(status: string) {
  return (
    <span
      className={`rounded-md border px-2 py-1 text-xs font-medium capitalize ${
        statusClasses[status] ?? statusClasses.open
      }`}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

function activeTasks(tasks: WorkbenchTaskRow[]) {
  return tasks.filter((task) => !terminalStatuses.has(task.status));
}

function sortTasks(tasks: WorkbenchTaskRow[]) {
  return [...tasks].sort((left, right) => {
    const leftDate = left.production_jobs?.due_date ?? "9999-12-31";
    const rightDate = right.production_jobs?.due_date ?? "9999-12-31";

    return (
      leftDate.localeCompare(rightDate) ||
      (left.workflow_steps?.sort_order ?? 0) -
        (right.workflow_steps?.sort_order ?? 0) ||
      left.label_snapshot.localeCompare(right.label_snapshot)
    );
  });
}

function dependencyKey(workflowDefinitionId: string, stepKey: string) {
  return `${workflowDefinitionId}:${stepKey}`;
}

function dependencyMap(dependencies: WorkflowDependencyRow[]) {
  const map = new Map<string, WorkflowDependencyRow[]>();

  for (const dependency of dependencies.filter(
    (row) => row.dependency_type === "required_before_start",
  )) {
    const key = dependencyKey(
      dependency.workflow_definition_id,
      dependency.step_key,
    );
    map.set(key, [...(map.get(key) ?? []), dependency]);
  }

  return map;
}

function taskMap(tasks: WorkbenchTaskRow[]) {
  const map = new Map<string, WorkbenchTaskRow>();

  for (const task of tasks) {
    const workflowDefinitionId = task.production_jobs?.workflow_definition_id;

    if (workflowDefinitionId) {
      map.set(dependencyKey(workflowDefinitionId, task.workflow_step_key), task);
    }
  }

  return map;
}

function incompleteStartBlockers(
  task: WorkbenchTaskRow,
  dependenciesByStep: Map<string, WorkflowDependencyRow[]>,
  tasksByStep: Map<string, WorkbenchTaskRow>,
) {
  const workflowDefinitionId = task.production_jobs?.workflow_definition_id;

  if (!workflowDefinitionId) {
    return [];
  }

  const dependencies =
    dependenciesByStep.get(
      dependencyKey(workflowDefinitionId, task.workflow_step_key),
    ) ?? [];

  return dependencies.filter((dependency) => {
    const dependentTask = tasksByStep.get(
      dependencyKey(workflowDefinitionId, dependency.depends_on_step_key),
    );

    return (
      !dependentTask ||
      (dependentTask.status !== "complete" && dependentTask.status !== "skipped")
    );
  });
}

function isReadyToStart(
  task: WorkbenchTaskRow,
  dependenciesByStep: Map<string, WorkflowDependencyRow[]>,
  tasksByStep: Map<string, WorkbenchTaskRow>,
) {
  return (
    task.status !== "blocked" &&
    incompleteStartBlockers(task, dependenciesByStep, tasksByStep).length === 0
  );
}

function TaskCard({
  blockers,
  task,
}: {
  blockers?: WorkflowDependencyRow[];
  task: WorkbenchTaskRow;
}) {
  const job = task.production_jobs;

  return (
    <article className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {statusBadge(task.status)}
            <p className="font-semibold text-neutral-100">
              {task.label_snapshot}
            </p>
          </div>
          <p className="mt-2 text-sm text-neutral-400">
            {job?.job_name ?? "Production job"} ·{" "}
            {job?.customer_name ?? "No customer"}
          </p>
          <p className="mt-2 text-xs uppercase tracking-[0.16em] text-neutral-500">
            {labelize(task.owning_department)} ·{" "}
            {labelForTrack(task.track_snapshot)} ·{" "}
            {job?.current_phase_label_snapshot ?? "No phase"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-md border border-neutral-700 px-2 py-1 font-mono text-xs text-neutral-300">
            {formatDate(job?.due_date)}
          </span>
          {job ? (
            <HoverText text="Open the production job detail page for the full task checklist, routing controls, notes, and event timeline.">
              <Link
                className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-neutral-200 transition hover:border-emerald-500/60"
                href={`/production/${job.id}#task-${task.id}`}
              >
                Open
              </Link>
            </HoverText>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {phasesForTask(task.workflow_step_key).map((phase) => (
          <span
            className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-300"
            key={`${task.id}:${phase}`}
          >
            {phase}
          </span>
        ))}
      </div>

      {task.blocked_reason ? (
        <p className="mt-4 rounded-md border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-100">
          Blocked: {task.blocked_reason}
        </p>
      ) : null}

      {blockers && blockers.length > 0 ? (
        <div className="mt-4 rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
            Waiting on
          </p>
          <p className="mt-2 text-sm text-neutral-300">
            {blockers
              .map((blocker) =>
                labelize(blocker.depends_on_step_key.split(".").at(-1)),
              )
              .join(", ")}
          </p>
        </div>
      ) : null}
    </article>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-neutral-800 bg-neutral-950 p-5 text-sm text-neutral-400">
      {children}
    </div>
  );
}

export default async function ProductionWorkbenchPage() {
  const { profile } = await getCurrentProfile();

  if (!profile || !profile.is_active || !canUseOperations(profile.role)) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const { data: tasks, error: tasksError } = await supabase
    .from("production_tasks")
    .select(
      "id,assigned_user_id,blocked_reason,label_snapshot,owning_department,status,track_snapshot,workflow_step_key,workflow_steps(sort_order),production_jobs(id,customer_name,current_phase_label_snapshot,due_date,job_name,priority,printavo_order_number,workflow_definition_id)",
    )
    .not("status", "in", "(cancelled)")
    .order("created_at", { ascending: true })
    .limit(1000)
    .returns<WorkbenchTaskRow[]>();

  if (tasksError) {
    throw new Error(tasksError.message);
  }

  const workflowDefinitionIds = Array.from(
    new Set(
      (tasks ?? [])
        .map((task) => task.production_jobs?.workflow_definition_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const { data: dependencies, error: dependenciesError } =
    workflowDefinitionIds.length > 0
      ? await supabase
          .from("workflow_dependencies")
          .select(
            "workflow_definition_id,step_key,depends_on_step_key,dependency_type",
          )
          .in("workflow_definition_id", workflowDefinitionIds)
          .returns<WorkflowDependencyRow[]>()
      : { data: [], error: null };

  if (dependenciesError) {
    throw new Error(dependenciesError.message);
  }

  const department = profile.department;
  const allActiveTasks = activeTasks(tasks ?? []);
  const departmentTasks =
    department === "operations" || !department
      ? allActiveTasks
      : allActiveTasks.filter((task) => task.owning_department === department);
  const dependenciesByStep = dependencyMap(dependencies ?? []);
  const tasksByStep = taskMap(tasks ?? []);
  const myTasks = sortTasks(
    allActiveTasks.filter((task) => task.assigned_user_id === profile.id),
  );
  const readyUnassignedTasks = sortTasks(
    departmentTasks.filter(
      (task) =>
        !task.assigned_user_id &&
        isReadyToStart(task, dependenciesByStep, tasksByStep),
    ),
  );
  const upcomingTasks = sortTasks(
    departmentTasks.filter(
      (task) =>
        !task.assigned_user_id &&
        !isReadyToStart(task, dependenciesByStep, tasksByStep),
    ),
  );
  const blockedDepartmentTasks = sortTasks(
    departmentTasks.filter((task) => task.status === "blocked"),
  );

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-8">
        <header className="border-b border-neutral-800 pb-6">
          <HoverText text={hoverTextCopy.links.production}>
            <Link
              className="text-sm text-neutral-400 hover:text-neutral-200"
              href="/production"
            >
              Production
            </Link>
          </HoverText>
          <p className="mt-6 text-sm font-medium uppercase tracking-[0.2em] text-emerald-400">
            Workbench
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Hi, {profile.full_name || profile.email || "there"}.
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
            Your practical production view: assigned work, ready unassigned work
            in your department, and upcoming work that is waiting on earlier
            steps.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 capitalize text-neutral-300">
              {profile.role}
            </span>
            <span className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 capitalize text-neutral-300">
              {labelize(profile.department)}
            </span>
            <span className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 capitalize text-neutral-300">
              {labelize(profile.authority_level)}
            </span>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-sm text-neutral-500">My tasks</p>
            <p className="mt-2 text-2xl font-semibold">{myTasks.length}</p>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-sm text-neutral-500">Ready unassigned</p>
            <p className="mt-2 text-2xl font-semibold">
              {readyUnassignedTasks.length}
            </p>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-sm text-neutral-500">Upcoming</p>
            <p className="mt-2 text-2xl font-semibold">
              {upcomingTasks.length}
            </p>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-sm text-neutral-500">Blocked</p>
            <p className="mt-2 text-2xl font-semibold">
              {blockedDepartmentTasks.length}
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
              Assigned
            </p>
            <h2 className="mt-2 text-2xl font-semibold">My tasks</h2>
          </div>
          {myTasks.length === 0 ? (
            <EmptyState>
              No tasks are assigned to you right now. Check ready unassigned
              work below for department tasks that may be ready to pick up.
            </EmptyState>
          ) : (
            <div className="grid gap-3">
              {myTasks.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
              Available
            </p>
            <h2 className="mt-2 text-2xl font-semibold">
              Ready but unassigned
            </h2>
            <p className="mt-2 text-sm text-neutral-400">
              Active {labelize(department)} tasks with start prerequisites
              satisfied and no primary assignee.
            </p>
          </div>
          {readyUnassignedTasks.length === 0 ? (
            <EmptyState>No ready unassigned work found.</EmptyState>
          ) : (
            <div className="grid gap-3">
              {readyUnassignedTasks.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </div>
          )}
        </section>

        <details className="group overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-4 py-4 [&::-webkit-details-marker]:hidden">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                Later
              </p>
              <h2 className="mt-2 text-2xl font-semibold">Upcoming work</h2>
              <p className="mt-2 text-sm text-neutral-400">
                {upcomingTasks.length} department task
                {upcomingTasks.length === 1 ? "" : "s"} waiting on earlier
                work.
              </p>
            </div>
            <span className="flex h-8 w-8 items-center justify-center rounded-md border border-neutral-700 text-lg text-neutral-300 group-open:hidden">
              +
            </span>
            <span className="hidden h-8 w-8 items-center justify-center rounded-md border border-neutral-700 text-lg text-neutral-300 group-open:flex">
              -
            </span>
          </summary>
          <div className="grid gap-3 border-t border-neutral-800 p-4">
            {upcomingTasks.length === 0 ? (
              <EmptyState>No upcoming blocked-by-dependency work found.</EmptyState>
            ) : (
              upcomingTasks.map((task) => (
                <TaskCard
                  blockers={incompleteStartBlockers(
                    task,
                    dependenciesByStep,
                    tasksByStep,
                  )}
                  key={task.id}
                  task={task}
                />
              ))
            )}
          </div>
        </details>
      </div>
    </main>
  );
}
