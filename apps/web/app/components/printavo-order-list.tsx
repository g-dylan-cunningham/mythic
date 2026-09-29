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

function ordersPageHref(direction: "after" | "before", cursor: string) {
  const key = direction === "after" ? "ordersAfter" : "ordersBefore";
  const searchParams = new URLSearchParams({ [key]: cursor });

  return `/dashboard?${searchParams.toString()}#printavo-orders`;
}

export function PrintavoOrderList({
  result,
}: {
  result: RecentPrintavoOrdersResult;
}) {
  return (
    <section
      className="scroll-mt-20 rounded-lg border border-neutral-800 bg-neutral-900 p-5"
      id="printavo-orders"
    >
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
            Printavo
          </p>
          <h2 className="mt-2 text-2xl font-semibold">Current jobs</h2>
          <p className="mt-2 text-sm leading-6 text-neutral-400">
            All saved Printavo orders, newest activity first, available for
            purchasing review.
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
        <div className="mt-5">
          <div className="overflow-x-auto rounded-lg border border-neutral-800">
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
                      aria-label={`${
                        order.apparelReadiness.eligible
                          ? "Start apparel order"
                          : "Review apparel sourcing issues"
                      } for ${order.nickname ?? `Printavo order ${order.orderNumber}`}`}
                      className={`inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium transition ${
                        order.apparelReadiness.eligible
                          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-100 hover:border-emerald-400 hover:bg-emerald-500/20"
                          : "border-amber-400/50 bg-amber-400/10 text-amber-100 hover:border-amber-300 hover:bg-amber-400/20"
                      }`}
                      href={`/apparel-orders/${order.orderId}`}
                      title={
                        order.apparelReadiness.eligible
                          ? `${order.apparelReadiness.sourceableLineCount} apparel line${order.apparelReadiness.sourceableLineCount === 1 ? " is" : "s are"} ready for sourcing in the latest dashboard snapshot.`
                          : order.apparelReadiness.reasons.join(" ")
                      }
                    >
                      {order.apparelReadiness.eligible
                        ? "Start apparel order"
                        : "Review sourcing issues"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
          <nav
            aria-label="Printavo order pages"
            className="mt-4 flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="text-neutral-500">
              Showing {result.orders.length} saved order
              {result.orders.length === 1 ? "" : "s"} on this page
            </p>
            <div className="flex items-center gap-2">
              {result.pagination.newerCursor ? (
                <Link
                  className="inline-flex h-9 items-center rounded-md border border-neutral-700 px-3 font-medium text-neutral-200 transition hover:border-neutral-500 hover:bg-neutral-800"
                  href={ordersPageHref(
                    "before",
                    result.pagination.newerCursor,
                  )}
                >
                  Newer orders
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  className="inline-flex h-9 items-center rounded-md border border-neutral-800 px-3 text-neutral-600"
                >
                  Newer orders
                </span>
              )}
              {result.pagination.olderCursor ? (
                <Link
                  className="inline-flex h-9 items-center rounded-md border border-neutral-700 px-3 font-medium text-neutral-200 transition hover:border-neutral-500 hover:bg-neutral-800"
                  href={ordersPageHref(
                    "after",
                    result.pagination.olderCursor,
                  )}
                >
                  Older orders
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  className="inline-flex h-9 items-center rounded-md border border-neutral-800 px-3 text-neutral-600"
                >
                  Older orders
                </span>
              )}
            </div>
          </nav>
        </div>
      ) : (
        <div className="mt-5 rounded-md border border-dashed border-neutral-700 bg-neutral-950 px-4 py-8 text-center text-sm text-neutral-400">
          No fetched Printavo orders are available yet.
        </div>
      )}
    </section>
  );
}
