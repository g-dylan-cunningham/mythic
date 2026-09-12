# PRD: Production Workflow POC

Last updated: 2026-09-12

## Summary

Build a proof of concept for Mythic's production workflow layer. Printavo remains
the front-of-house system for quotes, approvals, payment, customer messaging,
and customer-facing status. Mythic becomes the back-of-house system for
production jobs, workflow tasks, dependencies, calculated headline phases, and audit
events.

The POC should prove the architecture before the full medium build.

## POC Goal

Prove this loop:

1. A customer pays in Printavo.
2. Mythic creates one `production_job` for the Printavo order.
3. Mythic assigns a versioned screen-printing workflow.
4. Mythic generates workflow tasks across parallel tracks.
5. Users complete/block/unblock tasks.
6. Mythic calculates the job's headline phase from task milestones.
7. Every meaningful change creates an immutable event.

## In Scope

- Screen-printing workflow only.
- One production job per Printavo order.
- Versioned workflow config in the database.
- Production jobs, tasks, dependencies, and event log.
- Seeded/demo job flow before live Printavo sync.
- Minimal job list and job detail UI.
- Headline phase calculated from task status, with no parallel mutable state.
- Basic role rules for owner/admin/production lead/worker.

## Out Of Scope For POC

- Full Monday replacement.
- Full Kanban board.
- QR code scanning.
- Time tracking implementation.
- Production reports.
- Customer portal.
- Embroidery workflow UI.
- Complex Printavo write-back.
- Visual workflow editor.

## Users

- Owner/admin: configure and inspect workflow behavior and review the event log.
- Production lead: inspect production jobs, complete/check tasks, block/unblock
  work, and manage assignments.
- Production worker: complete assigned forward-moving tasks.

## Success Criteria

- A seeded/demo screen-printing job renders with parallel task tracks.
- Completing prerequisite tasks updates the calculated headline phase.
- Completing/blocking/unblocking a task writes an event.
- Reopening an earlier prerequisite moves the calculated phase backward.
- A job records the workflow version it was created under.
- Existing event logs remain readable even if workflow labels change later.

## First Workflow

Use `screen_printing_v1` from
[production-process-tree.md](/Users/gdylanc/workspace/mythic/mythic/docs/business-docs/production-process-tree.md).

Initial tracks:

- Artwork
- Apparel sourcing/receiving
- Production prep
- Production
- Customer fulfillment

Initial calculated headline phases:

- `needs_sourcing`
- `awaiting_goods`
- `goods_received`
- `ready_for_production`
- `scheduled`
- `in_production`
- `finishing_qc`
- `production_complete`

## Open Questions

- What exact Printavo API signal should represent "customer paid"?
- Should production job creation be automatic on payment, or suggested/reviewed
  first during rollout?
- Which roles should production workers have in the existing auth model?
- Should old in-flight jobs be migrated into this POC, or should it start with
  new orders only?
