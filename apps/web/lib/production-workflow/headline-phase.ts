import type { SupabaseClient } from "@supabase/supabase-js";

export type HeadlinePhaseTask = {
  status: string;
  workflow_step_key: string;
};

export type HeadlinePhase = {
  key: string;
  label: string;
};

export const headlinePhases = [
  { key: "phase.needs_sourcing", label: "Needs sourcing", requires: [] },
  {
    key: "phase.awaiting_goods",
    label: "Awaiting goods",
    requires: ["apparel.order_apparel"],
  },
  {
    key: "phase.goods_received",
    label: "Goods received",
    requires: ["apparel.apparel_received"],
  },
  {
    key: "phase.ready_for_production",
    label: "Ready for production",
    requires: [
      "apparel.apparel_received",
      "art.ready_to_burn_screens",
      "prep.burn_screens",
      "prep.confirm_print_locations",
      "prep.confirm_ink_color_count",
      "prep.confirm_garment_handling",
      "prep.confirm_finishing_requirements",
      "prep.estimate_difficulty_time",
    ],
  },
  {
    key: "phase.scheduled",
    label: "Scheduled",
    requires: ["prep.assign_press_day"],
  },
  {
    key: "phase.in_production",
    label: "In production",
    requires: ["production.in_production"],
  },
  {
    key: "phase.finishing_qc",
    label: "Finishing / QC",
    requires: ["production.finishing_qc"],
  },
  {
    key: "phase.production_complete",
    label: "Production complete",
    requires: ["production.production_complete"],
  },
] as const;

function taskIsSatisfied(task: HeadlinePhaseTask | undefined) {
  return task?.status === "complete" || task?.status === "skipped";
}

export function deriveHeadlinePhase(tasks: HeadlinePhaseTask[]): HeadlinePhase {
  const tasksByKey = new Map(
    tasks.map((task) => [task.workflow_step_key, task]),
  );
  let current: HeadlinePhase = headlinePhases[0];

  for (const phase of headlinePhases.slice(1)) {
    if (
      !phase.requires.every((workflowStepKey) =>
        taskIsSatisfied(tasksByKey.get(workflowStepKey)),
      )
    ) {
      break;
    }

    current = phase;
  }

  return current;
}

export function isProductionComplete(tasks: HeadlinePhaseTask[]) {
  return deriveHeadlinePhase(tasks).key === "phase.production_complete";
}

export async function loadHeadlinePhases(
  supabase: SupabaseClient,
  productionJobIds: string[],
) {
  const uniqueJobIds = Array.from(new Set(productionJobIds.filter(Boolean)));

  if (uniqueJobIds.length === 0) {
    return new Map<string, HeadlinePhase>();
  }

  const { data, error } = await supabase
    .from("production_tasks")
    .select("production_job_id,workflow_step_key,status")
    .in("production_job_id", uniqueJobIds)
    .returns<Array<HeadlinePhaseTask & { production_job_id: string }>>();

  if (error) {
    throw new Error(error.message);
  }

  const tasksByJob = new Map<string, HeadlinePhaseTask[]>();

  for (const task of data ?? []) {
    tasksByJob.set(task.production_job_id, [
      ...(tasksByJob.get(task.production_job_id) ?? []),
      task,
    ]);
  }

  return new Map(
    uniqueJobIds.map((jobId) => [
      jobId,
      deriveHeadlinePhase(tasksByJob.get(jobId) ?? []),
    ]),
  );
}

