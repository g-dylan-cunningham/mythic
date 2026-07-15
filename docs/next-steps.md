# Next Steps: Medium Production Workflow Build

Last updated: 2026-07-09

## At A Glance

Goal: keep Printavo as the customer/commercial system of record, then build
Mythic into the production workflow layer for sourcing, receiving, production
queues, task updates, QR scans, time tracking, and reporting.

Recommended rollout:

1. Alignment and workflow inventory.
2. Local database and production data model.
3. Read-only Printavo sync.
4. Status mapping and production job creation.
5. Role queues and job detail UI.
6. Task status updates and audit events.
7. Receiving, QR, time tracking, and reporting.
8. Controlled rollout away from Monday for received/production jobs.

Priority order:

1. Build the truth layer: database, sync, raw payloads, mappings.
2. Build the operating layer: jobs, tasks, role queues, job detail.
3. Build the action layer: status updates, receiving, blocking, assignments.
4. Build the efficiency layer: QR scans, time tracking, reports, write-backs.

## Phase 1 Spec Packet

Phase 1 PRD/spec documents:

- [Production Workflow POC](/Users/gdylanc/workspace/mythic/mythic/docs/prd/production-workflow-poc.md)
- [Data Model](/Users/gdylanc/workspace/mythic/mythic/docs/prd/data-model.md)
- [Workflow Config And Versioning](/Users/gdylanc/workspace/mythic/mythic/docs/prd/workflow-config.md)
- [Printavo Sync](/Users/gdylanc/workspace/mythic/mythic/docs/prd/printavo-sync.md)
- [POC Implementation Plan](/Users/gdylanc/workspace/mythic/mythic/docs/prd/poc-implementation-plan.md)

## What We Are Building

The medium build should not replace Printavo. Printavo should continue handling:

- Billing and payments.
- Customer messaging.
- Quote/invoice approval.
- Customer-facing order status.
- Invoice, workorder, packing slip, and public links.

Mythic should own the production side:

- Sourcing tasks.
- Apparel ordering and receiving.
- Parallel artwork/apparel/production-prep tracks.
- Production lead planning.
- Worker queues.
- Task status updates.
- Blocked job handling.
- QR-based receiving or shop-floor updates.
- Time tracking.
- Production reporting.

## Rollout Plan

### Phase 0: Alignment And Workflow Inventory

Purpose: make sure we are mapping the real workflow before building the wrong
workflow efficiently.

Tasks:

- Confirm the exact Printavo statuses Mythic uses today. (done, see statuses.json)
- Identify which Printavo status should create a production job. The likely
  first trigger is `Schedule & Order Garments`. (yes, confirmed)
- Review the current Zapier automation and capture its trigger and payload.
- Identify which Monday columns are required, optional, or historical clutter.
- Confirm whether Monday and Mythic can run side-by-side during rollout.
- Decide the first production job type to support.

Deliverable:

- A status mapping draft and a first-pass list of required production fields.

### Phase 1: Local Database And Data Model

Purpose: create the local operational model before building UI.

Tables or concepts to add:

- `printavo_order_statuses`: mirrored Printavo status IDs, names, colors, and
  sync metadata.
- `printavo_orders`: mirrored Printavo orders with customer summary, status,
  dates, totals, line item summary, and useful URLs.
- `printavo_status_mappings`: configurable rules from Printavo statuses to
  Mythic lifecycle triggers.
- `production_jobs`: internal production job keyed to a Printavo order.
- `production_tasks`: actionable work items generated from a job.
- `production_job_events`: timeline/audit log for sync events, status changes,
  manual edits, QR scans, receiving actions, and worker activity.
- Optional later: `production_job_tracks` for parallel artwork, apparel,
  receiving, prep, and production progress.

Deliverable:

- Supabase migrations and seed fixtures for a realistic demo job.

### Phase 2: Read-Only Printavo Sync

Purpose: get reliable data into Mythic without changing operations yet.

Tasks:

- Sync `/api/v1/orderstatuses`.
- Pull recent `/api/v1/orders`.
- Store raw payload snapshots in `api_raw_payloads`.
- Upsert mirrored orders idempotently.
- Record sync runs and errors.
- Add a manual "sync now" path for development/admin use.
- Add scheduled sync via cron or similar.
- Consider a Zapier webhook endpoint as a wake-up signal, but keep scheduled
  reconciliation as the safety net.

Deliverable:

- A read-only Printavo lifecycle table showing order, status, customer, due
  date, quantity summary, and whether the order would create a production job.

### Phase 3: Status Mapping And Production Job Creation

Purpose: turn mirrored Printavo updates into local production work.

Tasks:

- Build an admin mapping screen or simple config for Printavo status mappings.
- Map `Schedule & Order Garments` to production job creation.
- Generate initial production tasks from the mapped status.
- Make job creation idempotent so repeated syncs do not duplicate jobs.
- Store the source event that created or updated the job.

Initial generated tasks:

- Confirm garment requirements.
- Build apparel cart.
- Order apparel.
- Receive apparel.
- Confirm artwork status.
- Schedule production.

Deliverable:

- Printavo orders crossing the mapped status create visible Mythic production
  jobs and initial task checklists.

### Phase 4: Role Queues And Job Detail UI

Purpose: create the daily operating surface.

Views to build:

- Production lead command center.
- Sourcing queue.
- Receiving queue.
- Production worker queue.
- Blocked jobs view.
- Job detail page or drawer.
- Job timeline/event log.

Job detail should show:

- Printavo context and links.
- Customer/order summary.
- Due date, quantity, print type, priority.
- Parallel tracks: artwork, apparel, receiving, production prep, production.
- Checklist/tasks.
- Next best action.
- Event history.

Deliverable:

- Users can see what needs attention by role and inspect the complete state of a
  production job.

### Phase 5: Task Status Updates

Purpose: let Mythic become useful, not just reflective.

Subtasks:

- Define task statuses: `open`, `in_progress`, `blocked`, `complete`,
  `cancelled`.
- Define task actions: start, complete, block, unblock, assign, reassign, add
  note.
- Add blocker reasons: missing goods, damaged goods, art issue, customer issue,
  supplier issue, machine issue, leadership decision, other.
- Add role-specific permissions.
- Create an event for every task and job status change.
- Compute job headline status from tasks/tracks rather than relying only on one
  manually edited field.

Deliverable:

- Production leads and workers can update work safely, with audit history.

### Phase 6: Receiving, QR, Time Tracking, And Reports

Purpose: complete the medium build with operational leverage.

Receiving:

- Mark full or partial receipt.
- Record shortage, overage, damage, or substitution.
- Release fully received jobs to scheduling/production.

QR:

- Generate Mythic QR codes tied to production jobs or boxes.
- Scan to open job.
- Scan to receive goods.
- Scan to start/stop work or complete a task.

Time tracking:

- Start, pause, resume, and stop work.
- Track time by job, task, worker, press, and print type.
- Preserve lead overrides/manual adjustments.

Reports:

- Jobs by phase/status.
- Blocked job aging.
- Throughput by day/press/worker.
- Estimated hours versus tracked hours.
- Receiving shortages and exceptions.

Deliverable:

- Mythic can manage received jobs through production with measurable throughput.

### Phase 7: Controlled Rollout

Purpose: reduce operational risk.

Strategy:

- Start in read-only/shadow mode.
- Run Monday and Mythic side-by-side for a small set of jobs.
- Let production leads validate task generation and status mapping.
- Move one workflow slice into Mythic first, likely receiving or received jobs.
- Keep Printavo write-back limited to major milestones until the internal
  workflow is stable.
- Retire Monday usage gradually once Mythic is trusted.

Deliverable:

- A production workflow that can replace the Monday portion without disrupting
  Printavo or customer-facing operations.

## Major Tasks Still Missing

- Finalize the local production data model.
- Add production-specific roles or permissions.
- Build status mapping for Printavo to Mythic.
- Add scheduled sync and manual sync.
- Add a Zapier wake-up webhook if useful.
- Build idempotent production job creation.
- Build role queues.
- Build job detail with parallel tracks/checklists.
- Build task status actions.
- Build audit/event timeline.
- Build blocked-job handling.
- Build receiving flow.
- Add QR code generation/scanning.
- Add time tracking.
- Add basic production reports.
- Decide when and whether Mythic writes major milestones back to Printavo.

## First Implementation Slice

The first slice should be deliberately small:

1. Add database tables for mirrored Printavo statuses/orders, mappings,
   production jobs, production tasks, and production job events.
2. Sync Printavo statuses and a recent page of orders.
3. Show a read-only lifecycle table.
4. Configure one mapping: `Schedule & Order Garments` creates a production job.
5. Generate a simple checklist for that job.

This gives the team something real to inspect before committing to the full
workflow UI.
