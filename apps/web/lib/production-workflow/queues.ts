export type ProductionQueueKey = "blocked";

export type ProductionQueueDefinition = {
  description: string;
  href: string;
  key: ProductionQueueKey;
  label: string;
  match: {
    statuses?: string[];
  };
};

export const productionQueues: ProductionQueueDefinition[] = [
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
    status: string;
  },
  queue: ProductionQueueDefinition,
) {
  const { statuses } = queue.match;

  if (statuses && !statuses.includes(task.status)) {
    return false;
  }

  return true;
}
