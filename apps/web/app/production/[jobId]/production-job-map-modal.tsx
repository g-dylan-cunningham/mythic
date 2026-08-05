"use client";

import { useMemo, useState } from "react";

type ProductionMapJob = {
  current_phase_label_snapshot: string;
  job_name: string;
};

type ProductionMapTask = {
  assigned_user_id: string | null;
  blocked_reason: string | null;
  id: string;
  label_snapshot: string;
  owning_department: string | null;
  outcome_key: string | null;
  outcome_label_snapshot: string | null;
  outcome_note: string | null;
  status: string;
  track_snapshot: string;
  workflow_step_key: string;
  workflow_steps: {
    sort_order: number;
  } | null;
};

type ProductionMapProfile = {
  email: string | null;
  full_name: string | null;
  id: string;
};

type ProductionMapOwner = {
  department: string | null;
  user_id: string;
};

type ProductionMapDependency = {
  dependency_type: string;
  depends_on_step_key: string;
  step_key: string;
};

type ProductionJobMapModalProps = {
  dependencies: ProductionMapDependency[];
  job: ProductionMapJob;
  jobOwners: ProductionMapOwner[];
  profiles: ProductionMapProfile[];
  tasks: ProductionMapTask[];
  trackLabels: Record<string, string>;
};

const statusTone: Record<string, string> = {
  blocked: "border-red-400/50 bg-red-400/15 text-red-50",
  cancelled: "border-neutral-600 bg-neutral-800 text-neutral-300",
  complete: "border-emerald-400/50 bg-emerald-400/15 text-emerald-50",
  in_progress: "border-blue-400/50 bg-blue-400/15 text-blue-50",
  open: "border-neutral-700 bg-neutral-900 text-neutral-200",
  skipped: "border-neutral-600 bg-neutral-800 text-neutral-300",
};

const waitingTone = "border-yellow-400/50 bg-yellow-400/15 text-yellow-50";

function labelize(value: string | null | undefined) {
  return value ? value.replaceAll("_", " ") : "not assigned";
}

function displayName(profile: ProductionMapProfile | undefined) {
  return profile?.full_name || profile?.email || "Unassigned";
}

function isDone(task: ProductionMapTask | undefined) {
  return task?.status === "complete" || task?.status === "skipped";
}

function sortTasks(tasks: ProductionMapTask[]) {
  return [...tasks].sort(
    (left, right) =>
      (left.workflow_steps?.sort_order ?? 0) -
        (right.workflow_steps?.sort_order ?? 0) ||
      left.label_snapshot.localeCompare(right.label_snapshot),
  );
}

function progressLabel(completeCount: number, totalCount: number) {
  if (totalCount === 0) {
    return "0%";
  }

  return `${Math.round((completeCount / totalCount) * 100)}%`;
}

export function ProductionJobMapModal({
  dependencies,
  job,
  jobOwners,
  profiles,
  tasks,
  trackLabels,
}: ProductionJobMapModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const profilesById = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile])),
    [profiles],
  );
  const ownersByDepartment = useMemo(
    () =>
      new Map(
        jobOwners
          .filter((owner) => owner.department)
          .map((owner) => [owner.department, owner]),
      ),
    [jobOwners],
  );
  const tasksByStepKey = useMemo(
    () => new Map(tasks.map((task) => [task.workflow_step_key, task])),
    [tasks],
  );
  const dependenciesByStepKey = useMemo(() => {
    const groups = new Map<string, ProductionMapDependency[]>();

    for (const dependency of dependencies) {
      groups.set(dependency.step_key, [
        ...(groups.get(dependency.step_key) ?? []),
        dependency,
      ]);
    }

    return groups;
  }, [dependencies]);
  const workstreams = useMemo(() => {
    const groups = new Map<string, ProductionMapTask[]>();

    for (const task of sortTasks(tasks)) {
      groups.set(task.track_snapshot, [
        ...(groups.get(task.track_snapshot) ?? []),
        task,
      ]);
    }

    return Array.from(groups.entries());
  }, [tasks]);
  const completeCount = tasks.filter((task) => isDone(task)).length;
  const blockedCount = tasks.filter((task) => task.status === "blocked").length;
  const waitingCount = tasks.filter((task) => {
    if (isDone(task)) {
      return false;
    }

    const taskDependencies = dependenciesByStepKey.get(task.workflow_step_key) ?? [];

    return taskDependencies.some(
      (dependency) => !isDone(tasksByStepKey.get(dependency.depends_on_step_key)),
    );
  }).length;

  function jumpToTask(taskId: string) {
    setIsOpen(false);
    window.requestAnimationFrame(() => {
      document.getElementById(`task-${taskId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      window.history.replaceState(null, "", `#task-${taskId}`);
    });
  }

  return (
    <>
      <button
        className="h-10 rounded-md border border-emerald-400/50 bg-emerald-400/10 px-4 text-sm font-medium text-emerald-100 transition hover:border-emerald-300 hover:bg-emerald-400/15"
        onClick={() => setIsOpen(true)}
        type="button"
      >
        Open production map
      </button>
      {isOpen ? (
        <div
          aria-labelledby="production-map-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-800/75 p-4 backdrop-blur-sm"
          role="dialog"
        >
          <div className="flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-lg border border-neutral-600 bg-neutral-950 shadow-[0_24px_80px_rgba(0,0,0,0.65)]">
            <header className="flex flex-col gap-4 border-b border-neutral-800 p-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
                  Production map
                </p>
                <h2
                  className="mt-2 text-2xl font-semibold tracking-tight text-neutral-50"
                  id="production-map-title"
                >
                  {job.job_name}
                </h2>
                <p className="mt-2 text-sm text-neutral-400">
                  Current phase: {job.current_phase_label_snapshot}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm">
                  <p className="text-neutral-500">Complete</p>
                  <p className="mt-1 font-mono text-neutral-100">
                    {completeCount}/{tasks.length} (
                    {progressLabel(completeCount, tasks.length)})
                  </p>
                </div>
                <div className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm">
                  <p className="text-neutral-500">Blocked</p>
                  <p className="mt-1 font-mono text-red-100">{blockedCount}</p>
                </div>
                <div className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm">
                  <p className="text-neutral-500">Waiting</p>
                  <p className="mt-1 font-mono text-yellow-100">{waitingCount}</p>
                </div>
                <button
                  className="h-10 rounded-md border border-neutral-700 px-4 text-sm font-medium text-neutral-200 transition hover:border-neutral-500"
                  onClick={() => setIsOpen(false)}
                  type="button"
                >
                  Close
                </button>
              </div>
            </header>

            <div className="overflow-auto p-5">
              <div className="mb-5 flex flex-wrap gap-3 text-xs text-neutral-300">
                <span className="rounded-md border border-emerald-400/40 bg-emerald-400/10 px-2 py-1">
                  Complete
                </span>
                <span className="rounded-md border border-blue-400/40 bg-blue-400/10 px-2 py-1">
                  In progress
                </span>
                <span className="rounded-md border border-red-400/40 bg-red-400/10 px-2 py-1">
                  Blocked
                </span>
                <span className="rounded-md border border-yellow-400/40 bg-yellow-400/10 px-2 py-1">
                  Waiting on dependency
                </span>
                <span className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1">
                  Open
                </span>
              </div>

              <div className="flex flex-col gap-4">
                {workstreams.map(([track, trackTasks]) => {
                  const trackCompleteCount = trackTasks.filter((task) =>
                    isDone(task),
                  ).length;
                  const trackBlockedCount = trackTasks.filter(
                    (task) => task.status === "blocked",
                  ).length;

                  return (
                    <section
                      className="rounded-lg border border-neutral-800 bg-neutral-900"
                      key={track}
                    >
                      <div className="flex flex-col gap-3 border-b border-neutral-800 p-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-500">
                            Workstream
                          </p>
                          <h3 className="mt-1 text-lg font-semibold text-neutral-100">
                            {trackLabels[track] ?? labelize(track)}
                          </h3>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <span className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-neutral-300">
                            {trackCompleteCount}/{trackTasks.length} complete
                          </span>
                          {trackBlockedCount > 0 ? (
                            <span className="rounded-md border border-red-400/30 bg-red-400/10 px-2 py-1 text-red-100">
                              {trackBlockedCount} blocked
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex gap-3 overflow-x-auto p-4">
                        {trackTasks.map((task, index) => {
                          const taskDependencies =
                            dependenciesByStepKey.get(task.workflow_step_key) ??
                            [];
                          const waitingOn = taskDependencies
                            .map((dependency) =>
                              tasksByStepKey.get(dependency.depends_on_step_key),
                            )
                            .filter(
                              (dependencyTask) => !isDone(dependencyTask),
                            ) as ProductionMapTask[];
                          const owner = task.owning_department
                            ? ownersByDepartment.get(task.owning_department)
                            : undefined;
                          const tone =
                            waitingOn.length > 0 && !isDone(task)
                              ? waitingTone
                              : statusTone[task.status] ?? statusTone.open;

                          return (
                            <div
                              className="flex min-w-[220px] items-center gap-3"
                              key={task.id}
                            >
                              <button
                                className={`min-h-44 w-full rounded-lg border p-4 text-left transition hover:-translate-y-0.5 hover:border-neutral-300 ${tone}`}
                                onClick={() => jumpToTask(task.id)}
                                type="button"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <p className="text-sm font-semibold leading-5">
                                    {task.label_snapshot}
                                  </p>
                                  <span className="rounded-md border border-current/30 px-2 py-1 text-[11px] capitalize opacity-90">
                                    {labelize(task.status)}
                                  </span>
                                </div>
                                <p className="mt-3 font-mono text-[11px] opacity-70">
                                  {task.workflow_step_key}
                                </p>
                                <div className="mt-3 flex flex-col gap-1 text-xs opacity-90">
                                  <p>Department: {labelize(task.owning_department)}</p>
                                  <p>
                                    Manager:{" "}
                                    {displayName(
                                      profilesById.get(owner?.user_id ?? ""),
                                    )}
                                  </p>
                                  <p>
                                    Assignee:{" "}
                                    {displayName(
                                      profilesById.get(task.assigned_user_id ?? ""),
                                    )}
                                  </p>
                                </div>
                                {waitingOn.length > 0 ? (
                                  <p className="mt-3 rounded-md border border-current/30 px-2 py-1 text-xs">
                                    Waiting on:{" "}
                                    {waitingOn
                                      .map(
                                        (dependencyTask) =>
                                          dependencyTask.label_snapshot,
                                      )
                                      .join(", ")}
                                  </p>
                                ) : null}
                                {task.outcome_label_snapshot ? (
                                  <p className="mt-3 rounded-md border border-current/30 px-2 py-1 text-xs">
                                    Decision: {task.outcome_label_snapshot}
                                  </p>
                                ) : null}
                                {task.blocked_reason ? (
                                  <p className="mt-3 rounded-md border border-current/30 px-2 py-1 text-xs">
                                    Blocked: {task.blocked_reason}
                                  </p>
                                ) : null}
                              </button>
                              {index < trackTasks.length - 1 ? (
                                <span className="shrink-0 text-neutral-600">-&gt;</span>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
