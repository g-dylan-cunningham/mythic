"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import {
  canManageProduction,
  canUseOperations,
  canWorkProductionTasks,
} from "@/lib/auth/roles";
import {
  blockTask,
  completeTask,
  reopenTask,
  suggestNextActions,
  transitionProductionJobPhase,
  unblockTask,
} from "@/lib/production-workflow/engine";
import { createClient } from "@/utils/supabase/server";

function formValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
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

async function isTaskTrackComplete(
  supabase: Awaited<ReturnType<typeof createClient>>,
  jobId: string,
  track: string,
) {
  const { data: trackTasks, error } = await supabase
    .from("production_tasks")
    .select("status")
    .eq("production_job_id", jobId)
    .eq("track_snapshot", track)
    .returns<Array<{ status: string }>>();

  if (error) {
    throw new Error(error.message);
  }

  return (
    (trackTasks?.length ?? 0) > 0 &&
    (trackTasks ?? []).every(
      (task) => task.status === "complete" || task.status === "skipped",
    )
  );
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

  const completedLastTaskInTrack = await isTaskTrackComplete(
    supabase,
    jobId,
    completedTask.track_snapshot,
  );

  if (completedLastTaskInTrack && canManageProduction(profile.role)) {
    const nextPhase = (await suggestNextActions(supabase, jobId)).find(
      (suggestion) => suggestion.type === "advance_phase",
    );

    if (nextPhase) {
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

  if (!canWorkProductionTasks(profile.role) || !jobId || !taskId || !reason) {
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
