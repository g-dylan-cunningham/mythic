import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { HoverText } from "@/app/components/hover-text";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { canUseOperations } from "@/lib/auth/roles";
import {
  getProductionQueueDefinition,
  taskMatchesQueue,
} from "@/lib/production-workflow/queues";
import { hoverTextCopy } from "@/lib/ui-copy/hovertext-copy";
import { createClient } from "@/utils/supabase/server";

type Params = Promise<{ queueKey: string }>;

type QueueTask = {
  id: string;
  assigned_role: string | null;
  blocked_reason: string | null;
  label_snapshot: string;
  status: string;
  track_snapshot: string;
  workflow_step_key: string;
  production_jobs: {
    id: string;
    customer_name: string | null;
    due_date: string | null;
    job_name: string;
    priority: string;
    current_phase_label_snapshot: string;
    printavo_order_number: string | null;
  } | null;
};

const statusClasses: Record<string, string> = {
  blocked: "border-red-400/30 bg-red-400/10 text-red-100",
  complete: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100",
  in_progress: "border-blue-400/30 bg-blue-400/10 text-blue-100",
  open: "border-neutral-700 bg-neutral-900 text-neutral-300",
};

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "No date";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function statusBadge(status: string) {
  return (
    <span
      className={`rounded-md border px-2 py-1 text-xs font-medium ${
        statusClasses[status] ?? statusClasses.open
      }`}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

function queueHoverText(queueKey: string) {
  switch (queueKey) {
    case "blocked":
      return hoverTextCopy.queues.blocked;
    case "customer-fulfillment":
      return hoverTextCopy.production.customerFulfillmentQueue;
    case "production-lead":
      return hoverTextCopy.queues.productionLead;
    case "production-worker":
      return hoverTextCopy.queues.productionWorker;
    case "receiving":
      return hoverTextCopy.queues.receiving;
    case "staff":
      return hoverTextCopy.queues.staff;
    default:
      return hoverTextCopy.links.queue;
  }
}

export default async function ProductionQueuePage({
  params,
}: {
  params: Params;
}) {
  const { queueKey } = await params;
  const queue = getProductionQueueDefinition(queueKey);

  if (!queue) {
    notFound();
  }

  const { profile } = await getCurrentProfile();

  if (!profile || !profile.is_active || !canUseOperations(profile.role)) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const { data: tasks, error } = await supabase
    .from("production_tasks")
    .select(
      "id,assigned_role,blocked_reason,label_snapshot,status,track_snapshot,workflow_step_key,production_jobs(id,customer_name,due_date,job_name,priority,current_phase_label_snapshot,printavo_order_number)",
    )
    .order("status", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(200)
    .returns<QueueTask[]>();

  if (error) {
    throw new Error(error.message);
  }

  const queueTasks = (tasks ?? []).filter((task) =>
    taskMatchesQueue(task, queue),
  );

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-8">
        <header className="flex flex-col justify-between gap-4 border-b border-neutral-800 pb-6 sm:flex-row sm:items-end">
          <div>
            <div className="flex gap-4 text-sm text-neutral-400">
              <HoverText text={hoverTextCopy.links.production}>
                <Link href="/production" className="hover:text-neutral-200">
                  Production
                </Link>
              </HoverText>
              <HoverText text={hoverTextCopy.links.commandCenter}>
                <Link
                  href="/production/command-center"
                  className="hover:text-neutral-200"
                >
                  Command Center
                </Link>
              </HoverText>
            </div>
            <p className="mt-6 text-sm font-medium uppercase tracking-[0.2em] text-emerald-400">
              Queue
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">
              {queue.label}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
              {queue.description}
            </p>
          </div>
          <HoverText text={queueHoverText(queue.key)}>
            <div className="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3">
              <p className="text-sm text-neutral-400">Open work</p>
              <p className="mt-1 text-2xl font-semibold">
                {queueTasks.length}
              </p>
            </div>
          </HoverText>
        </header>

        <section className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-neutral-800 text-left text-neutral-200">
              <tr>
                <th className="px-4 py-3 font-semibold">Task</th>
                <th className="px-4 py-3 font-semibold">Job</th>
                <th className="px-4 py-3 font-semibold">Phase</th>
                <th className="px-4 py-3 font-semibold">Due</th>
                <th className="px-4 py-3 font-semibold">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800 bg-neutral-950">
              {queueTasks.map((task) => (
                <tr className="hover:bg-neutral-900" key={task.id}>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {statusBadge(task.status)}
                      <span className="font-medium text-neutral-100">
                        {task.label_snapshot}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-xs text-neutral-500">
                      {task.workflow_step_key}
                    </p>
                    {task.blocked_reason ? (
                      <p className="mt-2 text-sm text-red-100">
                        {task.blocked_reason}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {task.production_jobs ? (
                      <HoverText text={hoverTextCopy.links.jobDetail}>
                        <Link
                          className="font-medium text-neutral-100 hover:text-emerald-300"
                          href={`/production/${task.production_jobs.id}`}
                        >
                          {task.production_jobs.job_name}
                        </Link>
                      </HoverText>
                    ) : (
                      <span className="text-neutral-500">No job</span>
                    )}
                    <p className="mt-1 text-xs text-neutral-500">
                      {task.production_jobs?.customer_name ?? "No customer"} ·{" "}
                      {task.production_jobs?.printavo_order_number ??
                        "No Printavo #"}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-neutral-300">
                    {task.production_jobs?.current_phase_label_snapshot ?? ""}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-neutral-300">
                    {formatDate(task.production_jobs?.due_date)}
                  </td>
                  <td className="px-4 py-3 font-mono text-neutral-300">
                    {task.assigned_role ?? "unassigned"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {queueTasks.length === 0 ? (
            <div className="border-t border-neutral-800 px-4 py-10 text-center text-sm text-neutral-400">
              No tasks are currently in this queue.
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
