import Link from "next/link";
import { redirect } from "next/navigation";
import { PendingSubmitButton } from "@/app/components/pending-submit-button";
import {
  claimProductionJobOwnership,
  releaseProductionJobOwnership,
} from "@/app/production/ownership-actions";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import {
  ORG_DEPARTMENTS,
  type AuthorityLevel,
  type OrgDepartment,
  type Profile,
  canManageUsers,
  canServeAsDepartmentManager,
  canUseOperations,
  isDepartmentManager,
} from "@/lib/auth/roles";
import { createClient } from "@/utils/supabase/server";

type SearchParams = Promise<{
  department?: string;
  filter?: string;
  status?: string;
}>;

type TaskJobRow = {
  production_jobs: {
    id: string;
    customer_name: string | null;
    current_phase_key: string;
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

type ManagerRow = {
  id: string;
  authority_level: AuthorityLevel;
  department: OrgDepartment | null;
  email: string | null;
  full_name: string | null;
  role: string;
};

const claimableDepartments = ORG_DEPARTMENTS.filter(
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

function canUseOwnershipQueue(profile: Profile) {
  return canManageUsers(profile.role) || isDepartmentManager(profile.authority_level);
}

function selectedDepartment(
  requestedDepartment: string | undefined,
  profile: Profile,
) {
  if (
    requestedDepartment !== "operations" &&
    ORG_DEPARTMENTS.includes(requestedDepartment as OrgDepartment)
  ) {
    return requestedDepartment as OrgDepartment;
  }

  if (canManageUsers(profile.role) || profile.department === "operations") {
    return "sales";
  }

  return profile.department ?? "sales";
}

function uniqueJobs(rows: TaskJobRow[]) {
  const jobs = new Map<string, NonNullable<TaskJobRow["production_jobs"]>>();

  for (const row of rows) {
    if (row.production_jobs) {
      jobs.set(row.production_jobs.id, row.production_jobs);
    }
  }

  return Array.from(jobs.values());
}

function ownerKey(jobId: string, department: string) {
  return `${jobId}:${department}`;
}

function displayName(profile: ManagerRow | undefined) {
  return profile?.full_name || profile?.email || "Unclaimed";
}

function selectedFilter(requestedFilter: string | undefined) {
  if (
    requestedFilter === "my" ||
    requestedFilter === "all" ||
    requestedFilter?.startsWith("manager:")
  ) {
    return requestedFilter;
  }

  return "unclaimed";
}

function selectedStatusFilter(requestedStatus: string | undefined) {
  if (requestedStatus === "completed" || requestedStatus === "all") {
    return requestedStatus;
  }

  return "active";
}

export default async function OwnershipQueuePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { profile } = await getCurrentProfile();

  if (
    !profile ||
    !profile.is_active ||
    !canUseOperations(profile.role) ||
    !canUseOwnershipQueue(profile)
  ) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const department = selectedDepartment(params.department, profile);
  const filter = selectedFilter(params.filter);
  const statusFilter = selectedStatusFilter(params.status);

  if (
    !canManageUsers(profile.role) &&
    profile.department !== "operations" &&
    profile.department !== department
  ) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const [
    { data: taskRows, error: taskError },
    { data: managerRows, error: managerError },
  ] = await Promise.all([
    supabase
      .from("production_tasks")
      .select(
        "production_jobs(id,customer_name,current_phase_key,due_date,job_name,current_phase_label_snapshot,printavo_order_number)",
      )
      .eq("owning_department", department)
      .returns<TaskJobRow[]>(),
    supabase
      .from("profiles")
      .select("id,authority_level,department,email,full_name,role")
      .in("role", ["owner", "admin", "staff"])
      .eq("is_active", true)
      .eq("department", department)
      .order("full_name", { ascending: true })
      .returns<ManagerRow[]>(),
  ]);

  if (taskError || managerError) {
    throw new Error(taskError?.message ?? managerError?.message);
  }

  const departmentManagers = (managerRows ?? []).filter((manager) =>
    canServeAsDepartmentManager(
      manager.role as Parameters<typeof canServeAsDepartmentManager>[0],
      manager.authority_level,
    ),
  );
  const managersById = new Map(
    departmentManagers.map((manager) => [manager.id, manager]),
  );
  const allDepartmentJobs = uniqueJobs(taskRows ?? []);
  const jobs = allDepartmentJobs.filter((job) => {
    const completed = job.current_phase_key === "phase.production_complete";

    if (statusFilter === "all") {
      return true;
    }

    if (statusFilter === "completed") {
      return completed;
    }

    return !completed;
  });
  const jobIds = jobs.map((job) => job.id);
  const { data: ownerRows, error: ownerError } =
    jobIds.length > 0
      ? await supabase
          .from("production_job_owners")
          .select("production_job_id,user_id,department,owner_role")
          .in("production_job_id", jobIds)
          .eq("department", department)
          .eq("owner_role", "department_manager")
          .is("removed_at", null)
          .returns<OwnerRow[]>()
      : { data: [], error: null };

  if (ownerError) {
    throw new Error(ownerError.message);
  }

  const ownerMap = new Map(
    (ownerRows ?? []).map((owner) => [
      ownerKey(owner.production_job_id, owner.department ?? ""),
      owner,
    ]),
  );
  const unclaimedJobs = jobs.filter(
    (job) => !ownerMap.has(ownerKey(job.id, department)),
  );
  const claimedByMeJobs = jobs.filter((job) => {
    const owner = ownerMap.get(ownerKey(job.id, department));
    return owner?.user_id === profile.id;
  });
  const ownedByOthersJobs = jobs.filter((job) => {
    const owner = ownerMap.get(ownerKey(job.id, department));
    return owner && owner.user_id !== profile.id;
  });
  const visibleJobs = jobs.filter((job) => {
    const owner = ownerMap.get(ownerKey(job.id, department));

    if (filter === "all") {
      return true;
    }

    if (filter === "my") {
      return owner?.user_id === profile.id;
    }

    if (filter.startsWith("manager:")) {
      return owner?.user_id === filter.replace("manager:", "");
    }

    return !owner;
  });
  const filterLabel =
    filter === "all"
      ? "All jobs"
      : filter === "my"
        ? "My jobs"
        : filter.startsWith("manager:")
          ? `${displayName(managersById.get(filter.replace("manager:", "")))}'s jobs`
          : "All unclaimed jobs";

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-8">
        <header className="border-b border-neutral-800 pb-6">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-400">
            Job ownership
          </p>
          <div className="mt-3 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">
                Job Ownership Board
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
                See jobs by department, ownership status, and manager
                accountability. Claiming unowned jobs is one action on the board.
              </p>
            </div>
            <form className="flex flex-wrap items-end gap-2" method="get">
              <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.16em] text-neutral-500">
                Department
                <select
                  className="h-10 rounded-md border border-neutral-700 bg-neutral-950 px-3 text-sm capitalize tracking-normal text-neutral-100"
                  defaultValue={department}
                  name="department"
                >
                  {claimableDepartments.map((departmentOption) => (
                    <option key={departmentOption} value={departmentOption}>
                      {labelize(departmentOption)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.16em] text-neutral-500">
                Ownership
                <select
                  className="h-10 rounded-md border border-neutral-700 bg-neutral-950 px-3 text-sm tracking-normal text-neutral-100"
                  defaultValue={filter}
                  name="filter"
                >
                  <option value="unclaimed">All unclaimed jobs</option>
                  <option value="my">My jobs</option>
                  <option value="all">All jobs</option>
                  {departmentManagers.map((manager) => (
                    <option key={manager.id} value={`manager:${manager.id}`}>
                      {displayName(manager)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.16em] text-neutral-500">
                Status
                <select
                  className="h-10 rounded-md border border-neutral-700 bg-neutral-950 px-3 text-sm tracking-normal text-neutral-100"
                  defaultValue={statusFilter}
                  name="status"
                >
                  <option value="active">Active only</option>
                  <option value="completed">Completed only</option>
                  <option value="all">All statuses</option>
                </select>
              </label>
              <button className="h-10 rounded-md border border-neutral-700 px-3 text-sm font-medium text-neutral-200 transition hover:border-neutral-500">
                View
              </button>
            </form>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-5">
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-sm text-neutral-500">Department</p>
            <p className="mt-2 text-xl font-semibold capitalize">
              {labelize(department)}
            </p>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-sm text-neutral-500">Jobs shown</p>
            <p className="mt-2 text-2xl font-semibold">{jobs.length}</p>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-sm text-neutral-500">Unclaimed</p>
            <p className="mt-2 text-2xl font-semibold">{unclaimedJobs.length}</p>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-sm text-neutral-500">Claimed by you</p>
            <p className="mt-2 text-2xl font-semibold">{claimedByMeJobs.length}</p>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-sm text-neutral-500">Owned by others</p>
            <p className="mt-2 text-2xl font-semibold">{ownedByOthersJobs.length}</p>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-2xl font-semibold">{filterLabel}</h2>
          {visibleJobs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-neutral-800 bg-neutral-950 p-5 text-sm text-neutral-400">
              No jobs match this filter.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {visibleJobs.map((job) => {
                const owner = ownerMap.get(ownerKey(job.id, department));
                const ownerProfile = owner
                  ? managersById.get(owner.user_id)
                  : undefined;
                const claimedByMe = owner?.user_id === profile.id;

                return (
                  <article
                    className={`rounded-lg border p-4 ${
                      claimedByMe
                        ? "border-emerald-400/30 bg-emerald-400/10"
                        : "border-neutral-800 bg-neutral-950"
                    }`}
                    key={job.id}
                  >
                    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            className="font-semibold text-neutral-100 hover:text-emerald-300"
                            href={`/production/${job.id}`}
                          >
                            {job.job_name}
                          </Link>
                          <span
                            className={`rounded-md border px-2 py-1 text-xs ${
                              owner
                                ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100"
                                : "border-neutral-700 text-neutral-400"
                            }`}
                          >
                            {owner
                              ? `Owned by ${displayName(ownerProfile)}`
                              : "Unclaimed"}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-neutral-400">
                          {job.customer_name ?? "No customer"} · Printavo{" "}
                          {job.printavo_order_number ?? "n/a"}
                        </p>
                        <p className="mt-2 text-xs uppercase tracking-[0.16em] text-neutral-500">
                          {job.current_phase_label_snapshot} ·{" "}
                          {formatDate(job.due_date)}
                        </p>
                      </div>
                      {!owner ? (
                        <form action={claimProductionJobOwnership}>
                          <input
                            name="productionJobId"
                            type="hidden"
                            value={job.id}
                          />
                          <input
                            name="department"
                            type="hidden"
                            value={department}
                          />
                          <input name="filter" type="hidden" value={filter} />
                          <input
                            name="status"
                            type="hidden"
                            value={statusFilter}
                          />
                          <PendingSubmitButton
                            className="h-10 rounded-md border border-emerald-500/70 bg-emerald-500/10 px-4 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/20"
                            pendingLabel="Claiming"
                          >
                            Claim
                          </PendingSubmitButton>
                        </form>
                      ) : null}
                      {claimedByMe ? (
                        <form action={releaseProductionJobOwnership}>
                          <input
                            name="productionJobId"
                            type="hidden"
                            value={job.id}
                          />
                          <input
                            name="department"
                            type="hidden"
                            value={department}
                          />
                          <input name="filter" type="hidden" value={filter} />
                          <input
                            name="status"
                            type="hidden"
                            value={statusFilter}
                          />
                          <PendingSubmitButton
                            className="h-10 rounded-md border border-orange-400/50 bg-orange-400/10 px-4 text-sm font-medium text-orange-100 transition hover:bg-orange-400/20"
                            pendingLabel="Releasing"
                          >
                            Release
                          </PendingSubmitButton>
                        </form>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
