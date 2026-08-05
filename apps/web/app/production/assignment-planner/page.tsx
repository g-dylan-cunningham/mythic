import Link from "next/link";
import { redirect } from "next/navigation";
import { JobDispatchGroup } from "@/app/production/assignment-planner/job-dispatch-group";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import {
  ORG_DEPARTMENTS,
  type AuthorityLevel,
  type Profile,
  type OrgDepartment,
  canManageUsers,
  canUseOperations,
  isDepartmentManager,
} from "@/lib/auth/roles";
import { createClient } from "@/utils/supabase/server";

type SearchParams = Promise<{
  department?: string;
  dispatchOwner?: string;
}>;

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

type OwnerRow = {
  department: OrgDepartment | null;
  owner_role: string;
  production_job_id: string;
  user_id: string;
};

const visibleDepartments = ORG_DEPARTMENTS.filter(
  (department) => department !== "operations",
);

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

function canUsePlanner(profile: Profile) {
  return canManageUsers(profile.role) || isDepartmentManager(profile.authority_level);
}

function defaultDepartment(profile: Profile) {
  if (canManageUsers(profile.role) || profile.department === "operations") {
    return "all";
  }

  return profile.department ?? "all";
}

function selectedDepartment(
  requestedDepartment: string | undefined,
  profile: Profile,
) {
  if (requestedDepartment === "all") {
    return "all";
  }

  if (
    requestedDepartment !== "operations" &&
    ORG_DEPARTMENTS.includes(requestedDepartment as OrgDepartment)
  ) {
    return requestedDepartment as OrgDepartment;
  }

  return defaultDepartment(profile);
}

function tasksForEmployee(tasks: PlannerTaskRow[], employeeId: string) {
  return tasks.filter((task) => task.assigned_user_id === employeeId);
}

function groupedByJob(tasks: PlannerTaskRow[]) {
  const groups = new Map<
    string,
    {
      job: PlannerTaskRow["production_jobs"];
      tasks: PlannerTaskRow[];
    }
  >();

  for (const task of tasks) {
    const jobKey = task.production_jobs?.id ?? `task:${task.id}`;
    const existing = groups.get(jobKey);

    groups.set(jobKey, {
      job: task.production_jobs,
      tasks: [...(existing?.tasks ?? []), task],
    });
  }

  return Array.from(groups.values());
}

function ownerKey(jobId: string, department: string) {
  return `${jobId}:${department}`;
}

function selectedDispatchOwner(requestedOwner: string | undefined) {
  if (
    requestedOwner === "all" ||
    requestedOwner === "unclaimed" ||
    requestedOwner?.startsWith("manager:")
  ) {
    return requestedOwner;
  }

  return "my";
}

function dispatchGroupDepartments(tasks: PlannerTaskRow[]) {
  return Array.from(
    new Set(tasks.map((task) => task.owning_department).filter(Boolean)),
  ) as OrgDepartment[];
}

function WorkloadCard({
  employee,
  tasks,
}: {
  employee: ProfileRow;
  tasks: PlannerTaskRow[];
}) {
  const blockedCount = tasks.filter((task) => task.status === "blocked").length;
  const dueCount = tasks.filter((task) => task.production_jobs?.due_date).length;

  return (
    <article className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-semibold text-neutral-100">
            {displayName(employee)}
          </h2>
          <p className="mt-1 text-xs capitalize tracking-[0.12em] text-neutral-500">
            {labelize(employee.department)} · {labelize(employee.authority_level)}
          </p>
        </div>
        <div className="rounded-md border border-neutral-700 px-2 py-1 text-sm font-semibold text-neutral-200">
          {tasks.length}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2">
          <p className="text-neutral-500">Blocked</p>
          <p className={blockedCount > 0 ? "text-red-200" : "text-neutral-200"}>
            {blockedCount}
          </p>
        </div>
        <div className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2">
          <p className="text-neutral-500">With due dates</p>
          <p className="text-neutral-200">{dueCount}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-2">
        {tasks.length === 0 ? (
          <p className="rounded-md border border-dashed border-neutral-800 px-3 py-2 text-sm text-neutral-500">
            No active assigned tasks.
          </p>
        ) : (
          tasks.slice(0, 5).map((task) => (
            <Link
              className="rounded-md border border-neutral-800 px-3 py-2 transition hover:border-neutral-600 hover:bg-neutral-900"
              href={
                task.production_jobs
                  ? `/production/${task.production_jobs.id}`
                  : "/production"
              }
              key={task.id}
            >
              <p className="truncate text-sm text-neutral-200">
                {task.label_snapshot}
              </p>
              <p className="mt-1 truncate text-xs text-neutral-500">
                {task.production_jobs?.job_name ?? "Production job"} ·{" "}
                {formatDate(task.production_jobs?.due_date)}
              </p>
            </Link>
          ))
        )}
        {tasks.length > 5 ? (
          <p className="text-xs text-neutral-500">
            +{tasks.length - 5} more active task
            {tasks.length - 5 === 1 ? "" : "s"}
          </p>
        ) : null}
      </div>
    </article>
  );
}

export default async function AssignmentPlannerPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { profile } = await getCurrentProfile();

  if (
    !profile ||
    !profile.is_active ||
    !canUseOperations(profile.role) ||
    !canUsePlanner(profile)
  ) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const department = selectedDepartment(params.department, profile);
  const dispatchOwner = selectedDispatchOwner(params.dispatchOwner);
  const supabase = await createClient();

  let employeesQuery = supabase
    .from("profiles")
    .select("id,authority_level,department,email,full_name,is_active,role")
    .eq("role", "staff")
    .eq("is_active", true)
    .order("department", { ascending: true })
    .order("authority_level", { ascending: true })
    .order("full_name", { ascending: true });

  let tasksQuery = supabase
    .from("production_tasks")
    .select(
      "id,assigned_user_id,blocked_reason,label_snapshot,owning_department,status,track_snapshot,production_jobs(id,customer_name,due_date,job_name,current_phase_label_snapshot,printavo_order_number)",
    )
    .not("status", "in", "(complete,cancelled,skipped)")
    .order("status", { ascending: true })
    .order("created_at", { ascending: true });

  if (department !== "all") {
    employeesQuery = employeesQuery.eq("department", department);
    tasksQuery = tasksQuery.eq("owning_department", department);
  }

  const [
    { data: employees, error: employeesError },
    { data: tasks, error: tasksError },
  ] = await Promise.all([
    employeesQuery.returns<ProfileRow[]>(),
    tasksQuery.returns<PlannerTaskRow[]>(),
  ]);

  if (employeesError) {
    throw new Error(employeesError.message);
  }

  if (tasksError) {
    throw new Error(tasksError.message);
  }

  const activeEmployees = employees ?? [];
  const activeTasks = tasks ?? [];
  const unassignedTasks = activeTasks.filter((task) => !task.assigned_user_id);
  const assignedTasks = activeTasks.filter((task) => task.assigned_user_id);
  const blockedTasks = activeTasks.filter((task) => task.status === "blocked");
  const unassignedJobGroups = groupedByJob(unassignedTasks);
  const unassignedJobIds = Array.from(
    new Set(
      unassignedJobGroups
        .map((group) => group.job?.id)
        .filter((jobId): jobId is string => Boolean(jobId)),
    ),
  );
  const { data: ownerRows, error: ownerError } =
    unassignedJobIds.length > 0
      ? await supabase
          .from("production_job_owners")
          .select("production_job_id,user_id,department,owner_role")
          .in("production_job_id", unassignedJobIds)
          .eq("owner_role", "department_manager")
          .is("removed_at", null)
          .returns<OwnerRow[]>()
      : { data: [], error: null };

  if (ownerError) {
    throw new Error(ownerError.message);
  }

  const departmentManagers = activeEmployees.filter((employee) =>
    isDepartmentManager(employee.authority_level),
  );
  const ownersByJobDepartment = new Map(
    (ownerRows ?? []).map((owner) => [
      ownerKey(owner.production_job_id, owner.department ?? ""),
      owner,
    ]),
  );
  const filteredUnassignedJobGroups = unassignedJobGroups.filter(
    ({ job, tasks }) => {
      if (dispatchOwner === "all") {
        return true;
      }

      if (!job) {
        return dispatchOwner === "unclaimed";
      }

      const ownerDepartments = dispatchGroupDepartments(tasks);
      const owners = ownerDepartments
        .map((ownerDepartment) =>
          ownersByJobDepartment.get(ownerKey(job.id, ownerDepartment)),
        )
        .filter(Boolean);

      if (dispatchOwner === "unclaimed") {
        return owners.length === 0;
      }

      if (dispatchOwner.startsWith("manager:")) {
        return owners.some(
          (owner) => owner?.user_id === dispatchOwner.replace("manager:", ""),
        );
      }

      return owners.some((owner) => owner?.user_id === profile.id);
    },
  );

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-8">
        <header className="border-b border-neutral-800 pb-6">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-400">
            Assignment planner
          </p>
          <div className="mt-3 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">
                Assign work by employee
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
                Manager view for balancing active tasks. It defaults to your
                department, but managers can inspect other departments for
                handoffs and workload planning.
              </p>
            </div>
            <form className="flex items-end gap-2" method="get">
              <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.16em] text-neutral-500">
                Department
                <select
                  className="h-10 rounded-md border border-neutral-700 bg-neutral-950 px-3 text-sm capitalize tracking-normal text-neutral-100"
                  defaultValue={department}
                  name="department"
                >
                  <option value="all">All departments</option>
                  {visibleDepartments.map((departmentOption) => (
                    <option key={departmentOption} value={departmentOption}>
                      {labelize(departmentOption)}
                    </option>
                  ))}
                </select>
              </label>
              <button className="h-10 rounded-md border border-neutral-700 px-3 text-sm font-medium text-neutral-200 transition hover:border-neutral-500">
                View
              </button>
            </form>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-sm text-neutral-500">Employees</p>
            <p className="mt-2 text-2xl font-semibold">{activeEmployees.length}</p>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-sm text-neutral-500">Unassigned tasks</p>
            <p className="mt-2 text-2xl font-semibold">{unassignedTasks.length}</p>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-sm text-neutral-500">Blocked active tasks</p>
            <p className="mt-2 text-2xl font-semibold">{blockedTasks.length}</p>
          </div>
        </section>

        <details className="group overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-4 py-4 [&::-webkit-details-marker]:hidden">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
                Workload
              </p>
              <h2 className="mt-2 text-2xl font-semibold">
                Employee task load
              </h2>
              <p className="mt-2 text-sm text-neutral-400">
                {activeEmployees.length} eligible employee
                {activeEmployees.length === 1 ? "" : "s"} ·{" "}
                {assignedTasks.length} assigned active task
                {assignedTasks.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex shrink-0 items-center">
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
          <section className="flex flex-col gap-3 border-t border-neutral-800 p-4">
            {activeEmployees.length === 0 ? (
              <div className="rounded-lg border border-dashed border-neutral-800 bg-neutral-950 p-5 text-sm text-neutral-400">
                No active employees found for this department.
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {activeEmployees.map((employee) => (
                  <WorkloadCard
                    employee={employee}
                    key={employee.id}
                    tasks={tasksForEmployee(assignedTasks, employee.id)}
                  />
                ))}
              </div>
            )}
          </section>
        </details>

        <details className="group/dispatch overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-4 py-4 [&::-webkit-details-marker]:hidden">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
                Dispatch
              </p>
              <h2 className="mt-2 text-2xl font-semibold">
                Unassigned tasks
              </h2>
              <p className="mt-2 text-sm text-neutral-400">
                {filteredUnassignedJobGroups.reduce(
                  (count, group) => count + group.tasks.length,
                  0,
                )}{" "}
                shown of {unassignedTasks.length} unassigned active task
                {unassignedTasks.length === 1 ? "" : "s"} ·{" "}
                {filteredUnassignedJobGroups.length} shown of{" "}
                {unassignedJobGroups.length} production job
                {unassignedJobGroups.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex shrink-0 items-center">
              <span
                aria-hidden="true"
                className="flex h-7 w-7 items-center justify-center rounded-md border border-neutral-700 text-neutral-300 group-open/dispatch:hidden"
              >
                +
              </span>
              <span
                aria-hidden="true"
                className="hidden h-7 w-7 items-center justify-center rounded-md border border-neutral-700 text-neutral-300 group-open/dispatch:flex"
              >
                -
              </span>
            </div>
          </summary>
          <section className="flex flex-col gap-3 border-t border-neutral-800 p-4">
            <form className="flex flex-wrap items-end gap-2" method="get">
              <input name="department" type="hidden" value={department} />
              <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.16em] text-neutral-500">
                Job owner
                <select
                  className="h-10 rounded-md border border-neutral-700 bg-neutral-950 px-3 text-sm tracking-normal text-neutral-100"
                  defaultValue={dispatchOwner}
                  name="dispatchOwner"
                >
                  <option value="my">My jobs</option>
                  <option value="all">All jobs</option>
                  <option value="unclaimed">Unclaimed jobs</option>
                  {departmentManagers
                    .filter((manager) => manager.id !== profile.id)
                    .map((manager) => (
                      <option key={manager.id} value={`manager:${manager.id}`}>
                        {displayName(manager)}
                        {department === "all"
                          ? ` · ${labelize(manager.department)}`
                          : ""}
                      </option>
                    ))}
                </select>
              </label>
              <button className="h-10 rounded-md border border-neutral-700 px-3 text-sm font-medium text-neutral-200 transition hover:border-neutral-500">
                View
              </button>
            </form>
            {unassignedTasks.length === 0 ? (
              <div className="rounded-lg border border-dashed border-neutral-800 bg-neutral-950 p-5 text-sm text-neutral-400">
                No unassigned active tasks in this scope.
              </div>
            ) : filteredUnassignedJobGroups.length === 0 ? (
              <div className="rounded-lg border border-dashed border-neutral-800 bg-neutral-950 p-5 text-sm text-neutral-400">
                No unassigned active tasks match this job owner filter.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {filteredUnassignedJobGroups.map(({ job, tasks }) => (
                  <JobDispatchGroup
                    employees={activeEmployees}
                    job={job}
                    key={job?.id ?? tasks[0]?.id}
                    selectedDepartment={department}
                    tasks={tasks}
                  />
                ))}
              </div>
            )}
          </section>
        </details>
      </div>
    </main>
  );
}
