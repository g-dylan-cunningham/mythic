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
- Does Printavo expose supplier order or shipment details through its API, or is
  that mostly manual today?
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
