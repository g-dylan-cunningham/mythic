import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import {
  type AppRole,
  type OrgDepartment,
  canManageUsers,
  isDepartmentManager,
} from "@/lib/auth/roles";
import { createClient } from "@/utils/supabase/server";

type DashboardTaskRow = {
  id: string;
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

type DashboardJobOwnerRow = {
  department: OrgDepartment | null;
  production_job_id: string;
  user_id: string;
};

type DashboardOwnerProfileRow = {
  email: string | null;
  full_name: string | null;
  id: string;
};

type DashboardScope = "mine" | "department" | "all";

type SearchParams = Promise<{
  scope?: string;
}>;

function displayName(profile: {
  full_name: string | null;
  email: string | null;
}) {
  return profile.full_name || profile.email || "there";
}

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

function selectedScope(value: string | undefined, canPlan: boolean): DashboardScope {
  if (!canPlan) {
    return "mine";
  }

  if (value === "department" || value === "all") {
    return value;
  }

  return "mine";
}

function planningDepartmentFor(profile: {
  department: OrgDepartment | null;
  role: AppRole;
}) {
  if (canManageUsers(profile.role)) {
    return null;
  }

  if (profile.department === "operations") {
    return null;
  }

  return profile.department;
}

function groupedByJob(tasks: DashboardTaskRow[]) {
  const groups = new Map<
    string,
    {
      job: DashboardTaskRow["production_jobs"];
      tasks: DashboardTaskRow[];
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

function statusPill(task: DashboardTaskRow) {
  return (
    <span
      className={`rounded-md border px-2 py-1 capitalize ${
        task.status === "blocked"
          ? "border-red-400/40 bg-red-400/10 text-red-100"
          : "border-neutral-700 text-neutral-300"
      }`}
    >
      {labelize(task.status)}
    </span>
  );
}

const selfAssignedTaskClass =
  "border-l-4 border-l-emerald-400 bg-emerald-400/10 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.18)]";

function selfAssignedChip() {
  return (
    <span className="rounded-md border border-emerald-400/40 bg-emerald-400/10 px-2 py-1 text-xs font-medium text-emerald-100">
      Assigned to you
    </span>
  );
}

function ownershipKey(jobId: string, department: string | null | undefined) {
  return `${jobId}:${department ?? "none"}`;
}

function ownerName(profile: DashboardOwnerProfileRow | undefined) {
  return profile?.full_name || profile?.email || "another manager";
}

function ownershipChip({
  department,
  jobId,
  ownerProfilesById,
  ownersByJobDepartment,
  userId,
}: {
  department: OrgDepartment | null | undefined;
  jobId: string | null | undefined;
  ownerProfilesById: Map<string, DashboardOwnerProfileRow>;
  ownersByJobDepartment: Map<string, DashboardJobOwnerRow>;
  userId: string;
}) {
  if (!jobId || !department) {
    return null;
  }

  const owner = ownersByJobDepartment.get(ownershipKey(jobId, department));

  if (!owner) {
    return (
      <span className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-400">
        {labelize(department)}: unclaimed
      </span>
    );
  }

  const ownedByCurrentUser = owner.user_id === userId;

  return (
    <span
      className={`rounded-md border px-2 py-1 text-xs ${
        ownedByCurrentUser
          ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100"
          : "border-blue-400/30 bg-blue-400/10 text-blue-100"
      }`}
    >
      {ownedByCurrentUser
        ? `${labelize(department)}: managed by you`
        : `${labelize(department)}: managed by ${ownerName(ownerProfilesById.get(owner.user_id))}`}
    </span>
  );
}

function TaskList({
  emptyText,
  tasks,
}: {
  emptyText: string;
  tasks: DashboardTaskRow[];
}) {
  if (tasks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-800 bg-neutral-950 p-5 text-sm text-neutral-400">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="divide-y divide-neutral-800 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950">
      {tasks.map((task) => (
        <Link
          className={`block p-4 transition hover:bg-neutral-900 ${selfAssignedTaskClass} ${
            task.status === "blocked" ? "bg-red-950/20" : ""
          }`}
          href={
            task.production_jobs
              ? `/production/${task.production_jobs.id}`
              : "/production"
          }
          key={task.id}
        >
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-neutral-100">
                  {task.label_snapshot}
                </p>
                {selfAssignedChip()}
              </div>
              <p className="mt-1 text-sm text-neutral-400">
                {task.production_jobs?.job_name ?? "Production job"}{" "}
                {task.production_jobs?.customer_name
                  ? `· ${task.production_jobs.customer_name}`
                  : ""}
              </p>
              <p className="mt-2 text-xs uppercase tracking-[0.16em] text-neutral-500">
                {labelize(task.owning_department)} ·{" "}
                {labelize(task.track_snapshot)} ·{" "}
                {task.production_jobs?.current_phase_label_snapshot ??
                  "No phase"}
              </p>
              {task.blocked_reason ? (
                <p className="mt-3 rounded-md border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-100">
                  Blocked: {task.blocked_reason}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 gap-2 text-xs">
              {statusPill(task)}
              <span className="rounded-md border border-neutral-700 px-2 py-1 text-neutral-300">
                {formatDate(task.production_jobs?.due_date)}
              </span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function JobGroupedTaskList({
  emptyText,
  ownerProfilesById,
  ownersByJobDepartment,
  tasks,
  userId,
}: {
  emptyText: string;
  ownerProfilesById: Map<string, DashboardOwnerProfileRow>;
  ownersByJobDepartment: Map<string, DashboardJobOwnerRow>;
  tasks: DashboardTaskRow[];
  userId: string;
}) {
  if (tasks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-800 bg-neutral-950 p-5 text-sm text-neutral-400">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {groupedByJob(tasks).map(({ job, tasks: jobTasks }) => {
        const blockedCount = jobTasks.filter(
          (task) => task.status === "blocked",
        ).length;
        const ownershipDepartments = Array.from(
          new Set(jobTasks.map((task) => task.owning_department).filter(Boolean)),
        ) as OrgDepartment[];
        const managedByCurrentUser = ownershipDepartments.some((department) => {
          const owner = job
            ? ownersByJobDepartment.get(ownershipKey(job.id, department))
            : undefined;

          return owner?.user_id === userId;
        });

        return (
          <details
            className={`group rounded-lg border bg-neutral-950 ${
              managedByCurrentUser
                ? "border-l-4 border-l-emerald-400 border-emerald-400/30 bg-emerald-400/10 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.14)]"
                : blockedCount > 0
                  ? "border-red-400/30"
                  : "border-neutral-800"
            }`}
            key={job?.id ?? jobTasks[0]?.id}
          >
            <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-4 py-4 [&::-webkit-details-marker]:hidden">
              <div className="min-w-0">
                <p className="font-medium text-neutral-100">
                  {job?.job_name ?? "Production job"}
                </p>
                <p className="mt-1 text-sm text-neutral-400">
                  {job?.customer_name ?? "No customer"} · Printavo{" "}
                  {job?.printavo_order_number ?? "n/a"}
                </p>
                <p className="mt-2 text-xs uppercase tracking-[0.16em] text-neutral-500">
                  {job?.current_phase_label_snapshot ?? "No phase"} ·{" "}
                  {jobTasks.length} task{jobTasks.length === 1 ? "" : "s"}
                  {blockedCount > 0 ? ` · ${blockedCount} blocked` : ""}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {ownershipDepartments.map((department) => (
                    <span key={`${job?.id ?? "job"}:${department}`}>
                      {ownershipChip({
                        department,
                        jobId: job?.id,
                        ownerProfilesById,
                        ownersByJobDepartment,
                        userId,
                      })}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs">
                <span className="rounded-md border border-neutral-700 px-2 py-1 text-neutral-300">
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
            <div className="divide-y divide-neutral-800 border-t border-neutral-800">
              {jobTasks.map((task) => (
                <Link
                  className={`block px-4 py-3 transition hover:bg-neutral-900 ${
                    task.status === "blocked" ? "bg-red-950/20" : ""
                  }`}
                  href={job ? `/production/${job.id}` : "/production"}
                  key={task.id}
                >
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-neutral-100">
                          {task.label_snapshot}
                        </p>
                        <span className="text-xs">{statusPill(task)}</span>
                      </div>
                      <p className="mt-2 text-xs uppercase tracking-[0.16em] text-neutral-500">
                        {labelize(task.owning_department)} ·{" "}
                        {labelize(task.track_snapshot)}
                      </p>
                      {task.blocked_reason ? (
                        <p className="mt-3 rounded-md border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-100">
                          Blocked: {task.blocked_reason}
                        </p>
                      ) : null}
                    </div>
                    <p className="text-xs text-neutral-500">
                      Open job detail
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { profile, user } = await getCurrentProfile();

  if (!profile || !profile.is_active) {
    return (
      <main className="min-h-screen bg-neutral-950 px-6 py-12 text-neutral-50">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-2xl font-semibold">Account pending</h1>
          <p className="mt-3 text-neutral-400">
            Your login works, but your Mythic profile is not active yet.
          </p>
        </div>
      </main>
    );
  }

  const supabase = await createClient();
  const canPlan =
    canManageUsers(profile.role) || isDepartmentManager(profile.authority_level);
  const planningDepartment = planningDepartmentFor(profile);
  const params = await searchParams;
  const scope = selectedScope(params.scope, canPlan);
  const ownedJobsQuery =
    canPlan
      ? supabase
          .from("production_job_owners")
          .select("production_job_id")
          .eq("user_id", profile.id)
          .eq("owner_role", "department_manager")
          .is("removed_at", null)
          .returns<Array<{ production_job_id: string }>>()
      : Promise.resolve({ data: [], error: null });
  const { data: ownedJobs, error: ownedJobsError } = await ownedJobsQuery;

  if (ownedJobsError) {
    throw new Error(ownedJobsError.message);
  }

  const ownedJobIds = Array.from(
    new Set((ownedJobs ?? []).map((owner) => owner.production_job_id)),
  );

  const assignedTasksQuery = supabase
    .from("production_tasks")
    .select(
      "id,blocked_reason,label_snapshot,owning_department,status,track_snapshot,production_jobs(id,customer_name,due_date,job_name,current_phase_label_snapshot,printavo_order_number)",
    )
    .eq("assigned_user_id", profile.id)
    .not("status", "in", "(complete,cancelled,skipped)")
    .order("status", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(12)
    .returns<DashboardTaskRow[]>();

  const planningTasksQuery =
    canPlan
      ? (() => {
          let query = supabase
            .from("production_tasks")
            .select(
              "id,blocked_reason,label_snapshot,owning_department,status,track_snapshot,production_jobs(id,customer_name,due_date,job_name,current_phase_label_snapshot,printavo_order_number)",
            )
            .is("assigned_user_id", null)
            .not("status", "in", "(complete,cancelled,skipped)");

          if (scope === "mine") {
            if (ownedJobIds.length === 0) {
              return Promise.resolve({ data: [], error: null });
            }

            query = query.in("production_job_id", ownedJobIds);
          } else if (scope === "department" && planningDepartment) {
            query = query.eq("owning_department", planningDepartment);
          }

          return query
            .order("status", { ascending: true })
            .order("created_at", { ascending: true })
            .limit(12)
            .returns<DashboardTaskRow[]>();
        })()
      : Promise.resolve({ data: [], error: null });

  const blockedTasksQuery =
    canPlan
      ? (() => {
          let query = supabase
            .from("production_tasks")
            .select(
              "id,blocked_reason,label_snapshot,owning_department,status,track_snapshot,production_jobs(id,customer_name,due_date,job_name,current_phase_label_snapshot,printavo_order_number)",
            )
            .eq("status", "blocked");

          if (scope === "mine") {
            if (ownedJobIds.length === 0) {
              return Promise.resolve({ data: [], error: null });
            }

            query = query.in("production_job_id", ownedJobIds);
          } else if (scope === "department" && planningDepartment) {
            query = query.eq("owning_department", planningDepartment);
          }

          return query
            .order("created_at", { ascending: true })
            .limit(12)
            .returns<DashboardTaskRow[]>();
        })()
      : Promise.resolve({ data: [], error: null });

  const [
    { data: assignedTasks, error: assignedError },
    { data: planningTasks, error: planningError },
    { data: blockedTasks, error: blockedError },
  ] = await Promise.all([
    assignedTasksQuery,
    planningTasksQuery,
    blockedTasksQuery,
  ]);

  if (assignedError) {
    throw new Error(assignedError.message);
  }

  if (planningError) {
    throw new Error(planningError.message);
  }

  if (blockedError) {
    throw new Error(blockedError.message);
  }

  const dashboardJobIds = Array.from(
    new Set(
      [...(assignedTasks ?? []), ...(planningTasks ?? []), ...(blockedTasks ?? [])]
        .map((task) => task.production_jobs?.id)
        .filter(Boolean),
    ),
  ) as string[];
  const { data: jobOwners, error: jobOwnersError } =
    dashboardJobIds.length > 0
      ? await supabase
          .from("production_job_owners")
          .select("production_job_id,user_id,department")
          .in("production_job_id", dashboardJobIds)
          .eq("owner_role", "department_manager")
          .is("removed_at", null)
          .returns<DashboardJobOwnerRow[]>()
      : { data: [], error: null };

  if (jobOwnersError) {
    throw new Error(jobOwnersError.message);
  }

  const ownerUserIds = Array.from(
    new Set((jobOwners ?? []).map((owner) => owner.user_id)),
  );
  const { data: ownerProfiles, error: ownerProfilesError } =
    ownerUserIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id,email,full_name")
          .in("id", ownerUserIds)
          .returns<DashboardOwnerProfileRow[]>()
      : { data: [], error: null };

  if (ownerProfilesError) {
    throw new Error(ownerProfilesError.message);
  }

  const ownersByJobDepartment = new Map(
    (jobOwners ?? []).map((owner) => [
      ownershipKey(owner.production_job_id, owner.department),
      owner,
    ]),
  );
  const ownerProfilesById = new Map(
    (ownerProfiles ?? []).map((ownerProfile) => [
      ownerProfile.id,
      ownerProfile,
    ]),
  );

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-8">
        <header className="border-b border-neutral-800 pb-6">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-400">
            Dashboard
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Hi, {displayName(profile)}.
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
            This page is intentionally plain while we validate roles, accounts,
            and work queues.
          </p>
        </header>

        <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                Role validation
              </p>
              <h2 className="mt-2 text-xl font-semibold">
                {labelize(profile.role)}
              </h2>
            </div>
            <div className="grid gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-md border border-neutral-800 bg-neutral-950 px-4 py-3">
                <p className="text-neutral-500">Department</p>
                <p className="mt-1 font-medium capitalize text-neutral-100">
                  {labelize(profile.department)}
                </p>
              </div>
              <div className="rounded-md border border-neutral-800 bg-neutral-950 px-4 py-3">
                <p className="text-neutral-500">Authority</p>
                <p className="mt-1 font-medium capitalize text-neutral-100">
                  {labelize(profile.authority_level)}
                </p>
              </div>
              <div className="rounded-md border border-neutral-800 bg-neutral-950 px-4 py-3">
                <p className="text-neutral-500">Account</p>
                <p className="mt-1 font-medium text-emerald-300">Active</p>
              </div>
            </div>
          </div>
          <p className="mt-4 text-sm text-neutral-400">
            Signed in as {profile.email ?? user.email}. Manager planning view is{" "}
            <span className="font-medium text-neutral-200">
              {canPlan ? "enabled" : "hidden"}
            </span>
            . Planning scope is{" "}
            <span className="font-medium capitalize text-neutral-200">
              {scope === "mine"
                ? "my managed jobs"
                : planningDepartment && scope === "department"
                  ? labelize(planningDepartment)
                  : "all visible jobs"}
            </span>
            .
          </p>
        </section>

        {canPlan ? (
          <section className="flex flex-col gap-3">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
                  To plan
                </p>
                <h2 className="mt-2 text-2xl font-semibold">
                  Tasks ready to be assigned
                </h2>
              </div>
              <form className="flex items-end gap-2" method="get">
                <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.16em] text-neutral-500">
                  Visibility
                  <select
                    className="h-10 rounded-md border border-neutral-700 bg-neutral-950 px-3 text-sm tracking-normal text-neutral-100"
                    defaultValue={scope}
                    name="scope"
                  >
                    <option value="mine">My managed jobs</option>
                    <option value="department">
                      {planningDepartment
                        ? `${labelize(planningDepartment)} department`
                        : "Department view"}
                    </option>
                    <option value="all">All visible jobs</option>
                  </select>
                </label>
                <button className="h-10 rounded-md border border-neutral-700 px-3 text-sm font-medium text-neutral-200 transition hover:border-neutral-500">
                  View
                </button>
              </form>
            </div>
            <JobGroupedTaskList
              emptyText={
                scope === "mine"
                  ? "No unassigned tasks are waiting on jobs you manage. Claim a job from the ownership queue or broaden visibility."
                  : "No unassigned tasks are ready to plan for this scope."
              }
              ownerProfilesById={ownerProfilesById}
              ownersByJobDepartment={ownersByJobDepartment}
              tasks={planningTasks ?? []}
              userId={profile.id}
            />
          </section>
        ) : null}

        {canPlan ? (
          <section className="flex flex-col gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-300">
                Blocked
              </p>
              <h2 className="mt-2 text-2xl font-semibold">
                Blocked work needing manager attention
              </h2>
            </div>
            <JobGroupedTaskList
              emptyText={
                scope === "mine"
                  ? "No blocked tasks on jobs you manage."
                  : "No blocked tasks in this planning scope."
              }
              ownerProfilesById={ownerProfilesById}
              ownersByJobDepartment={ownersByJobDepartment}
              tasks={blockedTasks ?? []}
              userId={profile.id}
            />
          </section>
        ) : null}

        <section className="flex flex-col gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
              Today
            </p>
            <h2 className="mt-2 text-2xl font-semibold">
              Here are your tasks today
            </h2>
          </div>
          <TaskList
            emptyText="No tasks are assigned to you yet. This is expected for accounts we are only using to validate role visibility."
            tasks={assignedTasks ?? []}
          />
        </section>
      </div>
    </main>
  );
}
