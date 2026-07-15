# PRD: Printavo Sync

Last updated: 2026-07-14

## Summary

Printavo remains the front-of-house system. Mythic should sync enough Printavo
state to know when to create/update production jobs and preserve useful context.

## Goals

- Sync Printavo order statuses.
- Detect customer payment/order updates.
- Create a Mythic production job when the customer pays.
- Use Printavo status mappings as production cues.
- Poll Printavo every 15 minutes during store hours.
- Store sync/event history.
- Avoid duplicate production jobs.

## Non-Goals For POC

- Full two-way Printavo sync.
- Replacing Printavo billing/messaging.
- Parsing Printavo messages as the main source of truth.
- Full mirror of all Printavo orders, unless needed later.

## Known Printavo Statuses

See [statuses.md](/Users/gdylanc/workspace/mythic/mythic/docs/business-docs/printavo/statuses/statuses.md).

Production-relevant statuses:

- `120802`: `Schedule & Order Garments `
- `37024`: `Ready For Production`
- `492558`: `In Production`
- `533873`: `Production Complete - Fulfillment Ready`

## Polling

First-pass policy:

- Interval: every 15 minutes.
- Window: store hours only.
- Also provide a manual sync for admins/development.
- Every poll creates or updates a sync run record.
- Meaningful changes create `production_job_events`.

## Job Creation Trigger

Target rule:

```txt
If Printavo indicates customer payment received
and no production_job exists for that Printavo order
then create or suggest creating a production_job.
```

Open question: confirm the exact Printavo API signal for customer payment.
Candidates:

- order payment fields
- payment records
- status changes
- message/event metadata
- existing Zapier trigger payload

## Status Mapping Behavior

`Schedule & Order Garments` should remain a production cue:

```txt
If Printavo status becomes Schedule & Order Garments
and production_job exists
then suggest opening/confirming sourcing tasks.
```

Printavo write-back should be limited in the POC. If implemented later, write
back only major milestones and always record an event.

## Idempotency

Sync must be safe to rerun.

Rules:

- `production_jobs.printavo_order_id` should be unique.
- Repeated syncs should update job context, not duplicate jobs.
- Duplicate event creation should be avoided by comparing previous/current
  meaningful state.
- Raw payloads may be stored for debugging if useful.

## Data Captured On Production Job

Minimum Printavo fields to snapshot:

- `printavo_order_id`
- `printavo_order_number` / visual ID if available
- `printavo_status_id`
- `printavo_status_name`
- `printavo_paid_at`
- customer name/company
- due date
- current Printavo URLs if available
- `last_printavo_synced_at`

## Failure Handling

- Record failed sync attempts.
- Expose sync failures to admin/owner.
- Do not block manual production work if Printavo sync is temporarily down.
- Never silently delete local jobs because Printavo data is missing from a poll.

## Open Questions

- What are store hours for polling?
- Does the current Zapier automation expose a cleaner paid/order-updated signal?
- Should sync create jobs automatically on payment in POC, or suggest creation?
- Which Printavo fields should be considered "meaningful changes" for events?
