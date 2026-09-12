# PRD: Production Workflow Data Model

Last updated: 2026-09-12

## Summary

The POC data model should support configurable workflows, one production job per
Printavo order, parallel/sequential tasks, immutable events, and readable
history after workflow changes.

## Design Principles

- Treat `production_tasks.status` as the operational source of truth.
- Calculate the job's headline phase from completed or skipped task milestones;
  do not persist a second mutable phase state.
- Store every meaningful change in `production_job_events`.
- Store task/checklist work in `production_tasks`.
- Store workflow definitions in versioned database config.
- Do not edit active workflow definitions in place.
- Jobs reference the workflow version they were created under.
- Events snapshot labels/metadata so logs remain readable after renames.

## Core Tables

### `product_categories`

Represents broad product/process families.

Initial rows:

- `screen_printing`
- Future: `embroidery`, `dtf_transfer`, `promo_products`

Suggested fields:

- `id`
- `key`
- `name`
- `is_active`
- `created_at`
- `updated_at`

### `workflow_definitions`

Versioned workflow templates.

Suggested fields:

- `id`
- `product_category_id`
- `key`
- `name`
- `version`
- `status`: `draft`, `active`, `retired`
- `effective_at`
- `retired_at`
- `created_by`
- `created_at`
- `updated_at`

Rule: create a new version for workflow changes that affect future jobs.

### `workflow_steps`

Configurable phases/tasks/milestones inside a workflow.

Suggested fields:

- `id`
- `workflow_definition_id`
- `key`
- `label`
- `step_type`: `phase`, `task`, `milestone`
- `track`
- `sort_order`
- `is_required`
- `is_active`
- `default_assigned_role`
- `suggested_prompt`
- `created_at`
- `updated_at`

### `workflow_dependencies`

Represents sequential and parallel prerequisites.

Suggested fields:

- `id`
- `workflow_definition_id`
- `step_key`
- `depends_on_step_key`
- `dependency_type`: `required_before_start`, `required_before_complete`
- `created_at`

Example: `production.ready_for_production` depends on artwork approved, apparel
received, screens ready, print specs confirmed, and estimate completed.

### Derived Headline Phase

Headline phase is a read-time presentation calculated from the job's task
statuses and workflow step keys. Completing or skipping the required milestone
tasks advances the label; reopening an earlier prerequisite moves it backward.
It has no independent transition table or manual phase action.

### `production_jobs`

The operational production record. One row per Printavo order that enters
Mythic production.

Suggested fields:

- `id`
- `printavo_order_id`
- `printavo_order_number`
- `printavo_status_id`
- `printavo_status_name`
- `printavo_paid_at`
- `product_category_id`
- `workflow_definition_id`
- `workflow_version`
- `customer_name`
- `job_name`
- `due_date`
- `priority`
- `blocked_reason`
- `assigned_lead_id`
- `difficulty_score`
- `estimated_minutes`
- `setup_minutes`
- `run_minutes`
- `finishing_minutes`
- `estimate_confidence`
- `estimate_note`
- `last_printavo_synced_at`
- `created_at`
- `updated_at`

### `production_tasks`

Concrete tasks generated from workflow steps for one production job.

Suggested fields:

- `id`
- `production_job_id`
- `workflow_step_id`
- `workflow_step_key`
- `workflow_version`
- `label_snapshot`
- `track_snapshot`
- `status`: `open`, `in_progress`, `blocked`, `complete`, `cancelled`,
  `skipped`
- `assigned_role`
- `assigned_user_id`
- `blocked_reason`
- `started_at`
- `completed_at`
- `completed_by`
- `metadata`
- `created_at`
- `updated_at`

### `production_job_events`

Immutable audit trail for jobs/tasks/sync changes.

Suggested fields:

- `id`
- `production_job_id`
- `production_task_id`
- `actor_user_id`
- `event_type`
- `source`: `manual`, `system`, `printavo_sync`, `zapier_webhook`, `admin_override`
- `from_state_key`
- `from_state_label_snapshot`
- `to_state_key`
- `to_state_label_snapshot`
- `workflow_definition_id`
- `workflow_version`
- `reason`
- `note`
- `metadata`
- `created_at`

Rule: never delete or mutate events except for exceptional admin correction
through a new correction event.

### `printavo_status_mappings`

Maps external Printavo statuses/signals to Mythic behavior.

Suggested fields:

- `id`
- `printavo_status_id`
- `printavo_status_name_snapshot`
- `workflow_definition_id`
- `trigger_type`: `create_job`, `open_tasks`, `suggest_phase`, `write_event`
- `target_phase_key`
- `target_task_key`
- `is_active`
- `created_at`
- `updated_at`

## Tables To Defer

### `printavo_orders`

Defer unless we want a read-only Printavo lifecycle dashboard for orders that
have not become production jobs.

### `workflow_estimate_fields`

Defer until category-specific estimation needs are better understood.

## Migration Notes

- Add workflow config tables before production job tables.
- Seed `screen_printing_v1`.
- Seed demo jobs/tasks for local development.
- Existing auth roles may need extension for production lead/worker access.
