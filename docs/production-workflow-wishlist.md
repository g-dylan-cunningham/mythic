# Production Workflow Wishlist

Last updated: 2026-07-08

## Context

Notes from the July 8 post-sync conversation with Cole: the current workflow is
linear once an order exists in Printavo. Printavo originates the order and order
number, some sourcing happens through S&S Activewear and possibly other vendors,
Printavo tracks order and shipment state, and a Zapier automation currently
pushes received work into Monday for production management.

The opportunity is to make Mythic Operations the working layer for this flow:
order sourcing, receiving, production queues, shop-floor updates, time tracking,
and exception handling.

## Current Observed Flow

1. Order is created in Printavo and receives a Printavo order number.
2. Staff queries S&S and possibly other providers to build a pending cart of
   goods.
3. Staff places the supplier order and tracks that order in Printavo.
4. Goods move into shipment.
5. Goods are received. It is unclear how much of this is tracked in Printavo
   today.
6. Zapier sends received work into Monday.
7. Monday tracks production work such as status, priority, print type, press,
   production day, art state, garment count-in, finishing, screens, quantity,
   estimated hours, manual adjustments, and tracked time.

## Roles To Consider

- Owner: full account, reporting, integration, and workflow control.
- Admin: manages users, reports, workflow settings, and corrections.
- Production lead: prioritizes jobs, assigns press/day/worker, edits workflow
  state, resolves exceptions, and can override estimates.
- Production worker: sees assigned or available jobs, starts/stops work, scans
  QR codes, updates limited production statuses, and adds notes.
- Staff/customer roles already exist and may remain useful outside production.

## Feature Wishlist

### Production Board

- Rebuild the Monday board inside Mythic Operations as a production Kanban/table.
- Support lanes or filters for received, ready for art, screens burned, queued,
  in progress, complete, blocked, and reprint.
- Include production metadata visible in the screenshot: important flag, status,
  print type, press, scheduled day, art state, garment counted-in state, finish,
  multi-location indicator, quantity, screens, estimated hours, manual
  adjustment, and tracked time.
- Provide fast inline edits for production leads.
- Provide simplified worker views focused on the next action.

### Order Lifecycle

- Create a canonical internal job/order record keyed to the Printavo order
  number.
- Track supplier cart pending, supplier order placed, in shipment, received,
  production-ready, in production, complete, and delivered/closed states.
- Store external IDs from Printavo, S&S, and future vendors.
- Keep a timeline of state changes, actors, and automation events.

### Receiving

- Add a receiving workflow for goods arriving from S&S or other suppliers.
- Let staff mark partial receipts, shortages, substitutions, damaged goods, or
  overages.
- Move fully received jobs into the production queue automatically.
- Flag jobs that are blocked because goods are incomplete.

### QR Codes

- Support S&S-provided QR codes when available.
- Generate Mythic QR codes tied to the internal job/order record.
- Use scans to open the job, receive boxes, start/stop work, move status, or
  confirm completion.
- Decide whether QR payloads should contain only an opaque ID or also include
  lightweight box/order metadata.

### Time Tracking

- Replace or mirror Monday time tracking.
- Allow worker start/stop on a job or production step.
- Compare tracked time to estimated hours.
- Preserve manual adjustment fields for production leads.
- Feed reporting on actual labor by print type, press, day, and worker.

### Supplier Order Management

- Use the existing S&S API work as the first supplier integration.
- Build a cart comparison tool that can compare the same garment requirement
  across S&S and future providers.
- Track supplier order status and shipping data where APIs allow it.
- Surface inventory risk before the production promise is made.

### Automation Replacement

- Inventory the current Zapier handoff from Printavo to Monday.
- Replace the Zap with an internal sync when the required trigger is understood.
- Keep a short-term compatibility path if Monday remains in use during rollout.

### Reporting

- Add production throughput reports by day, press, print type, and worker.
- Add SLA/aging reports for jobs waiting on goods, art, screens, production, or
  completion.
- Add variance reports comparing estimated hours to tracked time.
- Add exception reports for blocked, reprint, rush, partial receipt, and
  shortage jobs.

## Build Options

### Small Build

Goal: replace the most annoying manual tracking without rebuilding everything.

- Add production roles in auth and database policy.
- Add a simple internal production jobs table keyed by Printavo order number.
- Build a basic board/table with statuses, priority, due day, quantity, and
  notes.
- Add manual job creation/import from Printavo data already visible to the app.
- Add audit logging for status changes.

This gives Mythic a useful production surface quickly, but staff may still use
Printavo, supplier portals, and Monday/Zapier in parallel.

### Medium Build

Goal: make Mythic the primary production board while preserving external systems
where needed.

- Everything in the small build.
- Add receiving states and partial receipt handling.
- Add QR code generation for internal jobs.
- Add worker start/stop time tracking.
- Add production lead assignment controls.
- Add initial production reporting.
- Replace the Monday board for jobs that have been received.

This likely has the best payoff-to-risk ratio. It takes over the Monday part
first, which appears bounded and operationally valuable.

### Large Build

Goal: make Mythic the end-to-end order operations layer.

- Everything in the medium build.
- Add supplier cart/order management.
- Compare S&S and other vendor availability/pricing for the same order.
- Sync supplier shipment tracking.
- Automate receiving from QR scans and supplier shipment data.
- Replace Zapier with first-party automations.
- Add deeper capacity planning and labor forecasting.

This becomes a true operations system, but it depends on more API discovery and
process validation.

## Recommended Sequence

1. Map the exact Printavo-to-Zapier-to-Monday handoff and confirm the minimum
   fields needed to create a production job.
2. Model internal production jobs and job events in Supabase.
3. Add production lead and production worker roles.
4. Build a read/write production board with manual status updates.
5. Add receiving and blocked/partial goods handling.
6. Add QR code generation and scan-to-open job pages.
7. Add time tracking.
8. Replace Monday for received jobs.
9. Expand supplier order comparison beyond S&S.
10. Replace Zapier with first-party automation once the trigger is reliable.

## Open Questions

- Which Printavo status means an order is ready to source, ordered, shipped, and
  received?
- Does Printavo expose supplier order or shipment details in Mythic's live
  account beyond the documented API, or is that mostly manual today?
- What exact payload does the Zapier automation send into Monday?
- Which Monday columns are required versus convenient historical artifacts?
- Who should be allowed to change production day, press, estimates, and manual
  time adjustments?
- Should QR codes live on boxes, jobs, garments, or all three?
- Does S&S QR data include enough information to identify the Printavo order, or
  do we need Mythic-generated labels?
- Is the first rollout allowed to run Monday and Mythic side-by-side?

## Parking Lot

- Multi-vendor sourcing comparison.
- Supplier pricing and availability history.
- Production capacity planning.
- Art approval workflow.
- Screen lifecycle tracking.
- Customer-facing job status portal.
- Mobile-optimized scan station.
- Packing/shipping closeout workflow.

## Printavo API Findings

Reviewed on 2026-07-08 from the public Printavo Apiary blueprint and the current
Mythic Printavo client.

- The existing app currently uses `/api/v1/accounts` for a connection test and
  `/api/v1/orders` for sales reporting.
- Orders expose `orderstatus_id` and a nested `orderstatus` object with at least
  `name` and `color`.
- Printavo exposes `/api/v1/orderstatuses` to list configured account statuses
  and `/api/v1/orderstatuses/{id}` to inspect one status.
- Printavo exposes `PUT /api/v1/orders/{id}/update_orderstatus` to update an
  order's status by `orderstatus_id`.
- Order list calls support pagination, sorting, and `in_production_after` /
  `in_production_before` filters against production due date.
- Order payloads include useful workflow fields: `approved`, `approved_name`,
  `production_notes`, `notes`, `due_date`, `customer_due_date`, `invoice_date`,
  `payment_due_date`, `delivery_method_id`, `tasks`, `expenses`, customer/user
  summaries, line items, workorder URL, packing slip URL, public URL, and PDF
  URL.
- Line items expose a `goods_status` field in examples, with `need_ordering`
  shown in the docs. The documented API also includes an endpoint named
  `mark_all_lineitems_as_need_ordering`.
- The documented `Order` structure includes `visual_po_number`, which appears
  to be an invoice/customer PO number field rather than a supplier purchase
  order record.
- The public docs do not show a first-class supplier purchase order, vendor
  order, shipment tracking, receiving, or package tracking resource.

Implication: Printavo is a good source for order identity, global order status,
customer/order metadata, line item requirements, and possibly basic goods-needed
state. It does not appear to be a sufficient source of truth for supplier PO
tracking or receiving unless Mythic encodes those details into statuses, tasks,
expenses, notes, or account-specific fields not shown in the public docs.

## Printavo Sync Strategy

The likely product boundary is: keep Printavo as the system of record for
billing, customer messages, customer-facing invoice links, payment requests,
approval events, and high-level order status. Mythic should mirror enough of
that lifecycle to know when production work should begin, then extend the
pipeline with production-specific states that Printavo and Monday do not model
well.

### Events Observed In Printavo UI

The July 8 screenshot shows Printavo acting as a customer/order communication
timeline. Example visible events include:

- Payment chasing message delivered.
- Invoice approved and payment request sent.
- Quote/art approval message opened.
- Successful payment received.
- Status changed to `Schedule & Order Garments`.

These are valuable context, but they are not all necessarily clean API events.
The documented Messages API exposes message records with `messageable_type`,
`messageable_id`, subject, text, delivery status, and timestamps. The documented
index does not show a per-order filter. Orders can include related messages and
tasks in some responses.

### Recommended Ownership Boundary

- Printavo owns customer billing, payment requests, customer message history,
  approvals, invoice/workorder/packing slip links, and the customer-facing
  status.
- Mythic mirrors Printavo order ID, visual/invoice number, customer summary,
  order status, relevant dates, line item requirements, tasks/messages metadata
  if available, and raw payload snapshots.
- Mythic owns production readiness, supplier ordering, receiving, production
  board states, QR scans, worker activity, production notes, time tracking, and
  production reporting.

### Status Mapping

Create a configurable mapping from Printavo `orderstatus_id` values to Mythic
production triggers. A first-pass mapping could look like:

- Quote/request states: ignore for production board unless explicitly flagged.
- Approved/payment-request states: visible as pre-production context.
- `Schedule & Order Garments`: create or activate a Mythic production job and
  mark it `needs_sourcing`.
- Supplier/cart/order states, if represented by Printavo statuses: map to
  `sourcing`, `supplier_ordered`, or `awaiting_goods`.
- Received/ready states, if represented by Printavo statuses: map to
  `ready_for_production`.
- Completed/cancelled states: close or archive the Mythic job after checking for
  active production work.

Do not hard-code status names long term. Status names and IDs are account
configuration, so the app should sync `/api/v1/orderstatuses` and store mapping
rules in Mythic.

### Sync Model

1. Poll Printavo orders by recent `updated_at` where possible. The public docs
   do not document an `updated_after` filter, so the initial implementation may
   need to page through recent orders sorted by `updated_at` or `id`.
2. Upsert a local `printavo_orders` mirror table with stable identifiers,
   current status, customer summary, dates, totals, line item summary, and URLs.
3. Store the full raw Printavo payload in `api_raw_payloads` for audit/debugging.
4. Compare previous and current status/important fields to create local
   `production_job_events`.
5. When a mapped Printavo status crosses a production threshold, create or update
   a Mythic `production_job`.
6. Let production leads manage downstream Mythic-only states without writing
   every production move back to Printavo.
7. Optionally write back to Printavo only at major customer-facing milestones,
   using `update_orderstatus` when the mapped transition is intentional.

### Webhook And Zapier Findings

The vendored Printavo API blueprint does not document webhook registration,
event subscriptions, callback URLs, or an outbound event delivery API.

Zapier's current Printavo integration does expose triggers that could help us
avoid a fully blind poll. The important one is `Updated Quote/Invoice`, described
by Zapier as triggering when an order is updated. Zapier marks this as a polling
trigger, not an instant trigger, so it likely checks Printavo periodically rather
than receiving a native Printavo webhook. Zapier also lists triggers for new
customers, inquiries, quote/invoice records, payments, expenses, invoice
statuses, tasks, categories, payment terms, and users.

Implication: if Mythic needs near-real-time updates quickly, the fastest path may
be to point the existing Zapier trigger at a Mythic webhook endpoint and use that
as a "wake up and resync this Printavo order" signal. Longer term, Mythic should
still keep its own reconciliation poll because Zapier polling can miss context,
duplicate events, arrive late, or be disabled outside our app.

### Data Model Sketch

- `printavo_order_statuses`: external status ID, name, color, active flag,
  fetched timestamp.
- `printavo_orders`: Printavo order ID, invoice/visual number, current
  `orderstatus_id`, status name, customer, owner/user, key dates, totals, URLs,
  last fetched/updated timestamps.
- `printavo_status_mappings`: Printavo status ID to Mythic lifecycle trigger,
  plus whether the transition should auto-create a production job.
- `production_jobs`: internal job keyed to Printavo order ID, production status,
  priority, scheduled day, press, quantity, print type, received state, and
  production lead assignment.
- `production_job_events`: local event timeline for status changes, sync events,
  QR scans, receiving actions, worker time, and manual overrides.

### Practical Next Step

Build a read-only Printavo lifecycle sync first:

- Sync `/api/v1/orderstatuses`.
- Pull a small page of recent `/api/v1/orders`.
- Show a local table of Printavo order, current status, customer, due date,
  line-item quantity, and whether it would create a production job under the
  current mapping.
- Let an admin configure the first mapping for `Schedule & Order Garments`.

Once that works, add the write side carefully: creating Mythic production jobs
from mapped Printavo states, then optionally updating Printavo at only a few
major milestones.

## Task Flow And UX Model

The app should avoid turning every micro-step into a visible column. The useful
mental model is a small number of job phases, with role-specific task queues and
step checklists underneath each job.

### Proposed Job Phases

1. `pre_production_context`: mirrored from Printavo. Quote, approval, payment,
   customer messages, and invoice/workorder links are visible but not managed in
   Mythic.
2. `needs_sourcing`: the Printavo order has crossed a mapped status such as
   `Schedule & Order Garments`; Mythic needs garment requirements and supplier
   decisions.
3. `sourcing`: staff is checking S&S or other vendors, building a cart, handling
   substitutions, or resolving inventory gaps.
4. `awaiting_goods`: supplier order has been placed, but goods have not fully
   arrived.
5. `receiving`: boxes are arriving, being scanned, counted, reconciled, and
   checked for shortages/damage.
6. `ready_for_production`: goods and required production prerequisites are
   ready; the job can be scheduled.
7. `scheduled`: a production lead has assigned day, press/team, priority, and
   estimated hours.
8. `in_production`: worker/team is actively running one or more production
   steps.
9. `finishing_qc`: job is printed but still needs curing, folding, packing,
   quality check, or rework decision.
10. `complete`: production work is done and the job can be closed, delivered, or
   handed back to Printavo/customer-facing status.
11. `blocked`: cross-cutting state for any phase where the next action cannot
   happen without a decision, missing goods, art issue, customer issue, machine
   issue, or leadership override.

### Task Types

- Sourcing task: confirm garment requirements, compare supplier availability,
  build cart, place order, record supplier order number.
- Receiving task: scan/identify box, count garments, mark partial receipt,
  record shortage/overage/damage, release job when complete.
- Art/screen task: confirm art ready, burn screens, attach screen count,
  flag reprint or art issue.
- Scheduling task: assign day, press, worker/team, priority, estimated hours,
  rush flag, and dependencies.
- Production task: start work, pause, complete step, record quantity produced,
  record spoilage/reprint needs.
- QC/finishing task: inspect, fold/pack, mark complete, flag issue.
- Exception task: blocked reason, owner, decision needed, due time, resolution.

### Role-Based Views

- Owner: all views, reporting, bottlenecks, throughput, profitability/labor
  variance, integration health, and permission settings.
- Admin: all operational views, user management, status mapping, corrections,
  sync failures, and audit history.
- Production lead: command center, schedule board, blocked jobs, assignment,
  priority changes, estimate overrides, manual time adjustments, and completion
  approvals.
- Production worker: personal/current queue, scan-to-open job, start/stop work,
  limited status updates, production notes, and issue reporting.
- Receiving worker or staff: receiving queue, scan boxes, count goods, record
  partials/shortages/damage, and release complete jobs to production.
- Sourcing staff: needs-sourcing queue, S&S/vendor comparison, cart/order entry,
  supplier order status, and inventory exceptions.
- Customer: no production internals by default; eventual customer portal should
  show simple, customer-safe milestones only.

### What Each Role Should See First

- Owner/admin: "What is stuck, what is late, what changed, and where is the
  load?"
- Production lead: "What should run today, what is ready, who is assigned, and
  what is blocked?"
- Production worker: "What is my next job, what do I need to do, and how do I
  mark it done?"
- Receiving staff: "What arrived, what order does it belong to, what is still
  missing?"
- Sourcing staff: "What needs garments, what can be ordered, and what is at
  inventory risk?"

### UI Options For Many-Step Workflows

#### Option A: Phase Board

A Kanban-style board with only the major phases as columns. Cards show job name,
Printavo number, due date, quantity, print type, priority, blocker badge,
received state, estimated/tracked time, and next task.

Best for production leads because it makes workload and bottlenecks obvious.
Risk: too many columns will recreate Monday clutter, so keep columns limited to
major phases and put details inside the job drawer.

#### Option B: Role Queues

Each role gets a focused queue: Sourcing, Receiving, Ready to Schedule, Today on
Press, Blocked, QC/Finishing. The same job can create different tasks for
different queues.

Best for workers and staff because it answers "what do I do next?" better than a
giant board. This should probably be the default worker experience.

#### Option C: Job Detail With Checklist

Each job opens to a detail page or side drawer with a compact phase header,
Printavo context, required tasks, line items, files/links, event history, and
actions. The checklist adapts by print type and current phase.

Best for reducing board complexity. The board stays simple; the job detail holds
the many-step truth.

#### Option D: Timeline/Event Log

A chronological event stream per job: Printavo status changes, Zapier/webhook
signals, sync runs, receiving scans, manual edits, start/stop time, blockers,
and completion.

Best for auditability and debugging. It should be available on the job detail,
but not be the main operating surface.

#### Option E: Production Command Center

A dense lead/admin dashboard for the day: ready jobs, scheduled jobs, active
work, blocked jobs, press load, estimated hours, tracked hours, and rush flags.

Best for production leads at morning planning and mid-day triage.

#### Option F: Scan-First Mobile View

A mobile/tablet flow optimized around QR codes: scan box/job, identify order,
show next action, count/confirm/start/complete/report issue.

Best for receiving and shop-floor updates. It should avoid full navigation and
show one decision at a time.

### Recommended UX Direction

Use a hybrid:

1. Production lead gets a phase board plus command center.
2. Workers get role queues and scan-first job actions.
3. Every job gets a detail drawer/page with adaptive checklist and event log.
4. Admin gets mapping/sync tools and audit views.

This avoids choosing between "board" and "checklist." The board shows where work
is, queues show who should act, and checklists preserve the many-step process
without making every step a column.

### Design Rules For The First Version

- Keep top-level production phases under 8 visible columns or use grouped tabs.
- Treat `blocked` as a badge/filter, not only a column, because jobs can be
  blocked in any phase.
- Every card should show one primary next action.
- Do not require workers to understand Printavo internals.
- Keep Printavo links visible for context, but make Mythic's next action clear.
- Store detailed events even when the UI shows only the latest state.
- Make status mappings configurable before automating production job creation.
- Prefer explicit exception reasons over freeform notes for operational
  reporting.

## Non-Linear Task Flow Options

Some production work happens in parallel. Artwork can be created and approved
while apparel is being sourced. Apparel can be ordered while screens are waiting.
Receiving can be partial. A single phase field cannot express that cleanly.

### Option 1: Parallel Tracks Inside Each Job

Model each job as several independent tracks:

- Customer/commercial track: quote, invoice, payment, customer approval.
- Artwork track: art needed, art created, art sent, art approved.
- Apparel track: requirements confirmed, cart built, order placed, shipped,
  partially received, fully received.
- Production prep track: screens, press setup, schedule, notes/files.
- Production track: queued, active, paused, complete, QC/finish.

The job's headline status is computed from the tracks. For example, a job might
show `Awaiting Goods` as the headline, while the art track is already approved.

Best when the team needs truth without forcing fake linearity.
Risk: more data modeling and UI complexity.

### Option 2: Dependency-Based Tasks

Represent work as tasks with dependencies rather than phases. Example:

- `Create artwork` has no dependency.
- `Send artwork for approval` depends on `Create artwork`.
- `Approve artwork` depends on `Send artwork for approval`.
- `Build apparel cart` can happen in parallel with artwork.
- `Order apparel` depends on `Build apparel cart`.
- `Ready for press` depends on `Approve artwork`, `Goods received`, and
  `Screens ready`.

The UI shows available tasks, blocked tasks, and dependency reasons.

Best when the process varies by job type.
Risk: can feel too project-management-heavy if every small step becomes a task.

### Option 3: Milestone Gates With Parallel Checklists

Use a few gates that matter operationally, and allow parallel checklist items
inside each gate:

- Gate 1: ready to source.
- Gate 2: ready to schedule.
- Gate 3: ready to run.
- Gate 4: ready to close.

For `ready to run`, required checks might include artwork approved, garments
received, screens ready, print specs confirmed, and press assigned.

Best first version because it is simple and allows parallel work.
Risk: less precise than a full dependency graph.

### Option 4: Workstream Lanes

Instead of one board with job phases, show lanes by workstream:

- Art.
- Sourcing.
- Receiving.
- Scheduling.
- Production.
- QC/Finish.

The same job can appear in more than one lane at once if it has open work in
multiple areas. Each card shows the task for that lane, not the whole job.

Best for team coordination.
Risk: duplicate-looking cards can confuse people unless the UI clearly says
"task card" versus "job card."

### Option 5: Hybrid Recommended Model

Use milestone gates plus parallel tracks:

- The job has one headline operational state.
- The job detail has parallel tracks for art, apparel, receiving, and
  production prep.
- Role queues are generated from open tasks inside those tracks.
- The command center shows gate readiness: "ready to schedule," "blocked,"
  "ready to run," and "running today."

This is probably the strongest product direction for Mythic. It keeps the daily
view simple while preserving the messy truth underneath.

## Simple Wiremocks

These are intentionally low-fidelity. They show information shape, not visual
design.

### Phase Board

Good for production leads asking, "Where is work piling up?"

```txt
┌─────────────────────────────────────────────────────────────────────────────┐
│ Production Board                         Today: 18 jobs   Blocked: 4       │
├──────────────┬──────────────┬──────────────┬──────────────┬───────────────┤
│ Needs Source │ Await Goods  │ Ready        │ In Production│ Finishing/QC  │
├──────────────┼──────────────┼──────────────┼──────────────┼───────────────┤
│ #18622       │ #18610       │ #18598       │ #18577       │ #18561        │
│ 420 tees     │ 144 hoodies  │ 75 hats      │ 250 totes    │ 60 shirts     │
│ Art: sent    │ Art: ok      │ Art: ok      │ Press: ROQ-B │ QC needed     │
│ Cart needed  │ Partial recv │ Screens: 2/2 │ 1h 12m run   │               │
│ Next: Build  │ Next: Count  │ Next: Sched  │ Next: Finish │ Next: Close   │
├──────────────┼──────────────┼──────────────┼──────────────┼───────────────┤
│ #18618       │ #18605       │ #18591       │              │               │
│ BLOCKED      │ ETA Thu      │ Rush         │              │               │
└──────────────┴──────────────┴──────────────┴──────────────┴───────────────┘
```

### Role Queue

Good for workers asking, "What should I do next?"

```txt
┌────────────────────────────────────────────────────────────┐
│ My Queue: Receiving                         Scan QR [____] │
├────────┬──────────────┬──────────────┬────────────┬───────┤
│ Due    │ Job          │ Task         │ Status     │ Action│
├────────┼──────────────┼──────────────┼────────────┼───────┤
│ Today  │ #18622 Tees  │ Count boxes  │ Partial    │ Open  │
│ Today  │ #18610 Hats  │ Receive PO   │ Expected   │ Open  │
│ Thu    │ #18605 Hood  │ Check damage │ Blocked    │ Open  │
└────────┴──────────────┴──────────────┴────────────┴───────┘
```

### Job Detail With Parallel Tracks

Good for seeing the complete truth of one order.

```txt
┌────────────────────────────────────────────────────────────────────────────┐
│ Job #18622  Lon Holloman Tees        Printavo: Schedule & Order Garments  │
│ Due Thu       Qty 420       Priority Normal       Open in Printavo ↗       │
├────────────────────────────────────────────────────────────────────────────┤
│ Readiness:  Art approved ✓   Goods partial !   Screens not started ○      │
├──────────────────────┬──────────────────────┬────────────────────────────┤
│ Artwork              │ Apparel              │ Production Prep            │
├──────────────────────┼──────────────────────┼────────────────────────────┤
│ ✓ Create artwork     │ ✓ Build S&S cart     │ ○ Burn screens             │
│ ✓ Send approval      │ ✓ Order apparel      │ ○ Assign press             │
│ ✓ Customer approved  │ ! 360/420 received   │ ○ Estimate hours           │
│                      │ ○ Resolve shortage   │                            │
├──────────────────────┴──────────────────────┴────────────────────────────┤
│ Next Best Action: Resolve apparel shortage before scheduling.              │
│ [Mark Received] [Report Shortage] [Add Note] [Block Job]                   │
├────────────────────────────────────────────────────────────────────────────┤
│ Timeline                                                                    │
│ Jul 8 4:12p Printavo status changed: Schedule & Order Garments              │
│ Jul 8 4:15p Artwork approval opened                                         │
│ Jul 9 9:02a S&S shipment partially received                                 │
└────────────────────────────────────────────────────────────────────────────┘
```

### Command Center

Good for production leads planning the day.

```txt
┌────────────────────────────────────────────────────────────────────────────┐
│ Production Command Center                               Wed Jul 8          │
├────────────────┬────────────────┬────────────────┬───────────────────────┤
│ Ready to Run   │ Blocked        │ Active Now     │ Capacity              │
├────────────────┼────────────────┼────────────────┼───────────────────────┤
│ 8 jobs         │ 4 jobs         │ 3 jobs         │ ROQ-A 5.2 / 7 hrs     │
│ 1,240 units    │ 2 art issues   │ 2.1 hrs tracked│ ROQ-B 6.8 / 7 hrs     │
│ 18.5 est hrs   │ 1 shortage     │ 900 units left │ Manual 2.0 / 4 hrs    │
├────────────────┴────────────────┴────────────────┴───────────────────────┤
│ Attention                                                                  │
│ ! #18605 blocked: missing 24 XL black tees                                  │
│ ! #18618 art not approved, due tomorrow                                     │
│ ! ROQ-B over planned capacity by 1.3 hrs                                    │
└────────────────────────────────────────────────────────────────────────────┘
```

### Workstream Lanes

Good for non-linear work where one job has multiple open tasks at once.

```txt
┌────────────────────────────────────────────────────────────────────────────┐
│ Workstream View                                                            │
├──────────────┬──────────────┬──────────────┬──────────────┬───────────────┤
│ Art          │ Sourcing     │ Receiving    │ Scheduling   │ Production    │
├──────────────┼──────────────┼──────────────┼──────────────┼───────────────┤
│ #18618       │ #18622       │ #18610       │ #18598       │ #18577        │
│ Send proof   │ Build cart   │ Count goods  │ Assign press │ Run job       │
├──────────────┼──────────────┼──────────────┼──────────────┼───────────────┤
│ #18622       │ #18605       │ #18622       │              │               │
│ Approved ✓   │ Vendor alt   │ Short 60 pcs │              │               │
└──────────────┴──────────────┴──────────────┴──────────────┴───────────────┘
```

In this view, cards are tasks, not whole jobs. That lets `#18622` appear in Art,
Sourcing, and Receiving at the same time without pretending the whole job is in
only one place.
