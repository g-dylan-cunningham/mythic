"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import {
  ORG_DEPARTMENTS,
  type Profile,
  type OrgDepartment,
  canManageUsers,
  canUseOperations,
  isDepartmentManager,
} from "@/lib/auth/roles";
import { assignTask } from "@/lib/production-workflow/engine";
import { createClient } from "@/utils/supabase/server";

function formValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function orgDepartment(value: string): OrgDepartment | null {
  return value !== "operations" && ORG_DEPARTMENTS.includes(value as OrgDepartment)
    ? (value as OrgDepartment)
    : null;
}

function canUsePlanner(profile: Profile) {
  return canManageUsers(profile.role) || isDepartmentManager(profile.authority_level);
}

function plannerPath(department: string) {
  const params = new URLSearchParams();

  if (department) {
    params.set("department", department);
  }

  const query = params.toString();
  return `/production/assignment-planner${query ? `?${query}` : ""}`;
}

export async function assignTaskFromPlanner(formData: FormData) {
  const { profile, user } = await getCurrentProfile();
  const taskId = formValue(formData, "taskId");
  const assignedUserId = formValue(formData, "assignedUserId");
  const note = formValue(formData, "note");
  const selectedDepartment = formValue(formData, "selectedDepartment");

  if (
    !profile ||
    !profile.is_active ||
    !canUseOperations(profile.role) ||
    !canUsePlanner(profile) ||
    !taskId ||
    !assignedUserId
  ) {
    redirect("/dashboard");
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
    assigneeProfile.role !== "staff" ||
    !assigneeProfile.is_active ||
    assigneeProfile.department !== taskForAssignment.owning_department
  ) {
    redirect(plannerPath(selectedDepartment));
  }

  await assignTask(supabase, {
    actorUserId: user.id,
    assignedUserId,
    note: note || null,
    taskId,
  });

  revalidatePath("/dashboard");
  revalidatePath("/production/assignment-planner");
  redirect(plannerPath(selectedDepartment));
}

// Unused by the current assignment planner UI. Kept temporarily as a fallback
// for assigning every unassigned task in one job/department.
export async function batchAssignDepartmentTasksFromPlanner(formData: FormData) {
  const { profile, user } = await getCurrentProfile();
  const assignedUserId = formValue(formData, "assignedUserId");
  const productionJobId = formValue(formData, "productionJobId");
  const note = formValue(formData, "note");
  const selectedDepartment = formValue(formData, "selectedDepartment");
  const department = orgDepartment(selectedDepartment);

  if (
    !profile ||
    !profile.is_active ||
    !canUseOperations(profile.role) ||
    !canUsePlanner(profile) ||
    !assignedUserId ||
    !productionJobId ||
    !department
  ) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const { data: assigneeProfile, error: assigneeProfileError } = await supabase
    .from("profiles")
    .select("id,department,is_active,role")
    .eq("id", assignedUserId)
    .single<{
      department: string | null;
      id: string;
      is_active: boolean;
      role: string;
    }>();

  if (
    assigneeProfileError ||
    !assigneeProfile ||
    assigneeProfile.role !== "staff" ||
    !assigneeProfile.is_active ||
    assigneeProfile.department !== department
  ) {
    redirect(plannerPath(selectedDepartment));
  }

  const { data: tasks, error: tasksError } = await supabase
    .from("production_tasks")
    .select("id,production_job_id")
    .eq("owning_department", department)
    .eq("production_job_id", productionJobId)
    .is("assigned_user_id", null)
    .not("status", "in", "(complete,cancelled,skipped)")
    .returns<Array<{ id: string; production_job_id: string }>>();

  if (tasksError) {
    throw new Error(tasksError.message);
  }

  const assignmentNote =
    note ||
    `Batch assignment for this job from ${department.replaceAll("_", " ")} planner.`;

  for (const task of tasks ?? []) {
    await assignTask(supabase, {
      actorUserId: user.id,
      assignedUserId,
      note: assignmentNote,
      taskId: task.id,
    });
    revalidatePath(`/production/${task.production_job_id}`);
  }

  revalidatePath("/dashboard");
  revalidatePath("/production");
  revalidatePath("/production/assignment-planner");
  redirect(plannerPath(selectedDepartment));
}

export async function assignSelectedTasksFromPlanner(formData: FormData) {
  const { profile, user } = await getCurrentProfile();
  const assignedUserId = formValue(formData, "assignedUserId");
  const productionJobId = formValue(formData, "productionJobId");
  const note = formValue(formData, "note");
  const selectedDepartment = formValue(formData, "selectedDepartment");
  const department = orgDepartment(selectedDepartment);
  const selectAllTasks = formValue(formData, "selectAllTasks") === "1";
  const taskIds = formData
    .getAll("taskIds")
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (
    !profile ||
    !profile.is_active ||
    !canUseOperations(profile.role) ||
    !canUsePlanner(profile) ||
    !assignedUserId ||
    !productionJobId ||
    !department ||
    (!selectAllTasks && taskIds.length === 0)
  ) {
    redirect(plannerPath(selectedDepartment));
  }

  const supabase = await createClient();
  const [
    { data: assigneeProfile, error: assigneeProfileError },
    { data: tasks, error: tasksError },
  ] = await Promise.all([
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
    supabase
      .from("production_tasks")
      .select("id,production_job_id,owning_department,assigned_user_id,status")
      .eq("production_job_id", productionJobId)
      .eq("owning_department", department)
      .is("assigned_user_id", null)
      .not("status", "in", "(complete,cancelled,skipped)")
      .or(
        selectAllTasks
          ? `id.neq.00000000-0000-0000-0000-000000000000`
          : `id.in.(${taskIds.join(",")})`,
      )
      .returns<
        Array<{
          assigned_user_id: string | null;
          id: string;
          owning_department: string | null;
          production_job_id: string;
          status: string;
        }>
      >(),
  ]);

  if (
    assigneeProfileError ||
    tasksError ||
    !assigneeProfile ||
    assigneeProfile.role !== "staff" ||
    !assigneeProfile.is_active ||
    assigneeProfile.department !== department ||
    !tasks ||
    (!selectAllTasks && tasks.length !== taskIds.length) ||
    tasks.length === 0 ||
    tasks.some(
      (task) =>
        task.production_job_id !== productionJobId ||
        task.owning_department !== department ||
        task.assigned_user_id !== null ||
        ["complete", "cancelled", "skipped"].includes(task.status),
    )
  ) {
    redirect(plannerPath(selectedDepartment));
  }

  const assignmentNote =
    note ||
    `Selected task assignment from ${department.replaceAll("_", " ")} planner.`;

  for (const task of tasks) {
    await assignTask(supabase, {
      actorUserId: user.id,
      assignedUserId,
      note: assignmentNote,
      taskId: task.id,
    });
  }

  revalidatePath("/dashboard");
  revalidatePath("/production");
  revalidatePath("/production/assignment-planner");
  revalidatePath(`/production/${productionJobId}`);
  redirect(plannerPath(selectedDepartment));
}
