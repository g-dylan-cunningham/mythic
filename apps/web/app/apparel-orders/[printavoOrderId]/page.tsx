import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { canAccessFeature } from "@/lib/features/feature-flags";
import { formatCurrency } from "@/lib/formatters";
import { getLatestPrintavoOrder } from "@/lib/printavo/recent-orders";
import { createClient } from "@/utils/supabase/server";

function formatDate(value: string | null) {
  if (!value) {
    return "No due date";
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00`));
}

function formatGoodsStatus(value: string | null) {
  if (!value) {
    return "Not provided";
  }

  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export default async function ApparelOrderSessionPage({
  params,
}: {
  params: Promise<{ printavoOrderId: string }>;
}) {
  const { profile } = await getCurrentProfile();

  if (!canAccessFeature(profile, "apparelOrdering")) {
    redirect("/dashboard");
  }

  const { printavoOrderId } = await params;
  const orderId = Number(printavoOrderId);

  if (!Number.isSafeInteger(orderId) || orderId <= 0) {
    notFound();
  }

  const order = await getLatestPrintavoOrder(await createClient(), orderId);

  if (!order) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-8">
        <header className="border-b border-neutral-800 pb-6">
          <Link
            className="text-sm text-neutral-400 hover:text-neutral-200"
            href="/dashboard"
          >
            Dashboard
          </Link>
          <p className="mt-6 text-sm font-medium uppercase tracking-[0.2em] text-emerald-400">
            Apparel ordering
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            {order.nickname ?? `Printavo order #${order.orderNumber}`}
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            Printavo #{order.orderNumber} ·{" "}
            {order.customerName ?? "No customer"}
          </p>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-sm text-neutral-500">Printavo status</p>
            <p className="mt-2 font-medium text-neutral-100">
              {order.statusName ?? "No status"}
            </p>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-sm text-neutral-500">Due</p>
            <p className="mt-2 font-medium text-neutral-100">
              {formatDate(order.dueDate)}
            </p>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-sm text-neutral-500">Payment</p>
            <p className="mt-2 font-medium text-neutral-100">
              {order.paid ? "Paid" : order.approved ? "Approved" : "Open"}
            </p>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-sm text-neutral-500">Order total</p>
            <p className="mt-2 font-medium text-neutral-100">
              {order.total === null
                ? "Not available"
                : formatCurrency(order.total)}
            </p>
          </div>
        </section>

        <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
                Printavo order details
              </p>
              <h2 className="mt-2 text-2xl font-semibold">Apparel lines</h2>
            </div>
            <p className="text-sm text-neutral-400">
              {order.lineItems.length} line
              {order.lineItems.length === 1 ? "" : "s"}
            </p>
          </div>

          {order.lineItems.length > 0 ? (
            <div className="mt-5 overflow-x-auto rounded-lg border border-neutral-800">
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-neutral-800 text-left text-neutral-200">
                  <tr>
                    <th className="px-3 py-3 font-semibold">Item</th>
                    <th className="px-3 py-3 font-semibold">Style #</th>
                    <th className="px-3 py-3 font-semibold">Color</th>
                    <th className="px-3 py-3 font-semibold">Sizes</th>
                    <th className="px-3 py-3 text-right font-semibold">Qty</th>
                    <th className="px-3 py-3 font-semibold">Goods status</th>
                    <th className="px-3 py-3 text-right font-semibold">
                      Unit cost
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800 bg-neutral-950">
                  {order.lineItems.map((lineItem, index) => (
                    <tr key={lineItem.lineItemId ?? `line-${index}`}>
                      <td className="px-3 py-3">
                        <p className="font-medium text-neutral-100">
                          {lineItem.description ?? "Unnamed item"}
                        </p>
                        {lineItem.category ? (
                          <p className="mt-1 text-xs text-neutral-500">
                            {lineItem.category}
                          </p>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 font-mono text-neutral-300">
                        {lineItem.styleNumber ?? "—"}
                      </td>
                      <td className="px-3 py-3 text-neutral-300">
                        {lineItem.color ?? "—"}
                      </td>
                      <td className="min-w-48 px-3 py-3 text-neutral-300">
                        {lineItem.sizes.length > 0
                          ? lineItem.sizes
                              .map(
                                (size) => `${size.label} × ${size.quantity}`,
                              )
                              .join(", ")
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-neutral-300">
                        {lineItem.quantity ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-neutral-300">
                        {formatGoodsStatus(lineItem.goodsStatus)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-neutral-300">
                        {lineItem.unitCost === null
                          ? "—"
                          : formatCurrency(lineItem.unitCost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-5 rounded-md border border-dashed border-neutral-700 bg-neutral-950 px-4 py-8 text-center text-sm text-neutral-400">
              This Printavo snapshot does not contain any apparel line items.
            </p>
          )}
        </section>

        <section className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-5">
          <h2 className="text-lg font-semibold text-emerald-100">
            Apparel session started
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-100/80">
            The Printavo order and apparel lines are loaded. S&amp;S matching and
            cart confirmation will be added to this session next. No supplier
            order has been created.
          </p>
          <Link
            className="mt-5 inline-flex h-10 items-center rounded-md border border-emerald-400/50 px-4 text-sm font-medium text-emerald-100 transition hover:bg-emerald-400/10"
            href="/reporting/ss-inventory"
          >
            Open S&amp;S inventory
          </Link>
        </section>
      </div>
    </main>
  );
}
