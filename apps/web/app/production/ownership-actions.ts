"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import {
  ORG_DEPARTMENTS,
  type AuthorityLevel,
  type OrgDepartment,
  type Profile,
  canManageUsers,
  canUseOperations,
  isDepartmentManager,
} from "@/lib/auth/roles";
import { writeProductionJobEvent } from "@/lib/production-workflow/engine";
import { createClient } from "@/utils/supabase/server";

function formValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function orgDepartment(value: string): OrgDepartment | null {
  return value !== "operations" && ORG_DEPARTMENTS.includes(value as OrgDepartment)
    ? (value as OrgDepartment)
    : null;
}

function canUseOwnership(profile: Profile) {
  return canManageUsers(profile.role) || isDepartmentManager(profile.authority_level);
}

function queuePath(department: string, filter?: string, status?: string) {
  const params = new URLSearchParams();

  if (department) {
    params.set("department", department);
  }

  if (filter) {
    params.set("filter", filter);
  }

  if (status) {
    params.set("status", status);
  }

  const query = params.toString();
  return `/production/ownership-queue${query ? `?${query}` : ""}`;
}

function revalidateOwnership(jobId: string) {
  revalidatePath("/dashboard");
  revalidatePath("/production");
  revalidatePath("/production/assignment-planner");
  revalidatePath("/production/ownership-queue");
  revalidatePath("/production/ownership-admin");
  revalidatePath("/production/owner-overview");
  revalidatePath(`/production/${jobId}`);
}

async function getJobEventContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  jobId: string,
) {
  const { data: job, error } = await supabase
    .from("production_jobs")
    .select("workflow_definition_id,workflow_version")
    .eq("id", jobId)
    .single<{
      workflow_definition_id: string;
      workflow_version: number;
    }>();

  if (error || !job) {
    throw new Error(error?.message ?? "Production job not found.");
  }

  return job;
}

export async function claimProductionJobOwnership(formData: FormData) {
  const { profile, user } = await getCurrentProfile();
  const productionJobId = formValue(formData, "productionJobId");
  const selectedDepartment = formValue(formData, "department");
  const selectedFilter = formValue(formData, "filter");
  const selectedStatus = formValue(formData, "status");
  const department = orgDepartment(selectedDepartment);

  if (
    !profile ||
    !profile.is_active ||
    !canUseOperations(profile.role) ||
    !canUseOwnership(profile) ||
    !productionJobId ||
    !department
  ) {
    redirect("/dashboard");
  }

  if (
    !canManageUsers(profile.role) &&
    profile.department !== "operations" &&
    profile.department !== department
  ) {
    redirect(queuePath(selectedDepartment, selectedFilter, selectedStatus));
  }

  const supabase = await createClient();
  const job = await getJobEventContext(supabase, productionJobId);
  const { error } = await supabase.from("production_job_owners").insert({
    production_job_id: productionJobId,
    user_id: user.id,
    department,
    owner_role: "department_manager",
    assigned_by_user_id: user.id,
    metadata: {
      source: "manager_claim",
    },
  });

  if (error) {
    redirect(queuePath(selectedDepartment, selectedFilter, selectedStatus));
  }

  await writeProductionJobEvent(supabase, {
    productionJobId,
    actorUserId: user.id,
    eventType: "job_ownership_claimed",
    source: "manual",
    toStateKey: user.id,
    toStateLabel: profile.full_name ?? profile.email ?? "Manager",
    workflowDefinitionId: job.workflow_definition_id,
    workflowVersion: job.workflow_version,
    metadata: {
      department,
      owner_role: "department_manager",
    },
  });

  revalidateOwnership(productionJobId);
  redirect(queuePath(selectedDepartment, selectedFilter, selectedStatus));
}

export async function releaseProductionJobOwnership(formData: FormData) {
  const { profile, user } = await getCurrentProfile();
  const productionJobId = formValue(formData, "productionJobId");
  const selectedDepartment = formValue(formData, "department");
  const selectedFilter = formValue(formData, "filter");
  const selectedStatus = formValue(formData, "status");
  const department = orgDepartment(selectedDepartment);

  if (
    !profile ||
    !profile.is_active ||
    !canUseOperations(profile.role) ||
    !canUseOwnership(profile) ||
    !productionJobId ||
    !department
  ) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const job = await getJobEventContext(supabase, productionJobId);
  const { error } = await supabase
    .from("production_job_owners")
    .update({
      removed_at: new Date().toISOString(),
      metadata: {
        source: "manager_release",
      },
    })
    .eq("production_job_id", productionJobId)
    .eq("user_id", user.id)
    .eq("department", department)
    .eq("owner_role", "department_manager")
    .is("removed_at", null);

  if (error) {
    throw new Error(error.message);
  }

  await writeProductionJobEvent(supabase, {
    productionJobId,
    actorUserId: user.id,
    eventType: "job_ownership_released",
    source: "manual",
    fromStateKey: user.id,
    fromStateLabel: profile.full_name ?? profile.email ?? "Manager",
    workflowDefinitionId: job.workflow_definition_id,
    workflowVersion: job.workflow_version,
    metadata: {
      department,
      owner_role: "department_manager",
    },
  });

  revalidateOwnership(productionJobId);
  redirect(queuePath(selectedDepartment, selectedFilter, selectedStatus));
}

export async function overrideProductionJobOwnership(formData: FormData) {
  const { profile, user } = await getCurrentProfile();
  const productionJobId = formValue(formData, "productionJobId");
  const selectedDepartment = formValue(formData, "department");
  const assignedUserId = formValue(formData, "assignedUserId");
  const department = orgDepartment(selectedDepartment);

  if (
    !profile ||
    !profile.is_active ||
    !canManageUsers(profile.role) ||
    !productionJobId ||
    !department
  ) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const job = await getJobEventContext(supabase, productionJobId);

  const { error: removeError } = await supabase
    .from("production_job_owners")
    .update({
      removed_at: new Date().toISOString(),
      metadata: {
        source: assignedUserId ? "admin_override" : "admin_revert_unclaimed",
      },
    })
    .eq("production_job_id", productionJobId)
    .eq("department", department)
    .eq("owner_role", "department_manager")
    .is("removed_at", null);

  if (removeError) {
    throw new Error(removeError.message);
  }

  if (assignedUserId) {
    const { data: assignee, error: assigneeError } = await supabase
      .from("profiles")
      .select("id,department,email,full_name,is_active,role,authority_level")
      .eq("id", assignedUserId)
      .single<{
        authority_level: AuthorityLevel;
        department: string | null;
        email: string | null;
        full_name: string | null;
        id: string;
        is_active: boolean;
        role: string;
      }>();

    if (
      assigneeError ||
      !assignee ||
      assignee.role !== "staff" ||
      !assignee.is_active ||
      assignee.department !== department ||
      !isDepartmentManager(assignee.authority_level)
    ) {
      redirect("/production/ownership-admin");
    }

    const { error: insertError } = await supabase
      .from("production_job_owners")
      .insert({
        production_job_id: productionJobId,
        user_id: assignedUserId,
        department,
        owner_role: "department_manager",
        assigned_by_user_id: user.id,
        metadata: {
          source: "admin_override",
        },
      });

    if (insertError) {
      throw new Error(insertError.message);
    }

    await writeProductionJobEvent(supabase, {
      productionJobId,
      actorUserId: user.id,
      eventType: "job_ownership_overridden",
      source: "admin_override",
      toStateKey: assignedUserId,
      toStateLabel: assignee.full_name ?? assignee.email ?? "Manager",
      workflowDefinitionId: job.workflow_definition_id,
      workflowVersion: job.workflow_version,
      metadata: {
        department,
        owner_role: "department_manager",
      },
    });
  } else {
    await writeProductionJobEvent(supabase, {
      productionJobId,
      actorUserId: user.id,
      eventType: "job_ownership_reverted_unclaimed",
      source: "admin_override",
      workflowDefinitionId: job.workflow_definition_id,
      workflowVersion: job.workflow_version,
      metadata: {
        department,
        owner_role: "department_manager",
      },
    });
  }

  revalidateOwnership(productionJobId);
  redirect("/production/ownership-admin");
}
