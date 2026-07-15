# PRD: Production Workflow POC

Last updated: 2026-07-14

## Summary

Build a proof of concept for Mythic's production workflow layer. Printavo remains
the front-of-house system for quotes, approvals, payment, customer messaging,
and customer-facing status. Mythic becomes the back-of-house system for
production jobs, workflow tasks, dependencies, suggested advancement, and audit
events.

The POC should prove the architecture before the full medium build.

## POC Goal

Prove this loop:

1. A customer pays in Printavo.
2. Mythic creates one `production_job` for the Printavo order.
3. Mythic assigns a versioned screen-printing workflow.
4. Mythic generates workflow tasks across parallel tracks.
5. Users complete/block/unblock tasks.
6. Mythic suggests the next job state when dependencies are satisfied.
7. Every meaningful change creates an immutable event.

## In Scope

- Screen-printing workflow only.
- One production job per Printavo order.
- Versioned workflow config in the database.
- Production jobs, tasks, dependencies, and event log.
- Seeded/demo job flow before live Printavo sync.
- Minimal job list and job detail UI.
- Suggested advancement, not silent automation.
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

- Owner/admin: configure and inspect workflow behavior, override state, review
  event log.
- Production lead: inspect production jobs, complete/check tasks, block/unblock
  work, approve suggested advancement.
- Production worker: complete assigned forward-moving tasks.

## Success Criteria

- A seeded/demo screen-printing job renders with parallel task tracks.
- Completing prerequisite tasks causes a suggested next action to appear.
- Completing/blocking/unblocking a task writes an event.
- Backward/override moves are restricted to admin/owner or lead where allowed.
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

Initial headline phases:

- `needs_sourcing`
- `awaiting_goods`
- `goods_received`
- `ready_for_production`
- `scheduled`
- `in_production`
- `finishing_qc`
- `production_complete`
- `blocked`
- `cancelled`

## Open Questions

- What exact Printavo API signal should represent "customer paid"?
- Should production job creation be automatic on payment, or suggested/reviewed
  first during rollout?
- Which roles should production workers have in the existing auth model?
- Should old in-flight jobs be migrated into this POC, or should it start with
  new orders only?
