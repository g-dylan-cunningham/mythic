import Link from "next/link";
import { formatCurrency } from "@/lib/formatters";
import type { RecentPrintavoOrdersResult } from "@/lib/printavo/recent-orders";

function formatDate(value: string | null) {
  if (!value) {
    return "No date";
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00`));
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone: "America/Phoenix",
    timeZoneName: "short",
    year: "numeric",
  }).format(new Date(value));
}

function statusTone(status: string | null) {
  const normalized = status?.toLowerCase() ?? "";

  if (normalized.includes("cancel") || normalized.includes("declin")) {
    return "border-red-400/30 bg-red-400/10 text-red-100";
  }

  if (
    normalized.includes("approved") ||
    normalized.includes("paid") ||
    normalized.includes("production")
  ) {
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-100";
  }

  return "border-neutral-700 bg-neutral-900 text-neutral-300";
}

function queryTone(status: string) {
  return status === "succeeded" ? "text-emerald-300" : "text-amber-300";
}

export function PrintavoOrderList({
  result,
}: {
  result: RecentPrintavoOrdersResult;
}) {
  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
            Printavo
          </p>
          <h2 className="mt-2 text-2xl font-semibold">Current jobs</h2>
          <p className="mt-2 text-sm leading-6 text-neutral-400">
            Recently updated Printavo orders available for purchasing review.
          </p>
        </div>
        {result.ok && result.lastQuery ? (
          <div className="rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm">
            <p className="text-neutral-500">Last Printavo query</p>
            <p className="mt-1 text-neutral-200">
              {formatDateTime(result.lastQuery.startedAt)}
            </p>
            <p
              className={`mt-1 text-xs capitalize ${queryTone(result.lastQuery.status)}`}
            >
              {result.lastQuery.status} · {result.lastQuery.ordersSeen} orders
            </p>
          </div>
        ) : null}
      </div>

      {!result.ok ? (
        <p className="mt-5 rounded-md border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-100">
          {result.error}
        </p>
      ) : result.orders.length > 0 ? (
        <div className="mt-5 overflow-x-auto rounded-lg border border-neutral-800">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-neutral-800 text-left text-neutral-200">
              <tr>
                <th className="px-3 py-3 font-semibold">Job</th>
                <th className="px-3 py-3 font-semibold">Customer</th>
                <th className="px-3 py-3 font-semibold">Printavo status</th>
                <th className="px-3 py-3 font-semibold">Due</th>
                <th className="px-3 py-3 font-semibold">Payment</th>
                <th className="px-3 py-3 text-right font-semibold">Total</th>
                <th className="px-3 py-3 font-semibold">Updated</th>
                <th className="px-3 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800 bg-neutral-950">
              {result.orders.map((order) => (
                <tr className="hover:bg-neutral-900" key={order.orderId}>
                  <td className="px-3 py-3">
                    <p className="font-medium text-neutral-100">
                      {order.nickname ??
                        `Printavo order ${order.orderNumber}`}
                    </p>
                    <p className="mt-1 font-mono text-xs text-neutral-500">
                      #{order.orderNumber}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-neutral-300">
                    {order.customerName ?? "No customer"}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex rounded-md border px-2 py-1 text-xs ${statusTone(order.statusName)}`}
                    >
                      {order.statusName ?? "No status"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-neutral-300">
                    {formatDate(order.dueDate)}
                  </td>
                  <td className="px-3 py-3 text-neutral-300">
                    {order.paid
                      ? "Paid"
                      : order.approved
                        ? "Approved"
                        : "Open"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-neutral-300">
                    {order.total === null ? "—" : formatCurrency(order.total)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-neutral-400">
                    {formatDateTime(order.updatedAt ?? order.fetchedAt)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right">
                    <Link
                      className="inline-flex h-9 items-center rounded-md border border-emerald-500/50 bg-emerald-500/10 px-3 text-sm font-medium text-emerald-100 transition hover:border-emerald-400 hover:bg-emerald-500/20"
                      href={`/apparel-orders/${order.orderId}`}
                    >
                      Start apparel order
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-5 rounded-md border border-dashed border-neutral-700 bg-neutral-950 px-4 py-8 text-center text-sm text-neutral-400">
          No fetched Printavo orders are available yet.
        </div>
      )}
    </section>
  );
}
