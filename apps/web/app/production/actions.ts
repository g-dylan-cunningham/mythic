"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import {
  canManageProduction,
  canManageUsers,
  canServeAsDepartmentManager,
  canUseOperations,
  canWorkProductionTasks,
  isDepartmentManager,
  type Profile,
} from "@/lib/auth/roles";
import {
  type ProductionTaskCollaboratorRole,
  type ProductionTaskCommentType,
  addTaskCollaborator,
  addTaskComment,
  assignTask,
  blockTask,
  changeTaskOwningDepartment,
  completeTask,
  phaseGateDependsOnTask,
  removeTaskCollaborator,
  reopenTask,
  resolveArtworkNeededDecision,
  suggestNextActions,
  transitionProductionJobPhase,
  unblockTask,
  unassignTask,
  writeProductionJobEvent,
} from "@/lib/production-workflow/engine";
import type { ArtworkNeededOutcome } from "@/lib/production-workflow/engine";
import { ORG_DEPARTMENTS, type OrgDepartment } from "@/lib/auth/roles";
import { createClient } from "@/utils/supabase/server";

function formValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

const taskCommentTypes = [
  "comment",
  "blocker",
  "resolution",
  "handoff",
  "completion_note",
  "internal_note",
  "assignment_note",
] satisfies ProductionTaskCommentType[];

const collaboratorRoles = [
  "watcher",
  "contributor",
  "reviewer",
  "manager_observer",
] satisfies ProductionTaskCollaboratorRole[];

const artworkNeededOutcomes = [
  "artwork_needed",
  "artwork_not_needed",
  "customer_followup_needed",
] satisfies ArtworkNeededOutcome[];

function taskCommentType(value: string): ProductionTaskCommentType {
  return taskCommentTypes.includes(value as ProductionTaskCommentType)
    ? (value as ProductionTaskCommentType)
    : "comment";
}

function collaboratorRole(value: string): ProductionTaskCollaboratorRole | null {
  return collaboratorRoles.includes(value as ProductionTaskCollaboratorRole)
    ? (value as ProductionTaskCollaboratorRole)
    : null;
}

function artworkNeededOutcome(value: string): ArtworkNeededOutcome | null {
  return artworkNeededOutcomes.includes(value as ArtworkNeededOutcome)
    ? (value as ArtworkNeededOutcome)
    : null;
}

function orgDepartment(value: string): OrgDepartment | null {
  return ORG_DEPARTMENTS.includes(value as OrgDepartment)
    ? (value as OrgDepartment)
    : null;
}

function canManageTaskRouting(profile: Profile) {
  return canManageUsers(profile.role) || isDepartmentManager(profile.authority_level);
}

function canManageTaskDepartment(
  profile: Profile,
  department: string | null | undefined,
) {
  if (canManageUsers(profile.role)) {
    return true;
  }

  if (
    profile.department === "operations" &&
    isDepartmentManager(profile.authority_level)
  ) {
    return true;
  }

  return isDepartmentManager(profile.authority_level) && Boolean(department);
}

async function requireProductionAccess() {
  const { profile, user } = await getCurrentProfile();

  if (!profile || !profile.is_active || !canUseOperations(profile.role)) {
    redirect("/dashboard");
  }

  return { profile, user };
}

function revalidateJob(jobId: string) {
  revalidatePath("/production");
  revalidatePath("/production/owner-overview");
  revalidatePath(`/production/${jobId}`);
}

export async function completeProductionTask(formData: FormData) {
  const { profile, user } = await requireProductionAccess();
  const jobId = formValue(formData, "jobId");
  const taskId = formValue(formData, "taskId");
  const note = formValue(formData, "note");

  if (!canWorkProductionTasks(profile.role) || !jobId || !taskId) {
    redirect(jobId ? `/production/${jobId}` : "/production");
  }

  const supabase = await createClient();

  const completedTask = await completeTask(supabase, {
    actorUserId: user.id,
    note: note || null,
    taskId,
  });

  if (!completedTask) {
    throw new Error("Completed task was not returned.");
  }

  revalidateJob(jobId);

  if (canManageProduction(profile.role)) {
    const nextPhase = (await suggestNextActions(supabase, jobId)).find(
      (suggestion) => suggestion.type === "advance_phase",
    );

    if (
      nextPhase &&
      phaseGateDependsOnTask(
        nextPhase.workflowStepKey,
        completedTask.workflow_step_key,
      )
    ) {
      const params = new URLSearchParams({
        advanceStage: "1",
        toPhaseKey: nextPhase.workflowStepKey,
      });

      redirect(`/production/${jobId}?${params.toString()}`);
    }
  }

  redirect(`/production/${jobId}`);
}

export async function resolveArtworkNeededProductionTask(formData: FormData) {
  const { profile, user } = await requireProductionAccess();
  const jobId = formValue(formData, "jobId");
  const taskId = formValue(formData, "taskId");
  const outcomeKey = artworkNeededOutcome(formValue(formData, "outcomeKey"));
  const note = formValue(formData, "note");

  if (!canWorkProductionTasks(profile.role) || !jobId || !taskId || !outcomeKey) {
    redirect(jobId ? `/production/${jobId}` : "/production");
  }

  const supabase = await createClient();
  const resolvedTask = await resolveArtworkNeededDecision(supabase, {
    actorUserId: user.id,
    note: note || null,
    outcomeKey,
    taskId,
  });

  if (!resolvedTask) {
    throw new Error("Resolved decision task was not returned.");
  }

  revalidateJob(jobId);

  if (outcomeKey !== "customer_followup_needed" && canManageProduction(profile.role)) {
    const nextPhase = (await suggestNextActions(supabase, jobId)).find(
      (suggestion) => suggestion.type === "advance_phase",
    );

    if (
      nextPhase &&
      phaseGateDependsOnTask(
        nextPhase.workflowStepKey,
        resolvedTask.workflow_step_key,
      )
    ) {
      const params = new URLSearchParams({
        advanceStage: "1",
        toPhaseKey: nextPhase.workflowStepKey,
      });

      redirect(`/production/${jobId}?${params.toString()}`);
    }
  }

  redirect(`/production/${jobId}`);
}

export async function blockProductionTask(formData: FormData) {
  const { profile, user } = await requireProductionAccess();
  const jobId = formValue(formData, "jobId");
  const taskId = formValue(formData, "taskId");
  const reason = formValue(formData, "reason");

  if (!canWorkProductionTasks(profile.role) || !jobId || !taskId) {
    redirect(jobId ? `/production/${jobId}` : "/production");
  }

  const supabase = await createClient();

  await blockTask(supabase, {
    actorUserId: user.id,
    reason,
    taskId,
  });
  revalidateJob(jobId);
  redirect(`/production/${jobId}`);
}

export async function reopenProductionTask(formData: FormData) {
  const { profile, user } = await requireProductionAccess();
  const jobId = formValue(formData, "jobId");
  const taskId = formValue(formData, "taskId");

  if (!canWorkProductionTasks(profile.role) || !jobId || !taskId) {
    redirect(jobId ? `/production/${jobId}` : "/production");
  }

  const supabase = await createClient();

  await reopenTask(supabase, {
    actorUserId: user.id,
    taskId,
  });
  revalidateJob(jobId);
  redirect(`/production/${jobId}`);
}

export async function unblockProductionTask(formData: FormData) {
  const { profile, user } = await requireProductionAccess();
  const jobId = formValue(formData, "jobId");
  const taskId = formValue(formData, "taskId");

  if (!canWorkProductionTasks(profile.role) || !jobId || !taskId) {
    redirect(jobId ? `/production/${jobId}` : "/production");
  }

  const supabase = await createClient();

  await unblockTask(supabase, {
    actorUserId: user.id,
    taskId,
  });
  revalidateJob(jobId);
  redirect(`/production/${jobId}`);
}

export async function addProductionTaskComment(formData: FormData) {
  const { profile, user } = await requireProductionAccess();
  const jobId = formValue(formData, "jobId");
  const taskId = formValue(formData, "taskId");
  const body = formValue(formData, "body");
  const commentType = taskCommentType(formValue(formData, "commentType"));

  if (!canWorkProductionTasks(profile.role) || !jobId || !taskId || !body) {
    redirect(jobId ? `/production/${jobId}` : "/production");
  }

  const supabase = await createClient();

  await addTaskComment(supabase, {
    actorUserId: user.id,
    body,
    commentType,
    taskId,
  });
  revalidateJob(jobId);
  redirect(`/production/${jobId}`);
}

export async function assignProductionTask(formData: FormData) {
  const { profile, user } = await requireProductionAccess();
  const jobId = formValue(formData, "jobId");
  const taskId = formValue(formData, "taskId");
  const assignedUserId = formValue(formData, "assignedUserId");
  const note = formValue(formData, "note");

  if (
    !canManageTaskRouting(profile) ||
    !jobId ||
    !taskId ||
    !assignedUserId
  ) {
    redirect(jobId ? `/production/${jobId}` : "/production");
  }

  const supabase = await createClient();
  const [
    { data: taskForAssignment, error: taskForAssignmentError },
    { data: assigneeProfile, error: assigneeProfileError },
  ] = await Promise.all([
    supabase
      .from("production_tasks")
      .select("owning_department")
      .eq("id", taskId)
      .single<{ owning_department: string | null }>(),
    supabase
      .from("profiles")
      .select("id,department,is_active,role")
      .eq("id", assignedUserId)
      .single<{
        department: string | null;
        id: string;
        is_active: boolean;
        role: string;
      }>(),
  ]);

  if (
    taskForAssignmentError ||
    assigneeProfileError ||
    !taskForAssignment ||
    !assigneeProfile ||
    !canManageTaskDepartment(profile, taskForAssignment.owning_department) ||
    assigneeProfile.role !== "staff" ||
    !assigneeProfile.is_active ||
    assigneeProfile.department !== taskForAssignment.owning_department
  ) {
    redirect(`/production/${jobId}`);
  }

  await assignTask(supabase, {
    actorUserId: user.id,
    assignedUserId,
    note: note || null,
    taskId,
  });
  revalidateJob(jobId);
  redirect(`/production/${jobId}`);
}

export async function unassignProductionTask(formData: FormData) {
  const { profile, user } = await requireProductionAccess();
  const jobId = formValue(formData, "jobId");
  const taskId = formValue(formData, "taskId");
  const note = formValue(formData, "note");

  if (!canManageTaskRouting(profile) || !jobId || !taskId) {
    redirect(jobId ? `/production/${jobId}` : "/production");
  }

  const supabase = await createClient();

  await unassignTask(supabase, {
    actorUserId: user.id,
    note: note || null,
    taskId,
  });
  revalidateJob(jobId);
  redirect(`/production/${jobId}`);
}

export async function changeProductionTaskDepartment(formData: FormData) {
  const { profile, user } = await requireProductionAccess();
  const jobId = formValue(formData, "jobId");
  const taskId = formValue(formData, "taskId");
  const owningDepartment = orgDepartment(formValue(formData, "owningDepartment"));
  const note = formValue(formData, "note");

  if (!canManageTaskRouting(profile) || !jobId || !taskId || !owningDepartment) {
    redirect(jobId ? `/production/${jobId}` : "/production");
  }

  const supabase = await createClient();

  await changeTaskOwningDepartment(supabase, {
    actorUserId: user.id,
    note: note || null,
    owningDepartment,
    taskId,
  });
  revalidateJob(jobId);
  redirect(`/production/${jobId}`);
}

export async function updateProductionTaskOwningManager(formData: FormData) {
  const { profile, user } = await requireProductionAccess();
  const jobId = formValue(formData, "jobId");
  const taskId = formValue(formData, "taskId");
  const department = orgDepartment(formValue(formData, "department"));
  const assignedManagerId = formValue(formData, "assignedManagerId");

  if (!canManageTaskRouting(profile) || !jobId || !taskId || !department) {
    redirect(jobId ? `/production/${jobId}` : "/production");
  }

  if (!canManageTaskDepartment(profile, department)) {
    redirect(`/production/${jobId}`);
  }

  const supabase = await createClient();
  const [
    { data: task, error: taskError },
    { data: job, error: jobError },
    { data: currentOwner, error: currentOwnerError },
  ] = await Promise.all([
    supabase
      .from("production_tasks")
      .select("id,production_job_id,owning_department")
      .eq("id", taskId)
      .single<{
        id: string;
        owning_department: string | null;
        production_job_id: string;
      }>(),
    supabase
      .from("production_jobs")
      .select("workflow_definition_id,workflow_version")
      .eq("id", jobId)
      .single<{
        workflow_definition_id: string;
        workflow_version: number;
      }>(),
    supabase
      .from("production_job_owners")
      .select("user_id")
      .eq("production_job_id", jobId)
      .eq("department", department)
      .eq("owner_role", "department_manager")
      .is("removed_at", null)
      .maybeSingle<{ user_id: string }>(),
  ]);

  if (
    taskError ||
    jobError ||
    currentOwnerError ||
    !task ||
    !job ||
    task.production_job_id !== jobId ||
    task.owning_department !== department
  ) {
    redirect(`/production/${jobId}`);
  }

  let assignedManager:
    | { authority_level: string; department: string | null; email: string | null; full_name: string | null; id: string; is_active: boolean; role: string }
    | null = null;

  if (assignedManagerId) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id,department,email,full_name,is_active,role,authority_level")
      .eq("id", assignedManagerId)
      .single<{
        authority_level: string;
        department: string | null;
        email: string | null;
        full_name: string | null;
        id: string;
        is_active: boolean;
        role: string;
      }>();

    if (
      error ||
      !data ||
      !canServeAsDepartmentManager(
        data.role as Parameters<typeof canServeAsDepartmentManager>[0],
        data.authority_level as Parameters<
          typeof canServeAsDepartmentManager
        >[1],
      ) ||
      !data.is_active ||
      data.department !== department
    ) {
      redirect(`/production/${jobId}`);
    }

    assignedManager = data;
  }

  const removedAt = new Date().toISOString();
  const { error: removeError } = await supabase
    .from("production_job_owners")
    .update({
      removed_at: removedAt,
      metadata: {
        source: assignedManagerId
          ? "job_detail_manager_update"
          : "job_detail_manager_cleared",
      },
    })
    .eq("production_job_id", jobId)
    .eq("department", department)
    .eq("owner_role", "department_manager")
    .is("removed_at", null);

  if (removeError) {
    throw new Error(removeError.message);
  }

  if (assignedManager) {
    const { error: insertError } = await supabase
      .from("production_job_owners")
      .insert({
        production_job_id: jobId,
        user_id: assignedManager.id,
        department,
        owner_role: "department_manager",
        assigned_by_user_id: user.id,
        metadata: {
          source: "job_detail_manager_update",
          source_task_id: taskId,
        },
      });

    if (insertError) {
      throw new Error(insertError.message);
    }
  }

  await writeProductionJobEvent(supabase, {
    productionJobId: jobId,
    productionTaskId: taskId,
    actorUserId: user.id,
    eventType: assignedManager
      ? "job_department_manager_updated"
      : "job_department_manager_cleared",
    source: "manual",
    fromStateKey: currentOwner?.user_id ?? null,
    fromStateLabel: currentOwner?.user_id ?? null,
    toStateKey: assignedManager?.id ?? null,
    toStateLabel:
      assignedManager?.full_name ?? assignedManager?.email ?? null,
    workflowDefinitionId: job.workflow_definition_id,
    workflowVersion: job.workflow_version,
    metadata: {
      department,
      owner_role: "department_manager",
      source_task_id: taskId,
    },
  });

  revalidateJob(jobId);
  revalidatePath("/dashboard");
  revalidatePath("/production/ownership-queue");
  revalidatePath("/production/ownership-admin");
  redirect(`/production/${jobId}`);
}

export async function addProductionTaskCollaborator(formData: FormData) {
  const { profile, user } = await requireProductionAccess();
  const jobId = formValue(formData, "jobId");
  const taskId = formValue(formData, "taskId");
  const userId = formValue(formData, "userId");
  const role = collaboratorRole(formValue(formData, "collaboratorRole"));
  const note = formValue(formData, "note");

  if (!canManageTaskRouting(profile) || !jobId || !taskId || !userId || !role) {
    redirect(jobId ? `/production/${jobId}` : "/production");
  }

  const supabase = await createClient();

  await addTaskCollaborator(supabase, {
    actorUserId: user.id,
    collaboratorRole: role,
    note: note || null,
    taskId,
    userId,
  });
  revalidateJob(jobId);
  redirect(`/production/${jobId}`);
}

export async function removeProductionTaskCollaborator(formData: FormData) {
  const { profile, user } = await requireProductionAccess();
  const jobId = formValue(formData, "jobId");
  const taskId = formValue(formData, "taskId");
  const collaboratorId = formValue(formData, "collaboratorId");
  const note = formValue(formData, "note");

  if (
    !canManageTaskRouting(profile) ||
    !jobId ||
    !taskId ||
    !collaboratorId
  ) {
    redirect(jobId ? `/production/${jobId}` : "/production");
  }

  const supabase = await createClient();

  await removeTaskCollaborator(supabase, {
    actorUserId: user.id,
    collaboratorId,
    note: note || null,
    taskId,
  });
  revalidateJob(jobId);
  redirect(`/production/${jobId}`);
}

export async function advanceProductionPhase(formData: FormData) {
  const { profile, user } = await requireProductionAccess();
  const jobId = formValue(formData, "jobId");
  const toPhaseKey = formValue(formData, "toPhaseKey");

  if (!canManageProduction(profile.role) || !jobId || !toPhaseKey) {
    redirect(jobId ? `/production/${jobId}` : "/production");
  }

  const supabase = await createClient();

  await transitionProductionJobPhase(supabase, {
    actorUserId: user.id,
    productionJobId: jobId,
    toPhaseKey,
    userRole: profile.role,
  });
  revalidateJob(jobId);
  redirect(`/production/${jobId}`);
}
