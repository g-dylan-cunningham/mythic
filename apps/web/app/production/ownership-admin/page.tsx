import Link from "next/link";
import { redirect } from "next/navigation";
import { PendingSubmitButton } from "@/app/components/pending-submit-button";
import { overrideProductionJobOwnership } from "@/app/production/ownership-actions";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import {
  ORG_DEPARTMENTS,
  type AuthorityLevel,
  type OrgDepartment,
  canManageUsers,
  canServeAsDepartmentManager,
} from "@/lib/auth/roles";
import { createClient } from "@/utils/supabase/server";

type JobRow = {
  id: string;
  customer_name: string | null;
  due_date: string | null;
  job_name: string;
  current_phase_label_snapshot: string;
  printavo_order_number: string | null;
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
  is_active: boolean;
  role: string;
};

const ownedDepartments = ORG_DEPARTMENTS.filter(
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

function displayName(profile: ManagerRow | undefined) {
  return profile?.full_name || profile?.email || "Unclaimed";
}

function ownerKey(jobId: string, department: string) {
  return `${jobId}:${department}`;
}

export default async function OwnershipAdminPage() {
  const { profile } = await getCurrentProfile();

  if (!profile || !profile.is_active || !canManageUsers(profile.role)) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const [
    { data: jobs, error: jobError },
    { data: owners, error: ownerError },
    { data: managers, error: managerError },
  ] = await Promise.all([
    supabase
      .from("production_jobs")
      .select(
        "id,customer_name,due_date,job_name,current_phase_label_snapshot,printavo_order_number",
      )
      .order("created_at", { ascending: false })
      .limit(40)
      .returns<JobRow[]>(),
    supabase
      .from("production_job_owners")
      .select("production_job_id,user_id,department,owner_role")
      .eq("owner_role", "department_manager")
      .is("removed_at", null)
      .returns<OwnerRow[]>(),
    supabase
      .from("profiles")
      .select("id,authority_level,department,email,full_name,is_active,role")
      .in("role", ["owner", "admin", "staff"])
      .eq("is_active", true)
      .order("department", { ascending: true })
      .order("full_name", { ascending: true })
      .returns<ManagerRow[]>(),
  ]);

  if (jobError || ownerError || managerError) {
    throw new Error(
      jobError?.message ?? ownerError?.message ?? managerError?.message,
    );
  }

  const managerOptions = (managers ?? []).filter((manager) =>
    canServeAsDepartmentManager(
      manager.role as Parameters<typeof canServeAsDepartmentManager>[0],
      manager.authority_level,
    ),
  );
  const managersById = new Map(
    managerOptions.map((manager) => [manager.id, manager]),
  );
  const ownersByJobDepartment = new Map(
    (owners ?? []).map((owner) => [
      ownerKey(owner.production_job_id, owner.department ?? ""),
      owner,
    ]),
  );

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-8">
        <header className="border-b border-neutral-800 pb-6">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-400">
            Ownership admin
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Override job ownership
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
            Owner/admin view for assigning, replacing, or reverting department
            manager ownership on production jobs.
          </p>
        </header>

        <section className="flex flex-col gap-4">
          {(jobs ?? []).map((job) => (
            <article
              className="rounded-lg border border-neutral-800 bg-neutral-950"
              key={job.id}
            >
              <div className="border-b border-neutral-800 p-4">
                <Link
                  className="font-semibold text-neutral-100 hover:text-emerald-300"
                  href={`/production/${job.id}`}
                >
                  {job.job_name}
                </Link>
                <p className="mt-1 text-sm text-neutral-400">
                  {job.customer_name ?? "No customer"} · Printavo{" "}
                  {job.printavo_order_number ?? "n/a"} · {formatDate(job.due_date)}
                </p>
                <p className="mt-2 text-xs uppercase tracking-[0.16em] text-neutral-500">
                  {job.current_phase_label_snapshot}
                </p>
              </div>

              <div className="grid gap-3 p-4 lg:grid-cols-2">
                {ownedDepartments.map((department) => {
                  const owner = ownersByJobDepartment.get(
                    ownerKey(job.id, department),
                  );
                  const ownerProfile = owner
                    ? managersById.get(owner.user_id)
                    : undefined;
                  const departmentManagers = managerOptions.filter(
                    (manager) => manager.department === department,
                  );

                  return (
                    <div
                      className="rounded-lg border border-neutral-800 bg-neutral-900 p-4"
                      key={`${job.id}:${department}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
                            {labelize(department)}
                          </p>
                          <p className="mt-2 font-medium text-neutral-100">
                            {displayName(ownerProfile)}
                          </p>
                        </div>
                        <span
                          className={`rounded-md border px-2 py-1 text-xs ${
                            owner
                              ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100"
                              : "border-neutral-700 text-neutral-400"
                          }`}
                        >
                          {owner ? "Claimed" : "Unclaimed"}
                        </span>
                      </div>

                      <form
                        action={overrideProductionJobOwnership}
                        className="mt-4 grid gap-2"
                      >
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
                        <select
                          className="h-10 rounded-md border border-neutral-700 bg-neutral-950 px-3 text-sm text-neutral-100"
                          defaultValue={owner?.user_id ?? ""}
                          name="assignedUserId"
                        >
                          <option value="">Revert to unclaimed</option>
                          {departmentManagers.map((manager) => (
                            <option key={manager.id} value={manager.id}>
                              {displayName(manager)} ·{" "}
                              {labelize(manager.authority_level)}
                            </option>
                          ))}
                        </select>
                        <PendingSubmitButton
                          className="h-10 rounded-md border border-blue-400/40 bg-blue-400/10 px-3 text-sm font-medium text-blue-100 transition hover:bg-blue-400/20"
                          pendingLabel="Updating"
                        >
                          Update ownership
                        </PendingSubmitButton>
                      </form>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
