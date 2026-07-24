import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppRole } from "@/lib/auth/roles";

type JsonObject = Record<string, unknown>;

export type WorkflowEventSource =
  | "manual"
  | "system"
  | "printavo_sync"
  | "zapier_webhook"
  | "admin_override";

export type ProductionTaskStatus =
  | "open"
  | "in_progress"
  | "blocked"
  | "complete"
  | "cancelled"
  | "skipped";

export type PrintavoOrderForProduction = {
  amount_paid?: number | string | null;
  id: number;
  order_number?: string | number | null;
  invoice_number?: string | number | null;
  visual_id?: string | number | null;
  status_id?: number | null;
  orderstatus_id?: number | null;
  orderstatus?: {
    id?: number | null;
    name?: string | null;
  } | null;
  paid_at?: string | null;
  customer?: {
    name?: string | null;
  } | null;
  user?: {
    name?: string | null;
  } | null;
  name?: string | null;
  description?: string | null;
  due_date?: string | null;
  metadata?: JsonObject;
};

type WorkflowDefinition = {
  id: string;
  product_category_id: string;
  key: string;
  name: string;
  version: number;
};

type WorkflowStep = {
  id: string;
  workflow_definition_id: string;
  key: string;
  label: string;
  step_type: "phase" | "task" | "milestone";
  track: string;
  sort_order: number;
  is_required: boolean;
  is_active: boolean;
  default_assigned_role: AppRole | null;
  suggested_prompt: string | null;
};

type WorkflowDependency = {
  step_key: string;
  depends_on_step_key: string;
  dependency_type: "required_before_start" | "required_before_complete";
};

type WorkflowTransition = {
  id: string;
  from_step_key: string | null;
  to_step_key: string;
  direction: "forward" | "backward";
  allowed_roles: AppRole[];
  requires_reason: boolean;
};

type ProductionJob = {
  id: string;
  printavo_order_id: number;
  workflow_definition_id: string;
  workflow_version: number;
  current_phase_key: string;
  current_phase_label_snapshot: string;
};

type ProductionTask = {
  id: string;
  production_job_id: string;
  workflow_step_id: string | null;
  workflow_step_key: string;
  workflow_version: number;
  label_snapshot: string;
  track_snapshot: string;
  status: ProductionTaskStatus;
  assigned_role: AppRole | null;
  assigned_user_id: string | null;
  blocked_reason: string | null;
};

type EventInput = {
  productionJobId: string;
  productionTaskId?: string | null;
  actorUserId?: string | null;
  eventType: string;
  source?: WorkflowEventSource;
  fromStateKey?: string | null;
  fromStateLabel?: string | null;
  toStateKey?: string | null;
  toStateLabel?: string | null;
  workflowDefinitionId?: string | null;
  workflowVersion?: number | null;
  reason?: string | null;
  note?: string | null;
  metadata?: JsonObject;
};

type GenerateTasksInput = {
  productionJobId: string;
  workflowDefinitionId: string;
  workflowVersion: number;
  actorUserId?: string | null;
  source?: WorkflowEventSource;
};

type TaskMutationInput = {
  taskId: string;
  actorUserId: string;
  source?: WorkflowEventSource;
  note?: string | null;
};

export type ProductionWorkflowSuggestion = {
  type: "start_task" | "complete_milestone" | "advance_phase";
  productionJobId: string;
  taskId?: string;
  workflowStepKey: string;
  label: string;
  prompt: string;
  track: string;
  sortOrder: number;
};

export class ProductionWorkflowError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly context: JsonObject = {},
  ) {
    super(message);
  }
}

function assertNoError(error: { message: string } | null, action: string): void {
  if (error) {
    throw new ProductionWorkflowError(error.message, "database_error", {
      action,
    });
  }
}

function orderStatusId(order: PrintavoOrderForProduction) {
  return order.orderstatus?.id ?? order.orderstatus_id ?? order.status_id ?? null;
}

function orderStatusName(order: PrintavoOrderForProduction) {
  return order.orderstatus?.name ?? null;
}

function orderNumber(order: PrintavoOrderForProduction) {
  return order.order_number ?? order.invoice_number ?? order.visual_id ?? order.id;
}

function jobName(order: PrintavoOrderForProduction) {
  return (
    order.name ??
    order.description ??
    `Printavo Order #${String(orderNumber(order))}`
  );
}

function customerName(order: PrintavoOrderForProduction) {
  return order.customer?.name ?? order.user?.name ?? null;
}

function toDate(value: string | null | undefined) {
  return value ? value.slice(0, 10) : null;
}

async function getActiveWorkflow(
  supabase: SupabaseClient,
  productCategoryKey: string,
): Promise<WorkflowDefinition> {
  const { data: category, error: categoryError } = await supabase
    .from("product_categories")
    .select("id")
    .eq("key", productCategoryKey)
    .eq("is_active", true)
    .single<{ id: string }>();

  assertNoError(categoryError, "load_product_category");

  if (!category) {
    throw new ProductionWorkflowError(
      `No active product category found for ${productCategoryKey}.`,
      "product_category_not_found",
      { productCategoryKey },
    );
  }

  const { data: workflow, error: workflowError } = await supabase
    .from("workflow_definitions")
    .select("id,product_category_id,key,name,version")
    .eq("product_category_id", category.id)
    .eq("status", "active")
    .order("version", { ascending: false })
    .limit(1)
    .single<WorkflowDefinition>();

  assertNoError(workflowError, "load_active_workflow");

  if (!workflow) {
    throw new ProductionWorkflowError(
      `No active workflow found for ${productCategoryKey}.`,
      "active_workflow_not_found",
      { productCategoryKey },
    );
  }

  return workflow;
}

async function getWorkflowSteps(
  supabase: SupabaseClient,
  workflowDefinitionId: string,
): Promise<WorkflowStep[]> {
  const { data, error } = await supabase
    .from("workflow_steps")
    .select(
      "id,workflow_definition_id,key,label,step_type,track,sort_order,is_required,is_active,default_assigned_role,suggested_prompt",
    )
    .eq("workflow_definition_id", workflowDefinitionId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .returns<WorkflowStep[]>();

  assertNoError(error, "load_workflow_steps");

  return data ?? [];
}

async function getProductionJob(
  supabase: SupabaseClient,
  productionJobId: string,
): Promise<ProductionJob> {
  const { data, error } = await supabase
    .from("production_jobs")
    .select(
      "id,printavo_order_id,workflow_definition_id,workflow_version,current_phase_key,current_phase_label_snapshot",
    )
    .eq("id", productionJobId)
    .single<ProductionJob>();

  assertNoError(error, "load_production_job");

  if (!data) {
    throw new ProductionWorkflowError(
      `Production job ${productionJobId} was not found.`,
      "production_job_not_found",
      { productionJobId },
    );
  }

  return data;
}

async function getProductionTask(
  supabase: SupabaseClient,
  taskId: string,
): Promise<ProductionTask> {
  const { data, error } = await supabase
    .from("production_tasks")
    .select(
      "id,production_job_id,workflow_step_id,workflow_step_key,workflow_version,label_snapshot,track_snapshot,status,assigned_role,assigned_user_id,blocked_reason",
    )
    .eq("id", taskId)
    .single<ProductionTask>();

  assertNoError(error, "load_production_task");

  if (!data) {
    throw new ProductionWorkflowError(
      `Production task ${taskId} was not found.`,
      "production_task_not_found",
      { taskId },
    );
  }

  return data;
}

async function getJobTasks(
  supabase: SupabaseClient,
  productionJobId: string,
): Promise<ProductionTask[]> {
  const { data, error } = await supabase
    .from("production_tasks")
    .select(
      "id,production_job_id,workflow_step_id,workflow_step_key,workflow_version,label_snapshot,track_snapshot,status,assigned_role,assigned_user_id,blocked_reason",
    )
    .eq("production_job_id", productionJobId)
    .returns<ProductionTask[]>();

  assertNoError(error, "load_job_tasks");

  return data ?? [];
}

async function getDependencies(
  supabase: SupabaseClient,
  workflowDefinitionId: string,
): Promise<WorkflowDependency[]> {
  const { data, error } = await supabase
    .from("workflow_dependencies")
    .select("step_key,depends_on_step_key,dependency_type")
    .eq("workflow_definition_id", workflowDefinitionId)
    .returns<WorkflowDependency[]>();

  assertNoError(error, "load_workflow_dependencies");

  return data ?? [];
}

function isCompleteEnough(task: ProductionTask | undefined) {
  return task?.status === "complete" || task?.status === "skipped";
}

function unmetDependenciesFor(
  task: ProductionTask,
  tasksByKey: Map<string, ProductionTask>,
  dependencies: WorkflowDependency[],
  dependencyType: WorkflowDependency["dependency_type"],
) {
  return dependencies
    .filter(
      (dependency) =>
        dependency.step_key === task.workflow_step_key &&
        dependency.dependency_type === dependencyType,
    )
    .filter(
      (dependency) =>
        !isCompleteEnough(tasksByKey.get(dependency.depends_on_step_key)),
    );
}

export async function writeProductionJobEvent(
  supabase: SupabaseClient,
  input: EventInput,
) {
  const { data, error } = await supabase
    .from("production_job_events")
    .insert({
      production_job_id: input.productionJobId,
      production_task_id: input.productionTaskId ?? null,
      actor_user_id: input.actorUserId ?? null,
      event_type: input.eventType,
      source: input.source ?? "manual",
      from_state_key: input.fromStateKey ?? null,
      from_state_label_snapshot: input.fromStateLabel ?? null,
      to_state_key: input.toStateKey ?? null,
      to_state_label_snapshot: input.toStateLabel ?? null,
      workflow_definition_id: input.workflowDefinitionId ?? null,
      workflow_version: input.workflowVersion ?? null,
      reason: input.reason ?? null,
      note: input.note ?? null,
      metadata: input.metadata ?? {},
    })
    .select("id")
    .single<{ id: string }>();

  assertNoError(error, "write_production_job_event");

  return data;
}

export async function generateTasksForWorkflow(
  supabase: SupabaseClient,
  input: GenerateTasksInput,
) {
  const steps = await getWorkflowSteps(supabase, input.workflowDefinitionId);
  const taskRows = steps
    .filter((step) => step.step_type !== "phase")
    .map((step) => ({
      production_job_id: input.productionJobId,
      workflow_step_id: step.id,
      workflow_step_key: step.key,
      workflow_version: input.workflowVersion,
      label_snapshot: step.label,
      track_snapshot: step.track,
      status: "open" satisfies ProductionTaskStatus,
      assigned_role: step.default_assigned_role,
      metadata: {
        generated_from_workflow_step_id: step.id,
      },
    }));

  if (taskRows.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("production_tasks")
    .upsert(taskRows, {
      onConflict: "production_job_id,workflow_step_key",
      ignoreDuplicates: false,
    })
    .select(
      "id,production_job_id,workflow_step_id,workflow_step_key,workflow_version,label_snapshot,track_snapshot,status,assigned_role,assigned_user_id,blocked_reason",
    )
    .returns<ProductionTask[]>();

  assertNoError(error, "generate_tasks_for_workflow");

  await writeProductionJobEvent(supabase, {
    productionJobId: input.productionJobId,
    actorUserId: input.actorUserId ?? null,
    eventType: "workflow_tasks_generated",
    source: input.source ?? "system",
    workflowDefinitionId: input.workflowDefinitionId,
    workflowVersion: input.workflowVersion,
    metadata: {
      generated_task_count: data?.length ?? 0,
    },
  });

  return data ?? [];
}

export async function createProductionJobFromPrintavoOrder(
  supabase: SupabaseClient,
  input: {
    order: PrintavoOrderForProduction;
    actorUserId?: string | null;
    productCategoryKey?: string;
    source?: WorkflowEventSource;
  },
) {
  const productCategoryKey = input.productCategoryKey ?? "screen_printing";
  const workflow = await getActiveWorkflow(supabase, productCategoryKey);
  const steps = await getWorkflowSteps(supabase, workflow.id);
  const initialPhase =
    steps.find((step) => step.key === "phase.needs_sourcing") ??
    steps.find((step) => step.step_type === "phase");

  if (!initialPhase) {
    throw new ProductionWorkflowError(
      "The active workflow has no phase step.",
      "workflow_phase_missing",
      { workflowDefinitionId: workflow.id },
    );
  }

  const statusId = orderStatusId(input.order);
  const statusName = orderStatusName(input.order);
  const { data: job, error } = await supabase
    .from("production_jobs")
    .upsert(
      {
        printavo_order_id: input.order.id,
        printavo_order_number: String(orderNumber(input.order)),
        printavo_status_id: statusId,
        printavo_status_name: statusName,
        printavo_paid_at: input.order.paid_at ?? null,
        product_category_id: workflow.product_category_id,
        workflow_definition_id: workflow.id,
        workflow_version: workflow.version,
        current_phase_key: initialPhase.key,
        current_phase_label_snapshot: initialPhase.label,
        customer_name: customerName(input.order),
        job_name: jobName(input.order),
        due_date: toDate(input.order.due_date),
        last_printavo_synced_at: new Date().toISOString(),
        metadata: {
          source_order: input.order.metadata ?? {},
        },
      },
      { onConflict: "printavo_order_id", ignoreDuplicates: false },
    )
    .select(
      "id,printavo_order_id,workflow_definition_id,workflow_version,current_phase_key,current_phase_label_snapshot",
    )
    .single<ProductionJob>();

  assertNoError(error, "create_production_job_from_printavo_order");

  if (!job) {
    throw new ProductionWorkflowError(
      "Production job was not returned after upsert.",
      "production_job_upsert_failed",
      { printavoOrderId: input.order.id },
    );
  }

  const tasks = await generateTasksForWorkflow(supabase, {
    productionJobId: job.id,
    workflowDefinitionId: job.workflow_definition_id,
    workflowVersion: job.workflow_version,
    actorUserId: input.actorUserId ?? null,
    source: input.source ?? "printavo_sync",
  });

  await writeProductionJobEvent(supabase, {
    productionJobId: job.id,
    actorUserId: input.actorUserId ?? null,
    eventType: "job_synced_from_printavo",
    source: input.source ?? "printavo_sync",
    toStateKey: job.current_phase_key,
    toStateLabel: job.current_phase_label_snapshot,
    workflowDefinitionId: job.workflow_definition_id,
    workflowVersion: job.workflow_version,
    metadata: {
      printavo_order_id: input.order.id,
      printavo_status_id: statusId,
      printavo_status_name: statusName,
      generated_task_count: tasks.length,
    },
  });

  return {
    job,
    tasks,
  };
}

export async function completeTask(
  supabase: SupabaseClient,
  input: TaskMutationInput,
) {
  const task = await getProductionTask(supabase, input.taskId);
  const job = await getProductionJob(supabase, task.production_job_id);
  const dependencies = await getDependencies(
    supabase,
    job.workflow_definition_id,
  );
  const jobTasks = await getJobTasks(supabase, job.id);
  const tasksByKey = new Map(
    jobTasks.map((jobTask) => [jobTask.workflow_step_key, jobTask]),
  );
  const unmetDependencies = unmetDependenciesFor(
    task,
    tasksByKey,
    dependencies,
    "required_before_complete",
  );

  if (unmetDependencies.length > 0) {
    throw new ProductionWorkflowError(
      "Task cannot be completed until required dependencies are complete.",
      "task_dependencies_unmet",
      {
        taskId: task.id,
        workflowStepKey: task.workflow_step_key,
        unmetDependencies,
      },
    );
  }

  const completedAt = new Date().toISOString();
  const { data: updatedTask, error } = await supabase
    .from("production_tasks")
    .update({
      status: "complete" satisfies ProductionTaskStatus,
      blocked_reason: null,
      started_at: completedAt,
      completed_at: completedAt,
      completed_by: input.actorUserId,
    })
    .eq("id", task.id)
    .select(
      "id,production_job_id,workflow_step_id,workflow_step_key,workflow_version,label_snapshot,track_snapshot,status,assigned_role,assigned_user_id,blocked_reason",
    )
    .single<ProductionTask>();

  assertNoError(error, "complete_task");

  await writeProductionJobEvent(supabase, {
    productionJobId: task.production_job_id,
    productionTaskId: task.id,
    actorUserId: input.actorUserId,
    eventType: "task_completed",
    source: input.source ?? "manual",
    fromStateKey: task.status,
    fromStateLabel: task.status,
    toStateKey: "complete",
    toStateLabel: "Complete",
    workflowDefinitionId: job.workflow_definition_id,
    workflowVersion: job.workflow_version,
    note: input.note,
    metadata: {
      workflow_step_key: task.workflow_step_key,
      label_snapshot: task.label_snapshot,
    },
  });

  return updatedTask;
}

export async function blockTask(
  supabase: SupabaseClient,
  input: TaskMutationInput & { reason: string },
) {
  const task = await getProductionTask(supabase, input.taskId);
  const job = await getProductionJob(supabase, task.production_job_id);
  const { data: updatedTask, error } = await supabase
    .from("production_tasks")
    .update({
      status: "blocked" satisfies ProductionTaskStatus,
      blocked_reason: input.reason,
      completed_at: null,
      completed_by: null,
    })
    .eq("id", task.id)
    .select(
      "id,production_job_id,workflow_step_id,workflow_step_key,workflow_version,label_snapshot,track_snapshot,status,assigned_role,assigned_user_id,blocked_reason",
    )
    .single<ProductionTask>();

  assertNoError(error, "block_task");

  await writeProductionJobEvent(supabase, {
    productionJobId: task.production_job_id,
    productionTaskId: task.id,
    actorUserId: input.actorUserId,
    eventType: "task_blocked",
    source: input.source ?? "manual",
    fromStateKey: task.status,
    fromStateLabel: task.status,
    toStateKey: "blocked",
    toStateLabel: "Blocked",
    workflowDefinitionId: job.workflow_definition_id,
    workflowVersion: job.workflow_version,
    reason: input.reason,
    note: input.note,
    metadata: {
      workflow_step_key: task.workflow_step_key,
      label_snapshot: task.label_snapshot,
    },
  });

  return updatedTask;
}

export async function reopenTask(
  supabase: SupabaseClient,
  input: TaskMutationInput,
) {
  const task = await getProductionTask(supabase, input.taskId);
  const job = await getProductionJob(supabase, task.production_job_id);
  const { data: updatedTask, error } = await supabase
    .from("production_tasks")
    .update({
      status: "open" satisfies ProductionTaskStatus,
      blocked_reason: null,
      completed_at: null,
      completed_by: null,
    })
    .eq("id", task.id)
    .select(
      "id,production_job_id,workflow_step_id,workflow_step_key,workflow_version,label_snapshot,track_snapshot,status,assigned_role,assigned_user_id,blocked_reason",
    )
    .single<ProductionTask>();

  assertNoError(error, "reopen_task");

  await writeProductionJobEvent(supabase, {
    productionJobId: task.production_job_id,
    productionTaskId: task.id,
    actorUserId: input.actorUserId,
    eventType: "task_reopened",
    source: input.source ?? "manual",
    fromStateKey: task.status,
    fromStateLabel: task.status,
    toStateKey: "open",
    toStateLabel: "Open",
    workflowDefinitionId: job.workflow_definition_id,
    workflowVersion: job.workflow_version,
    note: input.note,
    metadata: {
      workflow_step_key: task.workflow_step_key,
      label_snapshot: task.label_snapshot,
    },
  });

  return updatedTask;
}

export async function unblockTask(
  supabase: SupabaseClient,
  input: TaskMutationInput,
) {
  const task = await getProductionTask(supabase, input.taskId);
  const job = await getProductionJob(supabase, task.production_job_id);
  const nextStatus: ProductionTaskStatus =
    task.status === "blocked" ? "open" : task.status;
  const { data: updatedTask, error } = await supabase
    .from("production_tasks")
    .update({
      status: nextStatus,
      blocked_reason: null,
    })
    .eq("id", task.id)
    .select(
      "id,production_job_id,workflow_step_id,workflow_step_key,workflow_version,label_snapshot,track_snapshot,status,assigned_role,assigned_user_id,blocked_reason",
    )
    .single<ProductionTask>();

  assertNoError(error, "unblock_task");

  await writeProductionJobEvent(supabase, {
    productionJobId: task.production_job_id,
    productionTaskId: task.id,
    actorUserId: input.actorUserId,
    eventType: "task_unblocked",
    source: input.source ?? "manual",
    fromStateKey: task.status,
    fromStateLabel: task.status,
    toStateKey: nextStatus,
    toStateLabel: nextStatus,
    workflowDefinitionId: job.workflow_definition_id,
    workflowVersion: job.workflow_version,
    note: input.note,
    metadata: {
      workflow_step_key: task.workflow_step_key,
      label_snapshot: task.label_snapshot,
    },
  });

  return updatedTask;
}

export async function canUserPerformTransition(
  supabase: SupabaseClient,
  input: {
    productionJobId: string;
    toPhaseKey: string;
    userRole: AppRole;
    reason?: string | null;
  },
) {
  const job = await getProductionJob(supabase, input.productionJobId);
  const { data: transition, error } = await supabase
    .from("workflow_transitions")
    .select("id,from_step_key,to_step_key,direction,allowed_roles,requires_reason")
    .eq("workflow_definition_id", job.workflow_definition_id)
    .eq("from_step_key", job.current_phase_key)
    .eq("to_step_key", input.toPhaseKey)
    .eq("is_active", true)
    .maybeSingle<WorkflowTransition>();

  assertNoError(error, "load_workflow_transition");

  if (!transition) {
    return {
      allowed: false,
      reason: "No active transition exists for this phase change.",
      transition: null,
    };
  }

  if (!transition.allowed_roles.includes(input.userRole)) {
    return {
      allowed: false,
      reason: "User role is not allowed to perform this transition.",
      transition,
    };
  }

  if (transition.requires_reason && !input.reason) {
    return {
      allowed: false,
      reason: "This transition requires a reason.",
      transition,
    };
  }

  return {
    allowed: true,
    reason: null,
    transition,
  };
}

export async function transitionProductionJobPhase(
  supabase: SupabaseClient,
  input: {
    productionJobId: string;
    toPhaseKey: string;
    actorUserId: string;
    userRole: AppRole;
    reason?: string | null;
    note?: string | null;
    source?: WorkflowEventSource;
  },
) {
  const job = await getProductionJob(supabase, input.productionJobId);
  const permission = await canUserPerformTransition(supabase, {
    productionJobId: input.productionJobId,
    toPhaseKey: input.toPhaseKey,
    userRole: input.userRole,
    reason: input.reason,
  });

  if (!permission.allowed) {
    throw new ProductionWorkflowError(
      permission.reason ?? "Transition is not allowed.",
      "transition_not_allowed",
      {
        productionJobId: input.productionJobId,
        fromPhaseKey: job.current_phase_key,
        toPhaseKey: input.toPhaseKey,
        userRole: input.userRole,
      },
    );
  }

  const { data: phaseStep, error: phaseError } = await supabase
    .from("workflow_steps")
    .select("key,label")
    .eq("workflow_definition_id", job.workflow_definition_id)
    .eq("key", input.toPhaseKey)
    .eq("step_type", "phase")
    .single<{ key: string; label: string }>();

  assertNoError(phaseError, "load_target_phase");

  if (!phaseStep) {
    throw new ProductionWorkflowError(
      `Target phase ${input.toPhaseKey} was not found.`,
      "target_phase_not_found",
      { productionJobId: input.productionJobId, toPhaseKey: input.toPhaseKey },
    );
  }

  const { data: updatedJob, error } = await supabase
    .from("production_jobs")
    .update({
      current_phase_key: phaseStep.key,
      current_phase_label_snapshot: phaseStep.label,
    })
    .eq("id", job.id)
    .select(
      "id,printavo_order_id,workflow_definition_id,workflow_version,current_phase_key,current_phase_label_snapshot",
    )
    .single<ProductionJob>();

  assertNoError(error, "transition_production_job_phase");

  await writeProductionJobEvent(supabase, {
    productionJobId: job.id,
    actorUserId: input.actorUserId,
    eventType: "job_phase_transitioned",
    source: input.source ?? "manual",
    fromStateKey: job.current_phase_key,
    fromStateLabel: job.current_phase_label_snapshot,
    toStateKey: phaseStep.key,
    toStateLabel: phaseStep.label,
    workflowDefinitionId: job.workflow_definition_id,
    workflowVersion: job.workflow_version,
    reason: input.reason,
    note: input.note,
    metadata: {
      transition_id: permission.transition?.id ?? null,
      direction: permission.transition?.direction ?? null,
    },
  });

  return updatedJob;
}

export async function suggestNextActions(
  supabase: SupabaseClient,
  productionJobId: string,
): Promise<ProductionWorkflowSuggestion[]> {
  const job = await getProductionJob(supabase, productionJobId);
  const [steps, tasks, dependencies] = await Promise.all([
    getWorkflowSteps(supabase, job.workflow_definition_id),
    getJobTasks(supabase, productionJobId),
    getDependencies(supabase, job.workflow_definition_id),
  ]);
  const stepsByKey = new Map(steps.map((step) => [step.key, step]));
  const tasksByKey = new Map(tasks.map((task) => [task.workflow_step_key, task]));
  const taskSuggestions = tasks
    .filter((task) => task.status === "open" || task.status === "in_progress")
    .filter(
      (task) =>
        unmetDependenciesFor(
          task,
          tasksByKey,
          dependencies,
          "required_before_start",
        ).length === 0,
    )
    .map((task): ProductionWorkflowSuggestion => {
      const step = stepsByKey.get(task.workflow_step_key);
      const isMilestone = step?.step_type === "milestone";

      return {
        type: isMilestone ? "complete_milestone" : "start_task",
        productionJobId,
        taskId: task.id,
        workflowStepKey: task.workflow_step_key,
        label: task.label_snapshot,
        prompt:
          step?.suggested_prompt ??
          (isMilestone
            ? `Mark ${task.label_snapshot} complete?`
            : `Start ${task.label_snapshot}?`),
        track: task.track_snapshot,
        sortOrder: step?.sort_order ?? 0,
      };
    });

  const { data: transitions, error } = await supabase
    .from("workflow_transitions")
    .select("id,from_step_key,to_step_key,direction,allowed_roles,requires_reason")
    .eq("workflow_definition_id", job.workflow_definition_id)
    .eq("from_step_key", job.current_phase_key)
    .eq("direction", "forward")
    .eq("is_active", true)
    .returns<WorkflowTransition[]>();

  assertNoError(error, "load_forward_transitions");

  const phaseSuggestions = (transitions ?? []).flatMap((transition) => {
    const phaseStep = stepsByKey.get(transition.to_step_key);

    if (!phaseStep) {
      return [];
    }

    const phaseTask = tasksByKey.get(transition.to_step_key);

    if (
      phaseTask &&
      unmetDependenciesFor(
        phaseTask,
        tasksByKey,
        dependencies,
        "required_before_complete",
      ).length > 0
    ) {
      return [];
    }

    return [
      {
        type: "advance_phase" as const,
        productionJobId,
        workflowStepKey: transition.to_step_key,
        label: phaseStep.label,
        prompt:
          phaseStep.suggested_prompt ?? `Move job to ${phaseStep.label}?`,
        track: phaseStep.track,
        sortOrder: phaseStep.sort_order,
      },
    ];
  });

  return [...taskSuggestions, ...phaseSuggestions].sort(
    (left, right) => left.sortOrder - right.sortOrder,
  );
}
