# POC Implementation Plan

Last updated: 2026-09-12

## Strategy

Build a thin vertical slice:

```txt
seeded workflow config
→ seeded production job
→ generated tasks
→ complete/block/unblock actions
→ calculated headline phase
→ immutable event log
→ Printavo sync hook later
```

Start with a seeded/demo job before live Printavo sync. This proves the workflow
engine and UI model first.

## Phase A: Documentation And Agreement

Status: current phase.

Deliverables:

- Product POC PRD.
- Data model PRD.
- Workflow config PRD.
- Printavo sync PRD.
- POC implementation plan.

## Phase B: Database Foundation

Work items:

- Add workflow config tables.
- Add production job/task/event tables.
- Add Printavo status mapping table.
- Add/adjust production roles or permissions.
- Seed `screen_printing_v1`.
- Seed one realistic demo production job with generated tasks.

Validation:

- Local database reset creates the workflow and demo job.
- Demo job records its workflow version.
- Demo tasks reference workflow steps and store label snapshots.

## Phase C: Workflow Service Layer

Work items:

- `generateTasksForWorkflow(jobId)`
- `completeTask(taskId, actorId)`
- `blockTask(taskId, actorId, reason)`
- `unblockTask(taskId, actorId)`
- `deriveHeadlinePhase(tasks)`
- `writeProductionJobEvent(...)`
- `canUserPerformAction(...)`

Validation:

- Completing or reopening prerequisites changes the headline phase.
- Blocking a task remains visible without creating a second phase state.
- Every action writes an event.

## Phase D: Minimal UI

Work items:

- Production jobs index.
- Job detail page.
- Task tracks/checklist.
- Calculated headline phase.
- Event timeline.
- Admin/debug area for workflow version and state.

Validation:

- User can inspect demo job.
- User can complete a task.
- User can block/unblock a task.
- Headline phase updates with task state.
- Event timeline is readable.

## Phase E: Printavo Sync POC

Work items:

- Sync order statuses.
- Confirm payment-request / invoice-sent trigger.
- Add manual sync for one order or recent orders.
- Create/suggest production job from eligible Printavo order.
- Add 15-minute store-hours polling after manual flow works.

Validation:

- Sync is idempotent.
- No duplicate jobs for same Printavo order.
- Sync creates events.

## Phase F: Review

Review with Dylan/Cole using realistic jobs.

Questions:

- Are the generated tasks correct?
- Are dependencies useful?
- Are the calculated phase gates accurate and useful?
- Does the event log answer "who changed what and when?"
- What should move to v2?

## POC Exit Criteria

- One screen-printing workflow version exists.
- One job can move through task completion with a calculated headline phase.
- Events are written for all manual/system changes.
- Workflow versioning is represented in job/task/event records.
- Printavo sync path is understood, even if not fully automated.
