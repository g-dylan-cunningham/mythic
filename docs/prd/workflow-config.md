# PRD: Workflow Config And Versioning

Last updated: 2026-09-12

## Summary

The production workflow should be configurable and versioned. Business process
steps will change over time, and future product categories such as embroidery
will need similar but different workflows.

## Goals

- Support a screen-printing workflow for the POC.
- Allow future workflow versions without breaking in-flight jobs.
- Allow future product categories like embroidery.
- Keep logs readable even after workflow labels change.
- Enforce generic workflow rules in code while storing business steps in config.

## Non-Goals For POC

- Drag-and-drop workflow editor.
- End-user configurable dependency graph.
- Multi-category workflow UI.
- Automatic migration of active jobs to new workflow versions.

## Versioning Rules

- Active workflow definitions are not edited in place.
- Changes are made by creating a new draft workflow version.
- New jobs use the active workflow version at creation time.
- Existing jobs keep their original workflow version unless explicitly migrated.
- Hard migrations must write a `production_job_event`.

Example:

```txt
screen_printing_v1 active
screen_printing_v2 draft
screen_printing_v2 active for new jobs
screen_printing_v1 retired for new jobs
existing v1 jobs remain v1
```

## Generic Code Rules

Code should enforce rules like:

- A task can start when `required_before_start` dependencies are complete.
- A task can complete when required completion dependencies are satisfied.
- Non-admin users can only move forward through allowed actions.
- Every meaningful state change writes an event.
- Headline phases are derived from completed or skipped task milestones.

Code should not hard-code business rules like:

```txt
Artwork approved always means burn screens is next.
```

That should come from workflow config.

## First Workflow: `screen_printing_v1`

Tracks:

- Artwork
- Apparel sourcing/receiving
- Production prep
- Production
- Customer fulfillment

Important task examples:

- Confirm artwork needed
- Create/revise artwork
- Send artwork approval
- Artwork approved
- Ready to burn screens
- Confirm garment requirements
- Build supplier cart
- Order apparel
- Apparel shipped
- Apparel received
- Burn screens
- Confirm print locations
- Confirm ink/color count
- Confirm garment material/handling
- Confirm finishing requirements
- Estimate difficulty/time
- Assign press/day
- Ready for production
- In production
- Finishing/QC
- Production complete
- Fulfillment readyInventory
- Fulfillment shipped/picked up
- Fulfillment received by customer

## Headline Phase Rules

Headline phases are presentation labels derived from task state. Users change
tasks, not the phase itself. This avoids a parallel state that can drift out of
sync with operational work.

Examples:

- Before apparel ordering is complete: Needs sourcing.
- After apparel ordering: Awaiting goods.
- After apparel receiving: Goods received.
- After receiving, artwork, screen, specification, and estimate milestones:
  Ready for production.
- Scheduling and production milestones then yield Scheduled, In production,
  Finishing / QC, and Production complete.

## Future Category: Embroidery

Embroidery should use the same tables with a different workflow definition.

Potential embroidery tracks:

- Artwork
- Digitizing
- Apparel
- Thread/material prep
- Machine scheduling
- Production
- Finishing/QC
- Customer fulfillment

Potential embroidery-specific steps:

- Confirm embroidery location
- Confirm stitch count
- Digitize artwork
- Sew-out approval
- Select thread colors
- Hoop garments
- Assign embroidery machine
- Run embroidery
- Trim backing/threads
- QC embroidery

## Open Questions

- Which workflow changes require a new version versus a non-blocking optional
  task?
- Who can activate a new workflow version?
- Do active jobs ever migrate automatically, or only by admin action?
- Should customer fulfillment be shared across all product categories?
