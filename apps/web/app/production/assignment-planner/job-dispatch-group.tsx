"use client";

import { useMemo, useState } from "react";
import { PendingSubmitButton } from "@/app/components/pending-submit-button";
import { assignSelectedTasksFromPlanner } from "@/app/production/assignment-planner/actions";
import type { AuthorityLevel, OrgDepartment } from "@/lib/auth/roles";

type ProfileRow = {
  id: string;
  authority_level: AuthorityLevel;
  department: OrgDepartment | null;
  email: string | null;
  full_name: string | null;
  is_active: boolean;
  role: string;
};

type PlannerTaskRow = {
  id: string;
  assigned_user_id: string | null;
  blocked_reason: string | null;
  label_snapshot: string;
  owning_department: OrgDepartment | null;
  status: string;
  track_snapshot: string;
  production_jobs: {
    id: string;
    customer_name: string | null;
    due_date: string | null;
    job_name: string;
    current_phase_label_snapshot: string;
    printavo_order_number: string | null;
  } | null;
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

function displayName(profile: ProfileRow) {
  return profile.full_name || profile.email || "Unnamed employee";
}

function AssignmentRow({
  checked,
  onCheckedChange,
  task,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  task: PlannerTaskRow;
}) {
  return (
    <label
      className={`flex cursor-pointer gap-3 rounded-lg border p-4 transition hover:border-neutral-600 hover:bg-neutral-900 ${
        task.status === "blocked"
          ? "border-red-400/30 bg-red-950/20"
          : "border-neutral-800 bg-neutral-950"
      }`}
    >
      <input
        checked={checked}
        className="mt-1 h-4 w-4 rounded border-neutral-700 bg-neutral-950 accent-emerald-500"
        name="taskIds"
        onChange={(event) => onCheckedChange(event.target.checked)}
        type="checkbox"
        value={task.id}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-neutral-100">
            {task.label_snapshot}
          </h3>
          <span className="rounded-md border border-neutral-700 px-2 py-1 text-xs capitalize text-neutral-300">
            {labelize(task.status)}
          </span>
        </div>
        <p className="mt-1 text-sm text-neutral-400">
          {task.production_jobs?.job_name ?? "Production job"} ·{" "}
          {task.production_jobs?.customer_name ?? "No customer"}
        </p>
        <p className="mt-2 text-xs uppercase tracking-[0.16em] text-neutral-500">
          {labelize(task.owning_department)} · {labelize(task.track_snapshot)} ·{" "}
          {task.production_jobs?.current_phase_label_snapshot ?? "No phase"}
        </p>
        {task.blocked_reason ? (
          <p className="mt-3 rounded-md border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-100">
            Blocked: {task.blocked_reason}
          </p>
        ) : null}
      </div>
    </label>
  );
}

export function JobDispatchGroup({
  employees,
  job,
  selectedDepartment,
  tasks,
}: {
  employees: ProfileRow[];
  job: PlannerTaskRow["production_jobs"];
  selectedDepartment: string;
  tasks: PlannerTaskRow[];
}) {
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(
    () => new Set(),
  );
  const blockedCount = tasks.filter((task) => task.status === "blocked").length;
  const canAssignSelected = selectedDepartment !== "all" && Boolean(job?.id);
  const allSelected = tasks.length > 0 && selectedTaskIds.size === tasks.length;
  const eligibleEmployees = canAssignSelected
    ? employees.filter(
        (employee) =>
          employee.role === "staff" &&
          employee.is_active &&
          employee.department === selectedDepartment,
      )
    : [];
  const selectedCount = selectedTaskIds.size;
  const selectedLabel = useMemo(() => {
    if (selectedCount === 0) {
      return "Assign selected tasks";
    }

    return `Assign ${selectedCount} selected task${selectedCount === 1 ? "" : "s"}`;
  }, [selectedCount]);

  function setTaskChecked(taskId: string, checked: boolean) {
    setSelectedTaskIds((current) => {
      const next = new Set(current);

      if (checked) {
        next.add(taskId);
      } else {
        next.delete(taskId);
      }

      return next;
    });
  }

  function setAllChecked(checked: boolean) {
    setSelectedTaskIds(checked ? new Set(tasks.map((task) => task.id)) : new Set());
  }

  return (
    <details
      className={`group overflow-hidden rounded-lg border bg-neutral-950 ${
        blockedCount > 0 ? "border-red-400/30" : "border-neutral-800"
      }`}
    >
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-4 py-4 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-neutral-100">
            {job?.job_name ?? "Production job"}
          </h3>
          <p className="mt-1 text-sm text-neutral-400">
            {job?.customer_name ?? "No customer"} · Printavo{" "}
            {job?.printavo_order_number ?? "n/a"}
          </p>
          <p className="mt-2 text-xs uppercase tracking-[0.16em] text-neutral-500">
            {job?.current_phase_label_snapshot ?? "No phase"} ·{" "}
            {tasks.length} unassigned task{tasks.length === 1 ? "" : "s"}
            {blockedCount > 0 ? ` · ${blockedCount} blocked` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300">
            {formatDate(job?.due_date)}
          </span>
          <span
            aria-hidden="true"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-neutral-700 text-neutral-300 group-open:hidden"
          >
            +
          </span>
          <span
            aria-hidden="true"
            className="hidden h-7 w-7 items-center justify-center rounded-md border border-neutral-700 text-neutral-300 group-open:flex"
          >
            -
          </span>
        </div>
      </summary>
      <form
        action={assignSelectedTasksFromPlanner}
        className="flex flex-col gap-3 border-t border-neutral-800 p-4"
      >
        <input name="productionJobId" type="hidden" value={job?.id ?? ""} />
        <input
          name="selectedDepartment"
          type="hidden"
          value={selectedDepartment}
        />
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(260px,320px)] xl:items-start">
            <div className="min-w-0">
              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 transition hover:border-neutral-600">
                <input
                  checked={allSelected}
                  className="mt-1 h-4 w-4 shrink-0 rounded border-neutral-700 bg-neutral-950 accent-emerald-500"
                  disabled={!canAssignSelected || tasks.length === 0}
                  onChange={(event) => setAllChecked(event.target.checked)}
                  type="checkbox"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-neutral-100">
                    Select all tasks in this job
                  </span>
                  <span className="mt-1 block text-sm leading-6 text-neutral-400">
                    {selectedCount} of {tasks.length} selected. The assignment
                    only affects this production job.
                  </span>
                </span>
              </label>
            </div>
            <div className="grid min-w-0 gap-2">
              <select
                className="h-10 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 text-sm text-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
                defaultValue=""
                disabled={!canAssignSelected || tasks.length === 0}
                name="assignedUserId"
                required
              >
                <option disabled value="">
                  Choose employee
                </option>
                {eligibleEmployees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {displayName(employee)} · {labelize(employee.authority_level)}
                  </option>
                ))}
              </select>
              <input
                className="h-10 w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 text-sm text-neutral-100 placeholder:text-neutral-600 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!canAssignSelected || tasks.length === 0}
                name="note"
                placeholder="Assignment note"
              />
              <PendingSubmitButton
                className="h-10 w-full rounded-md border border-emerald-500/70 bg-emerald-500/10 px-3 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={
                  !canAssignSelected || tasks.length === 0 || selectedCount === 0
                }
                pendingLabel="Assigning selected"
              >
                {selectedLabel}
              </PendingSubmitButton>
            </div>
          </div>
          {!canAssignSelected ? (
            <p className="mt-3 rounded-md border border-yellow-400/30 bg-yellow-400/10 px-3 py-2 text-sm text-yellow-100">
              Choose a specific department before assigning selected tasks.
            </p>
          ) : null}
        </div>
        {tasks.map((task) => (
          <AssignmentRow
            checked={selectedTaskIds.has(task.id)}
            key={task.id}
            onCheckedChange={(checked) => setTaskChecked(task.id, checked)}
            task={task}
          />
        ))}
      </form>
    </details>
  );
}
