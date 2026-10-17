import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
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
import {
  reconcileSsBasket,
  type SsBasketReconciliation,
  type SsBasketReconciliationCandidate,
} from "@/lib/apparel-ordering/order-reconciliation";
import { canAccessFeature } from "@/lib/features/feature-flags";
import { formatCurrency } from "@/lib/formatters";
import {
  classifyApparelLineForSourcing,
  getApparelOrderReadiness,
  isSourceableApparelLine,
  type PrintavoOrderLineSummary,
} from "@/lib/printavo/order-summary";
import { refreshPrintavoOrder } from "@/lib/printavo/recent-orders";
import { getSsOrderHistory } from "@/lib/ss/client";
import { ssPrintavoPoNumber } from "@/lib/ss/order-request";
import { createClient } from "@/utils/supabase/server";

type SearchParams = {
  demo?: string | string[];
  reconcile?: string | string[];
  result?: string | string[];
  supplier?: string | string[];
  testBasket?: string | string[];
};

type ReconciliationState = {
  endDate: string;
  error: string | null;
  report: SsBasketReconciliation | null;
  startDate: string;
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

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function reconciliationWindow(dueDate: string | null) {
  const anchor = dueDate
    ? new Date(`${dueDate.slice(0, 10)}T00:00:00Z`)
    : new Date();
  const start = new Date(anchor);
  const end = new Date(anchor);
  start.setUTCDate(start.getUTCDate() - 60);
  end.setUTCDate(end.getUTCDate() + 14);

  return { endDate: isoDate(end), startDate: isoDate(start) };
}

function reconciliationStatusLabel(
  status: SsBasketReconciliation["rows"][number]["status"],
) {
  switch (status) {
    case "match":
      return "Match";
    case "missing":
      return "Missing from actual";
    case "extra":
      return "Extra in actual";
    case "quantity_mismatch":
      return "Quantity mismatch";
  }
}

function historicalDate(value: string | null) {
  if (!value) {
    return "Not provided by S&S";
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeZone: "America/Phoenix",
      }).format(parsed);
}

function mappingPresentation(suggestion: SsLineSuggestion) {
  switch (suggestion.matchSource) {
    case "historical_confirmation":
      return {
        confidence: "Confirmed",
        source: "Previously confirmed mapping",
        explanation:
          "A person previously confirmed this Printavo-to-S&S relationship.",
      };
    case "historical_reconciliation":
      return {
        confidence: suggestion.mappingConfidenceScore
          ? `High · ${Math.round(suggestion.mappingConfidenceScore * 100)}% evidence score`
          : "High",
        source: "Historical order evidence",
        explanation: `${suggestion.mappingEvidenceCount || "Multiple"} historical order${suggestion.mappingEvidenceCount === 1 ? "" : "s"} supported the same product relationship.`,
      };
    case "vendor_crossref":
      return {
        confidence: "High",
        source: "S&S cross-reference",
        explanation:
          "S&S cross-reference data identified one product and one SKU for every requested size.",
      };
    case "vendor_catalog":
      return {
        confidence: "Medium",
        source: "S&S catalog inference",
        explanation:
          "The Printavo description, style, color and sizes resolved to one catalog product, but the relationship has not been historically confirmed.",
      };
  }
}

function candidateComparisonSummary(
  candidate: SsBasketReconciliationCandidate,
) {
  const difference = candidate.differenceSummary;
  const clauses: string[] = [];

  if (candidate.expectedCoverage === 1) {
    clauses.push(
      `The candidate contains all ${candidate.expectedTotalQty} generated units across ${candidate.expectedSkuCount} SKUs.`,
    );
  } else {
    clauses.push(
      `The candidate contains ${candidate.matchedQty} of ${candidate.expectedTotalQty} generated units.`,
    );
  }

  if (difference.missingSkuCount > 0) {
    clauses.push(
      `${difference.missingSkuCount} expected SKU${difference.missingSkuCount === 1 ? " is" : "s are"} missing (${difference.missingUnitQty} units).`,
    );
  }
  if (difference.quantityMismatchSkuCount > 0) {
    clauses.push(
      `${difference.quantityMismatchSkuCount} generated SKU${difference.quantityMismatchSkuCount === 1 ? " has" : "s have"} a different quantity (${difference.quantityOverageQty} units over and ${difference.quantityShortageQty} units short).`,
    );
  }
  if (difference.extraSkuCount > 0) {
    clauses.push(
      `${difference.extraSkuCount} additional SKU${difference.extraSkuCount === 1 ? " is" : "s are"} present (${difference.extraUnitQty} units) outside the generated basket.`,
    );
  }
  if (
    difference.extraSkuCount === 0 &&
    difference.missingSkuCount === 0 &&
    difference.quantityMismatchSkuCount === 0
  ) {
    clauses.push("Every SKU and quantity is an exact match.");
  }

  return clauses.join(" ");
}

function operationalOutcome(report: SsBasketReconciliation) {
  if (report.ambiguous) {
    const completeCandidates = report.candidateOptions.filter(
      (candidate) => candidate.expectedCoverage === 1,
    ).length;

    return completeCandidates === report.candidateOptions.length
      ? {
          label: "Correct basket, but actual order cannot be identified",
          detail:
            "Every leading candidate contains the complete generated basket, but the historical references do not identify which supplier order belongs to this Printavo order.",
        }
      : {
          label: "Actual order cannot be identified",
          detail:
            "Multiple supplier orders have the same strongest SKU evidence, so selecting one would be a guess.",
        };
  }

  const candidate = report.candidate;

  if (!candidate) {
    return {
      label: "No comparable S&S order found",
      detail:
        "The search window contained no supplier order with the expected PO or meaningful generated-SKU overlap.",
    };
  }

  const difference = candidate.differenceSummary;

  if (
    difference.extraSkuCount === 0 &&
    difference.missingSkuCount === 0 &&
    difference.quantityMismatchSkuCount === 0
  ) {
    return {
      label: "Exact match",
      detail: "The generated and actual baskets have identical SKUs and quantities.",
    };
  }

  if (
    difference.extraSkuCount === 0 &&
    difference.missingSkuCount === 0 &&
    difference.quantityMismatchSkuCount > 0
  ) {
    return {
      label: "Same products, different quantities",
      detail:
        "The generated and actual baskets contain the same SKU set, but one or more quantities differ.",
    };
  }

  if (candidate.expectedCoverage === 1 && difference.extraSkuCount > 0) {
    return {
      label: "Generated basket included in a larger S&S order",
      detail:
        "The supplier order contains the full generated basket plus additional products, which is consistent with a combined purchase.",
    };
  }

  if (difference.missingSkuCount > 0 && difference.extraSkuCount > 0) {
    return {
      label: "Different products present",
      detail:
        "Some generated products are missing while other supplier products are present. This may represent a substitution and requires review.",
    };
  }

  if (difference.missingSkuCount > 0) {
    return {
      label: "Missing from actual order",
      detail: "One or more generated SKUs were not found in the supplier order.",
    };
  }

  return {
    label: "Extra product in actual order",
    detail: "The supplier order contains products outside the generated basket.",
  };
}

function likelyCauseAndAction(
  report: SsBasketReconciliation,
  expectedPoNumber: string,
) {
  if (report.ambiguityReason === "tied_sku_overlap") {
    return {
      action: `Use ${expectedPoNumber} as the S&S PO. If several Printavo jobs must be combined, preserve a traceable child reference for each job.`,
      bucket: "S&S purchasing-process issue",
      cause:
        "Multiple S&S orders contain equally strong exact-SKU evidence, none uses the expected Printavo reference, and the orders contain products outside this generated basket.",
    };
  }

  if (report.ambiguityReason === "multiple_purchase_order_matches") {
    return {
      action:
        "Keep each Printavo reference unique in S&S, or record the S&S order number back in Printavo when one PO must be reused.",
      bucket: "S&S purchasing-process issue",
      cause: `More than one S&S order used ${expectedPoNumber}, so the reference did not identify one historical purchase.`,
    };
  }

  if (!report.candidate) {
    return {
      action:
        "Verify whether the garments were purchased from S&S, another vendor, or outside the searched date window, then record that reference in Printavo.",
      bucket: "Printavo data/practice issue",
      cause:
        "No historical S&S order could be linked using the expected PO or generated SKUs.",
    };
  }

  const difference = report.candidate.differenceSummary;

  if (report.candidate.expectedCoverage === 1 && difference.extraSkuCount > 0) {
    return {
      action: `Use ${expectedPoNumber} as the S&S PO or record which larger supplier order contains this Printavo job.`,
      bucket: "S&S purchasing-process issue",
      cause:
        "The generated basket is present, but the S&S purchase includes additional products and may combine multiple jobs.",
    };
  }

  if (
    difference.missingSkuCount > 0 ||
    difference.quantityShortageQty > 0 ||
    difference.quantityOverageQty > 0
  ) {
    return {
      action:
        "Review whether the actual difference was an intentional substitution or quantity change. If it was not intentional, capture this order as a matching regression case.",
      bucket: "Ordering-tool issue",
      cause:
        "The generated basket and the identified S&S order differ in products or quantities.",
    };
  }

  return {
    action:
      "No corrective action is indicated. Keep using the Printavo reference so future reports remain directly traceable.",
    bucket: "No issue detected",
    cause: "The generated basket and identified S&S purchase agree.",
  };
}

function InfoDisclosure({
  children,
  label = "What does this mean?",
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <details className="group mt-3 text-sm text-neutral-400">
      <summary className="inline-flex cursor-pointer list-none items-center gap-2 text-cyan-200 hover:text-cyan-100">
        <span
          aria-hidden="true"
          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-cyan-400/50 text-xs font-semibold"
        >
          i
        </span>
        {label}
      </summary>
      <div className="mt-2 max-w-4xl rounded-md border border-neutral-800 bg-neutral-900/70 px-3 py-2 leading-6 text-neutral-300">
        {children}
      </div>
    </details>
  );
}

function demoLineExplanation(
  lineItem: PrintavoOrderLineSummary,
  match: SsLineMatchResult | undefined,
) {
  if (match?.suggestion) {
    return null;
  }

  const classification = classifyApparelLineForSourcing(lineItem);

  if (classification.disposition === "non_apparel") {
    return `The tool did not search S&S because this is a ${lineItem.category ?? "non-apparel"} line, not an apparel item to purchase.`;
  }

  if (classification.disposition === "informational") {
    return `The tool did not search S&S because this is an informational line. ${classification.reason}`;
  }

  if (classification.disposition === "decoration_only") {
    return `The tool did not search S&S because this line describes decoration or an add-on rather than a separate garment. ${classification.reason}`;
  }

  const reason = match?.unresolvedReason ?? "No confident S&S match was found.";
  const sizeMatch = reason.match(
    /No unambiguous S&S SKU was found for size (.+)\./i,
  );

  if (sizeMatch) {
    const size = sizeMatch[1];

    return size.toLowerCase() === "other"
      ? "Printavo uses the size “Other,” which does not identify a specific S&S size or SKU. Replace it with a standard size or add a confirmed mapping."
      : `The tool found the S&S product, but it could not identify exactly one SKU for size ${size}. Confirm the vendor size or add a mapping before ordering.`;
  }

  if (reason === "No unambiguous S&S style match was found.") {
    return "The Printavo style and description did not identify exactly one S&S product. Add the vendor style to the description or create a confirmed mapping so the tool does not have to guess.";
  }

  if (reason === "No unambiguous S&S color match was found.") {
    return "The Printavo color did not identify exactly one S&S color. Confirm the vendor color name or create a mapping before ordering.";
  }

  if (reason === "The Printavo style or color is missing.") {
    return "Printavo is missing the style number or color needed to search S&S. Add those details before ordering.";
  }

  return `The S&S lookup did not produce a safe match. ${reason}`;
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
  const replayReadiness = getApparelOrderReadiness(order, {
    replayOrderedLines: true,
  });
  const normallyEligible = refresh.fresh && readiness.eligible;
  const demoRequested =
    getParam(resolvedSearchParams, "demo") === "1" ||
    getParam(resolvedSearchParams, "testBasket") === "1";
  const orderedApparelLines = order.lineItems.filter(
    (lineItem) =>
      classifyApparelLineForSourcing(lineItem).disposition ===
      "already_ordered",
  );
  const normalSourceableLines = order.lineItems.filter(
    isSourceableApparelLine,
  );
  const demoMatchableLines = order.lineItems.filter((lineItem) => {
    const disposition = classifyApparelLineForSourcing(lineItem).disposition;

    return disposition === "sourceable" || disposition === "already_ordered";
  });
  const demoEligible = refresh.fresh && demoMatchableLines.length > 0;
  const blockingReasons = refresh.fresh
    ? readiness.reasons
    : ["A fresh copy of this order could not be loaded from Printavo."];
  const matchingRequested =
    getParam(resolvedSearchParams, "supplier") === "ss" &&
    (demoRequested ? demoEligible : normallyEligible);
  const showInlineSuggestions = matchingRequested && !demoRequested;
  const reconciliationRequested =
    demoRequested &&
    matchingRequested &&
    getParam(resolvedSearchParams, "reconcile") === "1";
  const result = getParam(resolvedSearchParams, "result");
  const matchingLines = demoRequested
    ? demoMatchableLines
    : normalSourceableLines;
  const ssPoNumber = ssPrintavoPoNumber(order.orderNumber);
  const excludedLineCount =
    order.lineItems.length - normalSourceableLines.length;
  const mappingState: ApparelVendorMappingState = matchingRequested
    ? await getApparelVendorMappingState(supabase, orderId, matchingLines)
    : {
        currentByLineItemId: new Map(),
        historicalBySource: new Map(),
      };
  const suggestions: Map<number, SsLineMatchResult> = matchingRequested
    ? await getSsLineSuggestions(
        matchingLines,
        mappingState.historicalBySource,
      )
    : new Map<number, SsLineMatchResult>();
  const confirmedLineCount = normalSourceableLines.filter((lineItem) => {
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
  const resolvedSuggestions = Array.from(suggestions.values()).flatMap(
    (match) => (match.suggestion ? [match.suggestion] : []),
  );
  const reconciliation: ReconciliationState | null = reconciliationRequested
    ? await (async () => {
        const window = reconciliationWindow(order.dueDate);

        if (resolvedSuggestions.length === 0) {
          return {
            ...window,
            error:
              "No generated S&S basket items are available to reconcile.",
            report: null,
          };
        }

        const history = await getSsOrderHistory(window);

        return history.ok
          ? {
              ...window,
              error: null,
              report: reconcileSsBasket({
                expectedPoNumber: ssPoNumber,
                orders: history.orders,
                suggestions: resolvedSuggestions,
              }),
            }
          : { ...window, error: history.error, report: null };
      })()
    : null;
  const reconciliationReport = reconciliation?.report ?? null;
  const reportCandidates = reconciliationReport?.candidate
    ? [reconciliationReport.candidate]
    : reconciliationReport?.candidateOptions ?? [];
  const reportOutcome = reconciliationReport
    ? operationalOutcome(reconciliationReport)
    : null;
  const reportCause = reconciliationReport
    ? likelyCauseAndAction(reconciliationReport, ssPoNumber)
    : null;

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
          {orderedApparelLines.length > 0 ? (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {/* TEMPORARY DEMO ORDER TOOL: Delete this read-only validation feature after the historical S&S mappings have been vetted. */}
              <Link
                className="inline-flex h-10 items-center rounded-md border border-cyan-400/50 bg-cyan-400/10 px-4 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/20"
                href={`/apparel-orders/${orderId}?supplier=ss&demo=1`}
              >
                Demo Order Tool
              </Link>
              <span className="text-xs text-neutral-500">
                Read-only preview for this entire order
              </span>
            </div>
          ) : null}
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

        {showInlineSuggestions && result === "confirmed" ? (
          <div
            className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-5 py-4 text-sm text-emerald-100"
            role="status"
          >
            S&amp;S line mapping confirmed and saved for reuse.
          </div>
        ) : null}

        {showInlineSuggestions && result === "error" ? (
          <div
            className="rounded-lg border border-red-400/30 bg-red-400/10 px-5 py-4 text-sm text-red-100"
            role="alert"
          >
            That line could not be confirmed. Refresh the suggestions and verify
            that the Printavo and S&amp;S data are still complete.
          </div>
        ) : null}


        {showInlineSuggestions && result === "protected" ? (
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

        {!normallyEligible ? (
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
              {showInlineSuggestions ? (
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
                {normalSourceableLines.length} apparel sourcing line
                {normalSourceableLines.length === 1 ? "" : "s"} · {excludedLineCount}{" "}
                excluded
              </p>
              {showInlineSuggestions ? (
                <p className="mt-1 text-emerald-300">
                  {confirmedLineCount} of {normalSourceableLines.length} apparel lines
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
                    {showInlineSuggestions ? (
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
                        ) : !normallyEligible ? (
                          <div>
                            <span className="inline-flex rounded border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-xs font-medium text-amber-100">
                              Blocked by readiness check
                            </span>
                            <p className="mt-2 text-xs leading-5 text-neutral-400">
                              Resolve the order-level issues listed above before
                              requesting an S&amp;S suggestion.
                            </p>
                          </div>
                        ) : !showInlineSuggestions ? (
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
                      {showInlineSuggestions ? (
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

        {normallyEligible ? (
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
              {showInlineSuggestions
                ? "Refresh S&S suggestions"
                : apparelOrderingRollout.mode === "review"
                  ? "Generate read-only S&S suggestions"
                  : "Populate S&S cart suggestions"}
            </Link>
          </section>
        ) : null}

      </div>

      {demoRequested && !reconciliation ? (
        <div
          aria-labelledby="demo-order-tool-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/85 px-4 py-8 backdrop-blur-sm"
          role="dialog"
        >
          <section className="max-h-full w-full max-w-6xl overflow-y-auto rounded-xl border border-neutral-600 bg-neutral-950 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.75)]">
            <div className="flex items-start justify-between gap-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
                  Read-only order preview
                </p>
                <h2
                  className="mt-2 text-2xl font-semibold text-neutral-50"
                  id="demo-order-tool-title"
                >
                  Demo Order Tool
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
                  This shows what the tool would do for every item on Printavo
                  #{order.orderNumber}. Nothing will be submitted to S&amp;S or
                  changed in Printavo.
                </p>
              </div>
              <Link
                aria-label="Close Demo Order Tool"
                className="inline-flex h-9 shrink-0 items-center rounded-md border border-neutral-700 px-3 text-sm text-neutral-200 transition hover:border-neutral-500"
                href={`/apparel-orders/${orderId}`}
              >
                Close
              </Link>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
                <p className="text-xs text-neutral-500">Printavo items</p>
                <p className="mt-2 text-xl font-semibold text-neutral-100">
                  {order.lineItems.length}
                </p>
              </div>
              <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 p-4">
                <p className="text-xs text-emerald-100/70">S&amp;S matches</p>
                <p className="mt-2 text-xl font-semibold text-emerald-100">
                  {resolvedSuggestions.length}
                </p>
              </div>
              <div className="rounded-lg border border-amber-400/20 bg-amber-400/10 p-4">
                <p className="text-xs text-amber-100/70">Not matched or not sourced</p>
                <p className="mt-2 text-xl font-semibold text-amber-100">
                  {order.lineItems.length - resolvedSuggestions.length}
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {order.lineItems.map((lineItem, index) => {
                const lineItemId = lineItem.lineItemId;
                const match = lineItemId
                  ? suggestions.get(lineItemId)
                  : undefined;
                const suggestion = match?.suggestion ?? null;
                const explanation = demoLineExplanation(lineItem, match);
                const classification =
                  classifyApparelLineForSourcing(lineItem);

                return (
                  <article
                    className="grid gap-4 rounded-lg border border-neutral-800 bg-neutral-900 p-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)_minmax(0,1.5fr)]"
                    key={lineItemId ?? `demo-line-${index}`}
                  >
                    <div>
                      <p className="font-medium text-neutral-100">
                        {lineItem.description ?? "Unnamed Printavo item"}
                      </p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {lineItem.category ?? "Uncategorized"}
                      </p>
                    </div>
                    <div className="text-sm text-neutral-300">
                      <p>
                        Style {lineItem.styleNumber ?? "not provided"} ·{" "}
                        {lineItem.color ?? "color not provided"}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-neutral-500">
                        {lineItem.sizes.length > 0
                          ? lineItem.sizes
                              .map(
                                (size) => `${size.label} × ${size.quantity}`,
                              )
                              .join(", ")
                          : `${lineItem.quantity ?? 0} total · no size breakdown`}
                      </p>
                    </div>
                    <div>
                      {suggestion ? (
                        <>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex rounded border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-xs font-medium text-emerald-100">
                              S&amp;S match found
                            </span>
                            <span className="text-sm font-medium text-neutral-100">
                              {suggestion.supplierBrandName}{" "}
                              {suggestion.supplierStyleName} ·{" "}
                              {suggestion.supplierColor}
                            </span>
                          </div>
                          <p className="mt-2 text-xs text-neutral-400">
                            Part {suggestion.supplierPartNumber} ·{" "}
                            {suggestion.supplierTitle}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {suggestion.variants.map((variant) => (
                              <span
                                className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 font-mono text-xs text-neutral-200"
                                key={`${variant.sourceSize}-${variant.sku}`}
                              >
                                {variant.sourceSize} × {variant.requestedQty} ·{" "}
                                {variant.sku}
                              </span>
                            ))}
                          </div>
                        </>
                      ) : (
                        <>
                          <span
                            className={`inline-flex rounded border px-2 py-1 text-xs font-medium ${
                              classification.disposition === "sourceable" ||
                              classification.disposition === "already_ordered"
                                ? "border-amber-400/30 bg-amber-400/10 text-amber-100"
                                : "border-neutral-600 bg-neutral-800 text-neutral-200"
                            }`}
                          >
                            {classification.disposition === "sourceable" ||
                            classification.disposition === "already_ordered"
                              ? "No safe S&S match"
                              : "Not sent to S&S"}
                          </span>
                          <p className="mt-2 text-sm leading-6 text-neutral-300">
                            {explanation}
                          </p>
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-800 pt-5">
              <p className="text-xs text-neutral-500">
                Expected S&amp;S PO reference: {ssPoNumber}
              </p>
              <div className="flex flex-wrap gap-2">
                {resolvedSuggestions.length > 0 ? (
                  <Link
                    className="inline-flex h-10 items-center rounded-md border border-cyan-300/60 bg-cyan-300/10 px-4 text-sm font-medium text-cyan-50 transition hover:bg-cyan-300/20"
                    href={`/apparel-orders/${orderId}?supplier=ss&demo=1&reconcile=1`}
                  >
                    Generate historical report
                  </Link>
                ) : null}
                <Link
                  className="inline-flex h-10 items-center rounded-md border border-neutral-700 px-4 text-sm font-medium text-neutral-200 transition hover:border-neutral-500"
                  href={`/apparel-orders/${orderId}`}
                >
                  Close
                </Link>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {reconciliation ? (
        <div
          aria-labelledby="ss-reconciliation-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/85 px-4 py-8 backdrop-blur-sm"
          role="dialog"
        >
          <section className="max-h-full w-full max-w-7xl overflow-y-auto rounded-xl border border-neutral-600 bg-neutral-950 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.75)]">
            <div className="flex items-start justify-between gap-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
                  Deterministic historical replay
                </p>
                <h2
                  className="mt-2 text-2xl font-semibold text-neutral-50"
                  id="ss-reconciliation-title"
                >
                  Historical order scorecard
                </h2>
                <p className="mt-2 max-w-4xl text-sm leading-6 text-neutral-400">
                  This report replays Printavo #{order.orderNumber}{" "}using the
                  current deterministic ordering rules, then compares the
                  generated basket with S&amp;S invoice history from {reconciliation.startDate}{" "}
                  through {reconciliation.endDate}. No AI interpretation is used.
                </p>
              </div>
              <Link
                aria-label="Close reconciliation report"
                className="inline-flex h-9 shrink-0 items-center rounded-md border border-neutral-700 px-3 text-sm text-neutral-200 transition hover:border-neutral-500"
                href={`/apparel-orders/${orderId}?supplier=ss&demo=1`}
              >
                Close
              </Link>
            </div>

            <div className="mt-6 space-y-6">
              <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
                      1 · Simulated decision
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-neutral-100">
                      What the tool would have done
                    </h3>
                    <InfoDisclosure>
                      The replay ignores the fact that these garments are now marked ordered, then applies today&apos;s deterministic readiness and matching rules to the saved Printavo details. Inventory shown is current, not historical.
                    </InfoDisclosure>
                  </div>
                  <span
                    className={`inline-flex rounded-full border px-3 py-1 text-sm font-medium ${
                      replayReadiness.eligible
                        ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100"
                        : "border-amber-400/40 bg-amber-400/10 text-amber-100"
                    }`}
                  >
                    {replayReadiness.eligible
                      ? "Printavo data was ready"
                      : "Printavo data was not ready"}
                  </span>
                </div>

                {!replayReadiness.eligible ? (
                  <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-amber-100">
                    {replayReadiness.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                ) : null}

                <div className="mt-5 space-y-3">
                  {order.lineItems.map((lineItem, index) => {
                    const lineItemId = lineItem.lineItemId;
                    const match = lineItemId
                      ? suggestions.get(lineItemId)
                      : undefined;
                    const suggestion = match?.suggestion ?? null;
                    const classification =
                      classifyApparelLineForSourcing(lineItem);
                    const explanation = demoLineExplanation(lineItem, match);
                    const wouldSource =
                      classification.disposition === "sourceable" ||
                      classification.disposition === "already_ordered";
                    const mapping = suggestion
                      ? mappingPresentation(suggestion)
                      : null;

                    return (
                      <article
                        className="rounded-lg border border-neutral-800 bg-neutral-950 p-4"
                        key={lineItemId ?? `scorecard-line-${index}`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-neutral-100">
                              {lineItem.description ?? "Unnamed Printavo item"}
                            </p>
                            <p className="mt-1 text-xs text-neutral-500">
                              Printavo line {lineItemId ?? "ID unavailable"} · {lineItem.category ?? "Uncategorized"}
                            </p>
                          </div>
                          <span
                            className={`inline-flex rounded border px-2 py-1 text-xs font-medium ${
                              suggestion
                                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                                : wouldSource
                                  ? "border-amber-400/30 bg-amber-400/10 text-amber-100"
                                  : "border-neutral-700 bg-neutral-800 text-neutral-200"
                            }`}
                          >
                            {suggestion
                              ? "Would send to S&S"
                              : wouldSource
                                ? "Would hold for review"
                                : "Would exclude"}
                          </span>
                        </div>

                        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                          <div className="text-sm leading-6 text-neutral-300">
                            <p>
                              Printavo: style {lineItem.styleNumber ?? "not provided"} · {lineItem.color ?? "color not provided"}
                            </p>
                            <p className="text-neutral-500">
                              {lineItem.sizes.length > 0
                                ? lineItem.sizes
                                    .map(
                                      (size) =>
                                        `${size.label} × ${size.quantity}`,
                                    )
                                    .join(", ")
                                : `${lineItem.quantity ?? 0} total · no size breakdown`}
                            </p>
                            {!wouldSource ? (
                              <p className="mt-2 text-neutral-400">
                                Reason excluded: {classification.reason}
                              </p>
                            ) : null}
                          </div>

                          <div>
                            {suggestion && mapping ? (
                              <>
                                <p className="text-sm font-medium text-neutral-100">
                                  S&amp;S {suggestion.supplierBrandName} {suggestion.supplierStyleName} · {suggestion.supplierColor}
                                </p>
                                <p className="mt-1 text-xs text-neutral-500">
                                  Part {suggestion.supplierPartNumber} · {suggestion.supplierTitle}
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {suggestion.variants.map((variant) => (
                                    <span
                                      className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 font-mono text-xs text-neutral-200"
                                      key={`${lineItemId}:${variant.sku}`}
                                    >
                                      {variant.sourceSize} → {variant.supplierSize} · {variant.sku} × {variant.requestedQty}
                                    </span>
                                  ))}
                                </div>
                                <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                                  <div className="rounded border border-neutral-800 bg-neutral-900 p-3">
                                    <p className="text-neutral-500">Mapping source</p>
                                    <p className="mt-1 font-medium text-neutral-200">
                                      {mapping.source}
                                    </p>
                                  </div>
                                  <div className="rounded border border-neutral-800 bg-neutral-900 p-3">
                                    <p className="text-neutral-500">Confidence</p>
                                    <p className="mt-1 font-medium text-neutral-200">
                                      {mapping.confidence}
                                    </p>
                                  </div>
                                </div>
                                <InfoDisclosure label="How was this mapping chosen?">
                                  {mapping.explanation}
                                </InfoDisclosure>
                              </>
                            ) : (
                              <p className="text-sm leading-6 text-amber-100">
                                {explanation}
                              </p>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
                  2 · Historical record
                </p>
                <h3 className="mt-2 text-xl font-semibold text-neutral-100">
                  What actually happened
                </h3>
                <InfoDisclosure>
                  The report searches S&amp;S orders by the expected {ssPoNumber} PO first, then by exact generated-SKU overlap. A candidate is evidence, not proof, unless one historical order is uniquely identifiable.
                </InfoDisclosure>

                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm leading-6">
                    <p className="font-medium text-neutral-100">Printavo history available</p>
                    <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-neutral-300">
                      <dt className="text-neutral-500">Current status</dt>
                      <dd>{order.statusName ?? "Not provided"}</dd>
                      <dt className="text-neutral-500">Last updated</dt>
                      <dd>{order.updatedAt ? formatDateTime(order.updatedAt) : "Not provided"}</dd>
                      <dt className="text-neutral-500">Marked ordered at</dt>
                      <dd>Not available in the current snapshot</dd>
                      <dt className="text-neutral-500">Comments or notes</dt>
                      <dd>Not available in the current order payload</dd>
                    </dl>
                    <InfoDisclosure label="Why are timestamps and notes unavailable?">
                      The current Printavo snapshot contains the current status and a general last-updated timestamp, but it does not contain status-change history or order comments. The report will not pretend the general update time is the moment purchasing occurred.
                    </InfoDisclosure>
                  </div>

                  <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm leading-6">
                    <p className="font-medium text-neutral-100">S&amp;S search result</p>
                    {reconciliation.error ? (
                      <p className="mt-3 text-red-200">
                        The historical lookup failed: {reconciliation.error}
                      </p>
                    ) : reportCandidates.length > 0 ? (
                      <p className="mt-3 text-neutral-300">
                        Found {reportCandidates.length} leading candidate{reportCandidates.length === 1 ? "" : "s"}. {reconciliationReport?.ambiguous ? "The evidence does not identify one actual order." : "One order was selected deterministically."}
                      </p>
                    ) : (
                      <p className="mt-3 text-amber-100">
                        No comparable S&amp;S order was found in the searched window.
                      </p>
                    )}
                    <p className="mt-3 text-xs text-neutral-500">
                      Search window: {reconciliation.startDate} through {reconciliation.endDate}
                    </p>
                  </div>
                </div>

                {reportCandidates.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {reportCandidates.map((candidate) => (
                      <article
                        className="rounded-lg border border-neutral-800 bg-neutral-950 p-4"
                        key={`actual:${candidate.orderNumber}:${candidate.poNumber}`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-mono font-semibold text-neutral-100">
                              S&amp;S order #{candidate.orderNumber}
                            </p>
                            <p className="mt-1 text-sm text-neutral-400">
                              PO {candidate.poNumber || "not provided"} · {historicalDate(candidate.orderDate ?? candidate.invoiceDate)}
                            </p>
                          </div>
                          <span className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200">
                            {candidate.actualTotalQty} units · {candidate.actualSkuCount} SKUs
                          </span>
                        </div>

                        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                          <div>
                            <dt className="text-xs text-neutral-500">Warehouse(s)</dt>
                            <dd className="mt-1 text-neutral-200">
                              {candidate.warehouses.join(", ") || "Not provided"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-neutral-500">Invoice(s)</dt>
                            <dd className="mt-1 text-neutral-200">
                              {candidate.invoiceNumbers.join(", ") || "Not provided"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-neutral-500">S&amp;S status</dt>
                            <dd className="mt-1 text-neutral-200">
                              {candidate.orderStatuses.join(", ") || "Not provided"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-neutral-500">Fulfillment records</dt>
                            <dd className="mt-1 text-neutral-200">
                              {candidate.guidCount} record{candidate.guidCount === 1 ? "" : "s"} · {candidate.warehouseCount} warehouse{candidate.warehouseCount === 1 ? "" : "s"}
                            </dd>
                          </div>
                        </dl>

                        {candidate.differenceSummary.extraSkuCount > 0 ? (
                          <p className="mt-4 rounded-md border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-sm leading-6 text-amber-100">
                            This supplier order contains products outside the generated basket, so it may combine this Printavo job with other purchasing.
                          </p>
                        ) : null}

                        <details className="mt-4">
                          <summary className="cursor-pointer text-sm font-medium text-cyan-200 hover:text-cyan-100">
                            Show all {candidate.actualSkuCount}{" "}actual S&amp;S SKUs
                          </summary>
                          <div className="mt-3 overflow-x-auto rounded-lg border border-neutral-800">
                            <table className="min-w-full border-collapse text-sm">
                              <thead className="bg-neutral-800 text-left text-neutral-200">
                                <tr>
                                  <th className="px-3 py-3 font-semibold">SKU</th>
                                  <th className="px-3 py-3 font-semibold">Product</th>
                                  <th className="px-3 py-3 font-semibold">Color</th>
                                  <th className="px-3 py-3 font-semibold">Size</th>
                                  <th className="px-3 py-3 text-right font-semibold">Qty</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-neutral-800">
                                {candidate.actualLines.map((line) => (
                                  <tr key={`${candidate.orderNumber}:${line.sku}`}>
                                    <td className="px-3 py-3 font-mono text-neutral-100">{line.sku}</td>
                                    <td className="px-3 py-3 text-neutral-300">
                                      {[line.brandName, line.styleName, line.title].filter(Boolean).join(" · ") || "Not provided"}
                                    </td>
                                    <td className="px-3 py-3 text-neutral-300">{line.colorName || "Not provided"}</td>
                                    <td className="px-3 py-3 text-neutral-300">{line.sizeName || "Not provided"}</td>
                                    <td className="px-3 py-3 text-right font-mono text-neutral-200">{line.quantity}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </details>
                      </article>
                    ))}
                  </div>
                ) : null}
              </section>

              <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
                  3 · Comparison
                </p>
                <h3 className="mt-2 text-xl font-semibold text-neutral-100">
                  Generated basket compared with history
                </h3>
                <InfoDisclosure>
                  Matching compares exact S&amp;S SKU codes and quantities. Generated coverage asks how much of the proposed basket appears in a candidate. Order coverage asks how much of the larger supplier order is explained by this Printavo basket.
                </InfoDisclosure>

                {reportOutcome ? (
                  <div className="mt-5 rounded-lg border border-amber-400/30 bg-amber-400/10 p-4">
                    <p className="font-semibold text-amber-100">{reportOutcome.label}</p>
                    <p className="mt-1 text-sm leading-6 text-amber-100/80">{reportOutcome.detail}</p>
                  </div>
                ) : (
                  <div className="mt-5 rounded-lg border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-100">
                    Comparison unavailable because the S&amp;S history lookup did not complete.
                  </div>
                )}

                <div className="mt-4 space-y-3">
                  {reportCandidates.map((candidate) => {
                    const difference = candidate.differenceSummary;

                    return (
                      <article
                        className="rounded-lg border border-neutral-800 bg-neutral-950 p-4"
                        key={`comparison:${candidate.orderNumber}:${candidate.poNumber}`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-neutral-100">Candidate #{candidate.orderNumber}</p>
                            <p className="mt-1 max-w-4xl text-sm leading-6 text-neutral-400">
                              {candidateComparisonSummary(candidate)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-mono text-lg font-semibold text-neutral-100">
                              {candidate.matchedQty} / {candidate.expectedTotalQty}
                            </p>
                            <p className="text-xs text-neutral-500">generated units matched</p>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                          <div className="rounded border border-emerald-400/20 bg-emerald-400/5 p-3">
                            <p className="text-xs text-neutral-500">Exact SKU quantities</p>
                            <p className="mt-1 font-semibold text-emerald-200">{difference.exactSkuCount}</p>
                          </div>
                          <div className="rounded border border-amber-400/20 bg-amber-400/5 p-3">
                            <p className="text-xs text-neutral-500">Extra SKUs</p>
                            <p className="mt-1 font-semibold text-amber-200">{difference.extraSkuCount} · {difference.extraUnitQty} units</p>
                          </div>
                          <div className="rounded border border-amber-400/20 bg-amber-400/5 p-3">
                            <p className="text-xs text-neutral-500">Quantity differences</p>
                            <p className="mt-1 font-semibold text-amber-200">{difference.quantityMismatchSkuCount} SKUs</p>
                          </div>
                          <div className="rounded border border-red-400/20 bg-red-400/5 p-3">
                            <p className="text-xs text-neutral-500">Missing SKUs</p>
                            <p className="mt-1 font-semibold text-red-200">{difference.missingSkuCount} · {difference.missingUnitQty} units</p>
                          </div>
                          <div className="rounded border border-neutral-700 bg-neutral-900 p-3">
                            <p className="text-xs text-neutral-500">Coverage</p>
                            <p className="mt-1 text-sm text-neutral-200">
                              {(candidate.expectedCoverage * 100).toFixed(1)}% generated · {(candidate.supplierCoverage * 100).toFixed(1)}% order
                            </p>
                          </div>
                        </div>

                        <details className="mt-4">
                          <summary className="cursor-pointer text-sm font-medium text-cyan-200 hover:text-cyan-100">
                            Show exact SKU-by-SKU comparison
                          </summary>
                          <div className="mt-3 overflow-x-auto rounded-lg border border-neutral-800">
                            <table className="min-w-full border-collapse text-sm">
                              <thead className="bg-neutral-800 text-left text-neutral-200">
                                <tr>
                                  <th className="px-3 py-3 font-semibold">S&amp;S SKU</th>
                                  <th className="px-3 py-3 text-right font-semibold">Generated</th>
                                  <th className="px-3 py-3 text-right font-semibold">Actual</th>
                                  <th className="px-3 py-3 text-right font-semibold">Difference</th>
                                  <th className="px-3 py-3 font-semibold">Meaning</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-neutral-800">
                                {candidate.rows.map((row) => (
                                  <tr key={`${candidate.orderNumber}:compare:${row.sku}`}>
                                    <td className="px-3 py-3 font-mono text-neutral-100">{row.sku}</td>
                                    <td className="px-3 py-3 text-right font-mono text-neutral-300">{row.expectedQty}</td>
                                    <td className="px-3 py-3 text-right font-mono text-neutral-300">{row.actualQty}</td>
                                    <td className="px-3 py-3 text-right font-mono text-neutral-300">
                                      {row.difference > 0 ? "+" : ""}{row.difference}
                                    </td>
                                    <td className="px-3 py-3 text-neutral-300">{reconciliationStatusLabel(row.status)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </details>
                      </article>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
                  4 · Cause and next step
                </p>
                <h3 className="mt-2 text-xl font-semibold text-neutral-100">
                  Likely cause and recommended action
                </h3>
                <InfoDisclosure>
                  The issue area is selected by fixed rules from the evidence above. It is not an AI opinion. When the facts allow more than one explanation, the recommendation asks for human verification instead of claiming certainty.
                </InfoDisclosure>

                {reportCause ? (
                  <div className="mt-5 grid gap-3 lg:grid-cols-[0.65fr_1.35fr]">
                    <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-4">
                      <p className="text-xs uppercase tracking-[0.15em] text-amber-100/70">Issue area</p>
                      <p className="mt-2 font-semibold text-amber-100">{reportCause.bucket}</p>
                      <p className="mt-3 text-sm leading-6 text-amber-100/80">{reportCause.cause}</p>
                    </div>
                    <div className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 p-4">
                      <p className="text-xs uppercase tracking-[0.15em] text-cyan-100/70">Recommended action</p>
                      <p className="mt-2 text-sm leading-6 text-cyan-50">{reportCause.action}</p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-5 rounded-lg border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-100">
                    A cause cannot be assigned until the S&amp;S historical lookup succeeds.
                  </p>
                )}
              </section>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
