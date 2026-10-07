import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PendingSubmitButton } from "@/app/components/pending-submit-button";
import { confirmSsLineMapping } from "@/app/apparel-orders/[printavoOrderId]/actions";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { apparelOrderingRollout } from "@/lib/apparel-ordering/rollout";
import {
  getApparelVendorMappingState,
  type ApparelVendorMappingState,
} from "@/lib/apparel-ordering/vendor-mappings";
import {
  getSsLineSuggestions,
  type SsLineMatchResult,
  type SsLineSuggestion,
} from "@/lib/apparel-ordering/ss-matching";
import { canAccessFeature } from "@/lib/features/feature-flags";
import { formatCurrency } from "@/lib/formatters";
import {
  classifyApparelLineForSourcing,
  getApparelOrderReadiness,
  isSourceableApparelLine,
} from "@/lib/printavo/order-summary";
import { refreshPrintavoOrder } from "@/lib/printavo/recent-orders";
import { ssPrintavoPoNumber } from "@/lib/ss/order-request";
import { createClient } from "@/utils/supabase/server";

type SearchParams = {
  result?: string | string[];
  supplier?: string | string[];
};

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

function formatDateTime(value: string | null) {
  if (!value) {
    return "Refresh failed";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Phoenix",
  }).format(new Date(value));
}

function getParam(searchParams: SearchParams, key: keyof SearchParams) {
  const value = searchParams[key];

  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function isCurrentConfirmation(
  storedVariants: unknown,
  suggestion: SsLineSuggestion,
) {
  if (!Array.isArray(storedVariants)) {
    return false;
  }

  const stored = storedVariants.map((variant) => {
    if (!variant || typeof variant !== "object") {
      return null;
    }

    const value = variant as Record<string, unknown>;

    return {
      requestedQty: value.requestedQty,
      sku: value.sku,
      sourceSize: value.sourceSize,
      supplierSize: value.supplierSize,
    };
  });
  const current = suggestion.variants.map((variant) => ({
    requestedQty: variant.requestedQty,
    sku: variant.sku,
    sourceSize: variant.sourceSize,
    supplierSize: variant.supplierSize,
  }));

  return JSON.stringify(stored) === JSON.stringify(current);
}

export default async function ApparelOrderSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ printavoOrderId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { profile } = await getCurrentProfile();

  if (!canAccessFeature(profile, "apparelOrdering")) {
    redirect("/dashboard");
  }

  const [{ printavoOrderId }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const orderId = Number(printavoOrderId);

  if (!Number.isSafeInteger(orderId) || orderId <= 0) {
    notFound();
  }

  const supabase = await createClient();
  const refresh = await refreshPrintavoOrder(supabase, orderId);
  const order = refresh.order;

  if (!order) {
    notFound();
  }

  const readiness = getApparelOrderReadiness(order);
  const eligible = refresh.fresh && readiness.eligible;
  const blockingReasons = refresh.fresh
    ? readiness.reasons
    : ["A fresh copy of this order could not be loaded from Printavo."];
  const matchingRequested =
    eligible && getParam(resolvedSearchParams, "supplier") === "ss";
  const result = getParam(resolvedSearchParams, "result");
  const sourceableLines = order.lineItems.filter(isSourceableApparelLine);
  const ssPoNumber = ssPrintavoPoNumber(order.orderNumber);
  const excludedLineCount = order.lineItems.length - sourceableLines.length;
  const mappingState: ApparelVendorMappingState = matchingRequested
    ? await getApparelVendorMappingState(supabase, orderId, sourceableLines)
    : {
        currentByLineItemId: new Map(),
        historicalBySource: new Map(),
      };
  const suggestions: Map<number, SsLineMatchResult> = matchingRequested
    ? await getSsLineSuggestions(
        sourceableLines,
        mappingState.historicalBySource,
      )
    : new Map<number, SsLineMatchResult>();
  const confirmedLineCount = sourceableLines.filter((lineItem) => {
    if (!lineItem.lineItemId) {
      return false;
    }

    const suggestion = suggestions.get(lineItem.lineItemId)?.suggestion;
    const stored = mappingState.currentByLineItemId.get(lineItem.lineItemId);

    return Boolean(
      suggestion &&
        stored &&
        isCurrentConfirmation(stored.vendor_variants, suggestion),
    );
  }).length;

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50">
      <div className="mx-auto flex max-w-[96rem] flex-col gap-8 px-6 py-8">
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
          <p className="mt-2 text-xs text-neutral-500">
            Checked Printavo {formatDateTime(refresh.checkedAt)}
            {refresh.fresh
              ? refresh.snapshotUpdated
                ? " · Local snapshot updated"
                : " · Local snapshot is current"
              : " · Showing the last saved snapshot"}
          </p>
        </header>

        {refresh.warning ? (
          <div
            className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-5 py-4 text-sm leading-6 text-amber-100"
            role="status"
          >
            {refresh.warning}
          </div>
        ) : null}

        {apparelOrderingRollout.mode === "review" ? (
          <div
            className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-5 py-4 text-sm leading-6 text-cyan-100"
            role="status"
          >
            Protected review mode is active. You can inspect Printavo data and
            generate S&amp;S suggestions, but you cannot confirm mappings,
            submit an S&amp;S order, or change a Printavo status.
          </div>
        ) : null}

        {matchingRequested && result === "confirmed" ? (
          <div
            className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-5 py-4 text-sm text-emerald-100"
            role="status"
          >
            S&amp;S line mapping confirmed and saved for reuse.
          </div>
        ) : null}

        {matchingRequested && result === "error" ? (
          <div
            className="rounded-lg border border-red-400/30 bg-red-400/10 px-5 py-4 text-sm text-red-100"
            role="alert"
          >
            That line could not be confirmed. Refresh the suggestions and verify
            that the Printavo and S&amp;S data are still complete.
          </div>
        ) : null}


        {matchingRequested && result === "protected" ? (
          <div
            className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-5 py-4 text-sm text-cyan-100"
            role="status"
          >
            That action is disabled while protected review mode is active.
          </div>
        ) : null}

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

        {!eligible ? (
          <section
            className="rounded-lg border border-amber-400/40 bg-amber-400/10 p-5"
            role="alert"
          >
            <h2 className="text-lg font-semibold text-amber-100">
              Apparel ordering is not available for this order.
            </h2>
            <p className="mt-2 text-sm leading-6 text-amber-100/80">
              Apparel ordering will become available after this order passes the
              readiness check.
            </p>
            {blockingReasons.length > 0 ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-100/80">
                {blockingReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
                Printavo order details
              </p>
              <h2 className="mt-2 text-2xl font-semibold">
                Printavo order lines
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
                All Printavo lines are shown. Only apparel lines that still
                require a supplier purchase are eligible for S&amp;S sourcing;
                ordered, informational, decoration, and other product lines
                remain visible for context.
              </p>
              {matchingRequested ? (
                <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
                  Suggestions use prior human confirmations first, then exact
                  S&amp;S style, brand, color, and size matches. Each unresolved
                  line includes the reason it needs attention.
                </p>
              ) : null}
            </div>
            <div className="text-sm text-neutral-400 sm:text-right">
              <p>
                {order.lineItems.length} Printavo line
                {order.lineItems.length === 1 ? "" : "s"}
              </p>
              <p className="mt-1">
                {sourceableLines.length} apparel sourcing line
                {sourceableLines.length === 1 ? "" : "s"} · {excludedLineCount}{" "}
                excluded
              </p>
              {matchingRequested ? (
                <p className="mt-1 text-emerald-300">
                  {confirmedLineCount} of {sourceableLines.length} apparel lines
                  confirmed
                </p>
              ) : null}
            </div>
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
                    <th className="min-w-56 px-3 py-3 font-semibold">
                      Sourcing status
                    </th>
                    {matchingRequested ? (
                      <>
                        <th className="min-w-64 px-3 py-3 font-semibold">
                          Suggested S&amp;S item
                        </th>
                        <th className="min-w-72 px-3 py-3 font-semibold">
                          Suggested S&amp;S SKUs
                        </th>
                        <th className="min-w-40 px-3 py-3 font-semibold">
                          Action
                        </th>
                      </>
                    ) : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800 bg-neutral-950">
                  {order.lineItems.map((lineItem, index) => {
                    const lineItemId = lineItem.lineItemId;
                    const match = lineItemId
                      ? suggestions.get(lineItemId)
                      : undefined;
                    const suggestion = match?.suggestion ?? null;
                    const sourcingClassification =
                      classifyApparelLineForSourcing(lineItem);
                    const storedConfirmation = lineItemId
                      ? mappingState.currentByLineItemId.get(lineItemId)
                      : undefined;
                    const confirmed = Boolean(
                      suggestion &&
                        storedConfirmation &&
                        isCurrentConfirmation(
                          storedConfirmation.vendor_variants,
                          suggestion,
                        ),
                    );

                    return (
                      <tr key={lineItemId ?? `line-${index}`}>
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
                      <td className="px-3 py-3 align-top">
                        {sourcingClassification.disposition ===
                        "non_apparel" ? (
                          <div>
                            <span className="inline-flex rounded border border-neutral-600 bg-neutral-800 px-2 py-1 text-xs font-medium text-neutral-200">
                              Excluded from apparel sourcing
                            </span>
                            <p className="mt-2 text-xs leading-5 text-neutral-400">
                              Not sent to S&amp;S.{" "}
                              {sourcingClassification.reason}
                            </p>
                          </div>
                        ) : sourcingClassification.disposition ===
                          "already_ordered" ? (
                          <div>
                            <span className="inline-flex rounded border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-xs font-medium text-emerald-100">
                              Already ordered
                            </span>
                            <p className="mt-2 text-xs leading-5 text-neutral-400">
                              No S&amp;S action required.{" "}
                              {sourcingClassification.reason}
                            </p>
                          </div>
                        ) : sourcingClassification.disposition ===
                          "informational" ? (
                          <div>
                            <span className="inline-flex rounded border border-neutral-600 bg-neutral-800 px-2 py-1 text-xs font-medium text-neutral-200">
                              Informational line
                            </span>
                            <p className="mt-2 text-xs leading-5 text-neutral-400">
                              Not sent to S&amp;S.{" "}
                              {sourcingClassification.reason}
                            </p>
                          </div>
                        ) : sourcingClassification.disposition ===
                          "decoration_only" ? (
                          <div>
                            <span className="inline-flex rounded border border-violet-400/30 bg-violet-400/10 px-2 py-1 text-xs font-medium text-violet-100">
                              Decoration or add-on
                            </span>
                            <p className="mt-2 text-xs leading-5 text-neutral-400">
                              Not sent to S&amp;S.{" "}
                              {sourcingClassification.reason}
                            </p>
                          </div>
                        ) : !eligible ? (
                          <div>
                            <span className="inline-flex rounded border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-xs font-medium text-amber-100">
                              Blocked by readiness check
                            </span>
                            <p className="mt-2 text-xs leading-5 text-neutral-400">
                              Resolve the order-level issues listed above before
                              requesting an S&amp;S suggestion.
                            </p>
                          </div>
                        ) : !matchingRequested ? (
                          <div>
                            <span className="inline-flex rounded border border-cyan-300/30 bg-cyan-300/10 px-2 py-1 text-xs font-medium text-cyan-100">
                              Ready for S&amp;S matching
                            </span>
                            <p className="mt-2 text-xs leading-5 text-neutral-400">
                              Populate suggestions to find the supplier item and
                              SKUs.
                            </p>
                          </div>
                        ) : suggestion && confirmed ? (
                          <div>
                            <span className="inline-flex rounded border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-xs font-medium text-emerald-100">
                              Confirmed
                            </span>
                            <p className="mt-2 text-xs leading-5 text-neutral-400">
                              Human-confirmed S&amp;S mapping.
                            </p>
                          </div>
                        ) : suggestion ? (
                          <div>
                            <span className="inline-flex rounded border border-cyan-300/30 bg-cyan-300/10 px-2 py-1 text-xs font-medium text-cyan-100">
                              Suggestion ready
                            </span>
                            <p className="mt-2 text-xs leading-5 text-neutral-400">
                              Confirm the proposed S&amp;S item and SKUs.
                            </p>
                          </div>
                        ) : (
                          <div>
                            <span className="inline-flex rounded border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-xs font-medium text-amber-100">
                              Needs manual mapping
                            </span>
                            <p className="mt-2 text-xs leading-5 text-neutral-400">
                              {match?.unresolvedReason ??
                                "No confident S&S suggestion was found."}
                            </p>
                          </div>
                        )}
                      </td>
                      {matchingRequested ? (
                        <>
                          <td className="px-3 py-3 align-top">
                            {suggestion ? (
                              <div>
                                <p className="font-medium text-neutral-100">
                                  {suggestion.supplierBrandName}{" "}
                                  {suggestion.supplierStyleName}
                                </p>
                                <p className="mt-1 text-xs text-neutral-400">
                                  {suggestion.supplierTitle}
                                </p>
                                <p className="mt-2 font-mono text-xs text-neutral-500">
                                  Part {suggestion.supplierPartNumber} ·{" "}
                                  {suggestion.supplierColor}
                                </p>
                                <span className="mt-2 inline-flex rounded border border-cyan-300/30 bg-cyan-300/10 px-2 py-1 text-xs text-cyan-100">
                                  {suggestion.matchSource ===
                                  "historical_confirmation"
                                    ? "Prior human mapping"
                                    : suggestion.matchSource ===
                                        "historical_reconciliation"
                                      ? "September/October history"
                                    : suggestion.matchSource ===
                                        "vendor_crossref"
                                      ? "S&S CrossRef mapping"
                                    : "Exact catalog match"}
                                </span>
                              </div>
                            ) : (
                              <span
                                aria-label="No suggestion"
                                className="text-neutral-600"
                              >
                                —
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3 align-top">
                            {suggestion ? (
                              <div className="space-y-2">
                                {suggestion.variants.map((variant) => (
                                  <div
                                    className="rounded border border-neutral-800 bg-neutral-900 px-2 py-2"
                                    key={`${variant.sourceSize}-${variant.sku}`}
                                  >
                                    <div className="flex items-center justify-between gap-3">
                                      <span className="font-mono text-neutral-200">
                                        {variant.sourceSize} ×{" "}
                                        {variant.requestedQty}
                                      </span>
                                      <span className="font-mono text-xs text-neutral-400">
                                        {variant.sku}
                                      </span>
                                    </div>
                                    <p
                                      className={`mt-1 text-xs ${
                                        variant.availableQty >=
                                        variant.requestedQty
                                          ? "text-emerald-300"
                                          : "text-amber-300"
                                      }`}
                                    >
                                      {variant.availableQty} available ·{" "}
                                      {formatCurrency(variant.customerPrice)}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-neutral-600">—</span>
                            )}
                          </td>
                          <td className="px-3 py-3 align-top">
                            {suggestion && lineItemId ? (
                              confirmed ? (
                                <span className="text-xs text-neutral-500">
                                  No action needed
                                </span>
                              ) : !apparelOrderingRollout.mappingConfirmationsEnabled ? (
                                <span className="text-xs text-cyan-200">
                                  Review only
                                </span>
                              ) : (
                                <form
                                  action={confirmSsLineMapping.bind(
                                    null,
                                    orderId,
                                    lineItemId,
                                  )}
                                >
                                  <PendingSubmitButton
                                    className="h-9 rounded-md border border-emerald-400/50 px-3 text-xs font-medium text-emerald-100 transition hover:bg-emerald-400/10"
                                    pendingLabel="Confirming"
                                  >
                                    Confirm line
                                  </PendingSubmitButton>
                                </form>
                              )
                            ) : (
                              <span className="text-xs text-neutral-500">
                                No action available
                              </span>
                            )}
                          </td>
                        </>
                      ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-5 rounded-md border border-dashed border-neutral-700 bg-neutral-950 px-4 py-8 text-center text-sm text-neutral-400">
              This Printavo snapshot does not contain any order line items.
            </p>
          )}
        </section>

        {eligible ? (
          <section className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-5">
            <h2 className="text-lg font-semibold text-emerald-100">
              {apparelOrderingRollout.mode === "review"
                ? "Ready for protected review"
                : "Ready for apparel ordering"}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-100/80">
              {apparelOrderingRollout.mode === "review"
                ? "The latest Printavo order has sourceable apparel quantities, styles, colors, and sizes. Generate read-only S&S suggestions without saving confirmations, creating a supplier order, or changing Printavo."
                : "The latest Printavo order has sourceable apparel quantities, styles, colors, and sizes. Build an S&S suggestion for each line, then confirm the mappings individually. No supplier order will be created unless its separate submission switch is explicitly enabled."}
            </p>
            <p className="mt-2 text-sm text-emerald-100/80">
              S&amp;S purchase order reference: {ssPoNumber}
            </p>
            <Link
              className="mt-5 inline-flex h-10 items-center rounded-md border border-emerald-400/50 px-4 text-sm font-medium text-emerald-100 transition hover:bg-emerald-400/10"
              href={`/apparel-orders/${orderId}?supplier=ss`}
            >
              {matchingRequested
                ? "Refresh S&S suggestions"
                : apparelOrderingRollout.mode === "review"
                  ? "Generate read-only S&S suggestions"
                  : "Populate S&S cart suggestions"}
            </Link>
          </section>
        ) : null}
      </div>
    </main>
  );
}
