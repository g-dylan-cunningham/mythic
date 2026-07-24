export const hoverTextCopy = {
  actions: {
    advancePhase:
      "Move this job to the suggested next production phase. The app checks the configured transition rules and writes a timeline event.",
    blockTask:
      "Mark this task as blocked and save the reason to the event timeline. Use this when work cannot continue without help or a missing dependency.",
    completeTask:
      "Mark this task complete. If the task has unmet completion dependencies, the workflow engine will stop the update.",
    manualPrintavoSync:
      "Run a small, safe Printavo sync now. The sync stores raw payloads, records a sync run, and creates production jobs only when paid orders qualify.",
    markSuggestedComplete:
      "Complete this suggested milestone from the next-action panel. The same dependency checks and event logging still apply.",
    reopenTask:
      "Reopen this completed task and clear its completion timestamp. Use this when the task was marked complete too early or needs more work.",
    reopenAndBlockTask:
      "Move this completed task into blocked status and save the blocker reason. This clears the completion timestamp and writes an event.",
    ssInventoryCheck:
      "Run a read-only S&S inventory lookup using the filters in this form. This helps validate sourcing options without changing supplier data.",
    signIn:
      "Sign in to Mythic Operations. Your role controls which production, reporting, and admin areas are visible after login.",
    signOut:
      "End this Mythic Operations session and return to the login screen.",
    unblockTask:
      "Clear the blocker on this task and move it back to open so it can be worked again.",
  },
  dashboard: {
    production:
      "Open the production workflow area: jobs, command center, role queues, task checklists, suggestions, and event history.",
    reports:
      "Open vendor and operational reports, including Printavo sync diagnostics and reconciliation tools.",
  },
  jobDetail: {
    eventTimeline:
      "Chronological audit trail for this job. Task changes, phase moves, sync events, blockers, and system actions are written here.",
    printavoSync:
      "Open the manual Printavo sync/debug page. Useful when checking whether a paid Printavo order created or updated a Mythic job.",
    suggestions:
      "Next actions are generated from the workflow dependency graph and current task states. They are prompts, not automatic changes.",
    taskTrack:
      "A parallel workflow track for this job. Tasks inside a track follow the configured workflow order, but tracks may advance independently.",
  },
  links: {
    commandCenter:
      "Production lead overview for active jobs, due-soon work, blockers, estimates, queue counts, and watch-list items.",
    dashboard:
      "Return to the main Mythic Operations dashboard.",
    jobDetail:
      "Open the full job detail page with task tracks, next actions, and event history.",
    ownerOverview:
      "Owner-only read-only board for scanning every production job by customer, order, current phase, progress, and blockers.",
    production:
      "Open the production job list.",
    queue:
      "Open this queue to see the active tasks that match its role, workflow track, or blocked status.",
    receivingQueue:
      "Open apparel receiving work: supplier-side apparel tasks, shipment checkpoints, and receipt-related blockers.",
    reporting:
      "Return to the reporting hub.",
    blockedQueue:
      "Open all blocked tasks across production, sourcing, receiving, and fulfillment.",
  },
  production: {
    blockedBadge:
      "This job has one or more blocked tasks. Open the job to see blocker reasons and unblock when resolved.",
    commandCenterCard:
      "Start here for daily production lead review: queue health, due dates, blocked work, and estimate pressure.",
    customerFulfillmentQueue:
      "Customer fulfillment covers the post-production handoff: ready inventory, shipped or picked up, and received by customer.",
    estimate:
      "Estimated production effort for active jobs. These values are rough planning inputs until time tracking is added.",
    ownerJobCard:
      "Open this job to inspect its full task checklist, blocker reasons, suggested next actions, and event timeline.",
    receivingCard:
      "Apparel-side queue for confirming requirements, building/approving carts, ordering, shipment, and receipt.",
    taskProgress:
      "Completed task count compared with total generated tasks for this production job.",
    watchList:
      "Jobs appear here when they are due soon or have a high difficulty score. This is a lead attention list, not a separate status.",
  },
  queues: {
    blocked:
      "Blocked work ignores role and track filters so the team can quickly see everything that needs intervention.",
    productionLead:
      "Lead-owned work usually includes approvals, estimates, scheduling decisions, and phase gates.",
    productionWorker:
      "Shop-floor queue for tasks assigned to production workers, such as screen prep, production, and finishing/QC.",
    receiving:
      "Receiving queue is filtered to apparel-track tasks so incoming goods and supplier issues are easy to isolate.",
    staff:
      "Staff and sourcing queue for front-office tasks that unblock production, including garment requirements and supplier ordering.",
  },
  reporting: {
    reportCard:
      "Open this report or diagnostic surface. Reports are still lightweight POC tools while the workflow model settles.",
    syncStats:
      "These numbers summarize the most recent manual sync response. Re-running sync should not duplicate production jobs.",
  },
} as const;
