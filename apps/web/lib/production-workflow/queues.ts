export type ProductionQueueKey =
  | "production-lead"
  | "staff"
  | "production-worker"
  | "receiving"
  | "customer-fulfillment"
  | "blocked";

export type ProductionQueueDefinition = {
  description: string;
  href: string;
  key: ProductionQueueKey;
  label: string;
  match: {
    assignedRoles?: string[];
    statuses?: string[];
    tracks?: string[];
  };
};

const activeTaskStatuses = ["open", "in_progress", "blocked"];

export const productionQueues: ProductionQueueDefinition[] = [
  {
    description: "Lead-owned planning, approvals, estimates, and phase gates.",
    href: "/production/queues/production-lead",
    key: "production-lead",
    label: "Production Lead",
    match: {
      assignedRoles: ["production_lead"],
      statuses: activeTaskStatuses,
    },
  },
  {
    description: "Front-office and sourcing tasks that unblock production.",
    href: "/production/queues/staff",
    key: "staff",
    label: "Staff / Sourcing",
    match: {
      assignedRoles: ["staff"],
      statuses: activeTaskStatuses,
    },
  },
  {
    description: "Shop-floor work assigned to production workers.",
    href: "/production/queues/production-worker",
    key: "production-worker",
    label: "Production Worker",
    match: {
      assignedRoles: ["production_worker"],
      statuses: activeTaskStatuses,
    },
  },
  {
    description: "Apparel receipt and supplier-side fulfillment checkpoints.",
    href: "/production/queues/receiving",
    key: "receiving",
    label: "Receiving",
    match: {
      statuses: activeTaskStatuses,
      tracks: ["apparel"],
    },
  },
  {
    description: "Post-production customer fulfillment checkpoints.",
    href: "/production/queues/customer-fulfillment",
    key: "customer-fulfillment",
    label: "Customer Fulfillment",
    match: {
      statuses: activeTaskStatuses,
      tracks: ["customer_fulfillment"],
    },
  },
  {
    description: "Any blocked task, regardless of role or workflow track.",
    href: "/production/queues/blocked",
    key: "blocked",
    label: "Blocked Work",
    match: {
      statuses: ["blocked"],
    },
  },
];

export function getProductionQueueDefinition(queueKey: string) {
  return productionQueues.find((queue) => queue.key === queueKey) ?? null;
}

export function taskMatchesQueue(
  task: {
    assigned_role: string | null;
    status: string;
    track_snapshot: string;
  },
  queue: ProductionQueueDefinition,
) {
  const { assignedRoles, statuses, tracks } = queue.match;

  if (statuses && !statuses.includes(task.status)) {
    return false;
  }

  if (assignedRoles && !assignedRoles.includes(task.assigned_role ?? "")) {
    return false;
  }

  if (tracks && !tracks.includes(task.track_snapshot)) {
    return false;
  }

  return true;
}
