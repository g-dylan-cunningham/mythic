import type { SupabaseClient } from "@supabase/supabase-js";
import {
  reconcileSsBasket,
  type SsBasketReconciliation,
  type SsBasketReconciliationCandidate,
} from "@/lib/apparel-ordering/order-reconciliation";
import {
  getSsLineSuggestions,
  type SsLineMatchResult,
  type SsLineSuggestion,
} from "@/lib/apparel-ordering/ss-matching";
import { getApparelVendorMappingState } from "@/lib/apparel-ordering/vendor-mappings";
import {
  classifyApparelLineForSourcing,
  getApparelOrderReadiness,
  type ApparelLineSourcingDisposition,
  type PrintavoOrderDetails,
  type PrintavoOrderLineSummary,
} from "@/lib/printavo/order-summary";
import type { SsPlacedOrder } from "@/lib/ss/client";
import { ssPrintavoPoNumber } from "@/lib/ss/order-request";

export type HistoricalFindingBucket =
  | "Insufficient evidence"
  | "No issue detected"
  | "Ordering-tool issue"
  | "Printavo data/practice issue"
  | "S&S purchasing-process issue";

export type HistoricalOutcomeCategory =
  | "Actual order cannot be identified"
  | "Correct basket, but actual order cannot be identified"
  | "Exact match"
  | "Extra product in actual order"
  | "Generated basket included in a larger S&S order"
  | "Missing from actual order"
  | "No comparable S&S order found"
  | "Same products, different quantities"
  | "Tool could not generate a complete basket"
  | "Tool would not consider this order ready"
  | "Different products present";

export type HistoricalLineReport = {
  action: "excluded" | "selected" | "unresolved";
  color: string | null;
  confidence: string | null;
  description: string | null;
  disposition: ApparelLineSourcingDisposition;
  evidenceId: string;
  explanation: string;
  issueBucket: HistoricalFindingBucket | null;
  lineItemId: number | null;
  mappingEvidenceCount: number;
  mappingSource: SsLineSuggestion["matchSource"] | null;
  quantity: number | null;
  selectedSkus: Array<{
    requestedQty: number;
    size: string;
    sku: string;
  }>;
  styleNumber: string | null;
  supplierColor: string | null;
  supplierStyle: string | null;
};

export type HistoricalOrderFinding = {
  bucket: HistoricalFindingBucket;
  evidenceIds: string[];
  likelyCause: string;
  outcome: HistoricalOutcomeCategory;
  recommendation: string;
  summary: string;
};

export type HistoricalOrderEvaluation = {
  actualCandidates: SsBasketReconciliationCandidate[];
  error: string | null;
  expectedPoNumber: string;
  finding: HistoricalOrderFinding;
  historyWindow: { endDate: string; startDate: string };
  lines: HistoricalLineReport[];
  order: PrintavoOrderDetails;
  readiness: ReturnType<typeof getApparelOrderReadiness>;
  reconciliation: SsBasketReconciliation | null;
  selectedSkuCount: number;
  selectedUnitCount: number;
};

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function historicalReconciliationWindow(dueDate: string | null) {
  const anchor = dueDate
    ? new Date(`${dueDate.slice(0, 10)}T00:00:00Z`)
    : new Date();
  const start = new Date(anchor);
  const end = new Date(anchor);
  start.setUTCDate(start.getUTCDate() - 60);
  end.setUTCDate(end.getUTCDate() + 14);

  return { endDate: isoDate(end), startDate: isoDate(start) };
}

export function combinedHistoricalWindow(orders: PrintavoOrderDetails[]) {
  const windows = orders.map((order) =>
    historicalReconciliationWindow(order.dueDate),
  );

  return {
    endDate: windows.map((window) => window.endDate).sort().at(-1) ?? isoDate(new Date()),
    startDate:
      windows.map((window) => window.startDate).sort().at(0) ??
      isoDate(new Date()),
  };
}

function ordersInsideWindow(
  orders: SsPlacedOrder[],
  window: { endDate: string; startDate: string },
) {
  return orders.filter((order) => {
    const date = (order.invoiceDate ?? order.orderDate)?.slice(0, 10);

    return !date || (date >= window.startDate && date <= window.endDate);
  });
}

function mappingConfidence(suggestion: SsLineSuggestion) {
  switch (suggestion.matchSource) {
    case "historical_confirmation":
      return "Confirmed";
    case "historical_reconciliation":
      return suggestion.mappingConfidenceScore === null
        ? "High"
        : `High (${Math.round(suggestion.mappingConfidenceScore * 100)}% evidence score)`;
    case "vendor_crossref":
      return "High";
    case "vendor_catalog":
      return "Medium";
  }
}

function selectedLineExplanation(suggestion: SsLineSuggestion) {
  const units = suggestion.variants.reduce(
    (total, variant) => total + variant.requestedQty,
    0,
  );

  return `${suggestion.supplierStyleName} in ${suggestion.supplierColor}; ${suggestion.variants.length} SKU${suggestion.variants.length === 1 ? "" : "s"} and ${units} unit${units === 1 ? "" : "s"} selected.`;
}

function lineEvidenceId(
  order: PrintavoOrderDetails,
  lineItem: PrintavoOrderLineSummary,
  index: number,
) {
  return `PA-${order.orderNumber}:line-${lineItem.lineItemId ?? index + 1}`;
}

function lineReport(
  order: PrintavoOrderDetails,
  lineItem: PrintavoOrderLineSummary,
  index: number,
  match: SsLineMatchResult | undefined,
): HistoricalLineReport {
  const classification = classifyApparelLineForSourcing(lineItem);
  const evidenceId = lineEvidenceId(order, lineItem, index);

  if (match?.suggestion) {
    return {
      action: "selected",
      color: lineItem.color,
      confidence: mappingConfidence(match.suggestion),
      description: lineItem.description,
      disposition: classification.disposition,
      evidenceId,
      explanation: selectedLineExplanation(match.suggestion),
      issueBucket: null,
      lineItemId: lineItem.lineItemId,
      mappingEvidenceCount: match.suggestion.mappingEvidenceCount,
      mappingSource: match.suggestion.matchSource,
      quantity: lineItem.quantity,
      selectedSkus: match.suggestion.variants.map((variant) => ({
        requestedQty: variant.requestedQty,
        size: variant.sourceSize,
        sku: variant.sku,
      })),
      styleNumber: lineItem.styleNumber,
      supplierColor: match.suggestion.supplierColor,
      supplierStyle: match.suggestion.supplierStyleName,
    };
  }

  const wasMatchable =
    classification.disposition === "sourceable" ||
    classification.disposition === "already_ordered";

  const explanation = wasMatchable
    ? (match?.unresolvedReason ?? "No confident S&S selection was found.")
    : classification.reason;
  const issueBucket: HistoricalFindingBucket | null = wasMatchable
    ? /size Other|style or color is missing/i.test(explanation)
      ? "Printavo data/practice issue"
      : "Ordering-tool issue"
    : null;

  return {
    action: wasMatchable ? "unresolved" : "excluded",
    color: lineItem.color,
    confidence: null,
    description: lineItem.description,
    disposition: classification.disposition,
    evidenceId,
    explanation,
    issueBucket,
    lineItemId: lineItem.lineItemId,
    mappingEvidenceCount: 0,
    mappingSource: null,
    quantity: lineItem.quantity,
    selectedSkus: [],
    styleNumber: lineItem.styleNumber,
    supplierColor: null,
    supplierStyle: null,
  };
}

function candidateSummary(candidate: SsBasketReconciliationCandidate) {
  const difference = candidate.differenceSummary;
  const clauses: string[] = [];

  clauses.push(
    `The generated basket matched ${candidate.matchedQty} of ${candidate.expectedTotalQty} units across ${candidate.matchedSkuCount} of ${candidate.expectedSkuCount} SKUs.`,
  );

  if (difference.missingSkuCount > 0) {
    clauses.push(
      `${difference.missingSkuCount} expected SKU${difference.missingSkuCount === 1 ? " was" : "s were"} missing (${difference.missingUnitQty} units).`,
    );
  }
  if (difference.quantityMismatchSkuCount > 0) {
    clauses.push(
      `${difference.quantityMismatchSkuCount} shared SKU${difference.quantityMismatchSkuCount === 1 ? " had" : "s had"} different quantities (${difference.quantityOverageQty} units over, ${difference.quantityShortageQty} short).`,
    );
  }
  if (difference.extraSkuCount > 0) {
    clauses.push(
      `${difference.extraSkuCount} unrelated SKU${difference.extraSkuCount === 1 ? " was" : "s were"} also present (${difference.extraUnitQty} units).`,
    );
  }

  return clauses.join(" ");
}

function deterministicFinding({
  error,
  expectedPoNumber,
  lines,
  readiness,
  reconciliation,
}: {
  error: string | null;
  expectedPoNumber: string;
  lines: HistoricalLineReport[];
  readiness: HistoricalOrderEvaluation["readiness"];
  reconciliation: SsBasketReconciliation | null;
}): HistoricalOrderFinding {
  const selected = lines.filter((line) => line.action === "selected");
  const unresolved = lines.filter((line) => line.action === "unresolved");
  const evidenceIds = lines.map((line) => line.evidenceId);

  if (!readiness.eligible) {
    return {
      bucket: "Printavo data/practice issue",
      evidenceIds,
      likelyCause: readiness.reasons.join(" "),
      outcome: "Tool would not consider this order ready",
      recommendation:
        "Correct the blocking Printavo fields or status before relying on an automated supplier basket.",
      summary: `Historical replay found ${readiness.reasons.length} readiness blocker${readiness.reasons.length === 1 ? "" : "s"}.`,
    };
  }

  if (selected.length === 0 || unresolved.length > 0) {
    return {
      bucket: "Ordering-tool issue",
      evidenceIds: unresolved.length > 0 ? unresolved.map((line) => line.evidenceId) : evidenceIds,
      likelyCause:
        unresolved.map((line) => line.explanation).join(" ") ||
        "The matcher did not produce any safe S&S selections.",
      outcome: "Tool could not generate a complete basket",
      recommendation:
        "Add or confirm the missing Printavo-to-S&S mappings, then replay this order as a regression case.",
      summary: `The tool selected ${selected.length} line${selected.length === 1 ? "" : "s"}, but ${unresolved.length} sourceable line${unresolved.length === 1 ? " was" : "s were"} unresolved.`,
    };
  }

  if (error || !reconciliation) {
    return {
      bucket: "Insufficient evidence",
      evidenceIds,
      likelyCause: error ?? "S&S order history was not available for comparison.",
      outcome: "No comparable S&S order found",
      recommendation:
        "Restore S&S history access and rerun this order; do not treat the absence of a comparison as a product mismatch.",
      summary: "The generated basket is available, but the actual purchase could not be evaluated.",
    };
  }

  if (reconciliation.ambiguous) {
    const candidates = reconciliation.candidateOptions;
    const allComplete =
      candidates.length > 0 &&
      candidates.every((candidate) => candidate.expectedCoverage === 1);

    return {
      bucket: "S&S purchasing-process issue",
      evidenceIds: [
        ...evidenceIds,
        ...candidates.map(
          (candidate) => `SS-${candidate.orderNumber}:candidate`,
        ),
      ],
      likelyCause:
        reconciliation.ambiguityReason === "multiple_purchase_order_matches"
          ? `More than one S&S order used ${expectedPoNumber}.`
          : "Multiple S&S orders had the same strongest exact-SKU overlap and none was uniquely traceable to this Printavo order.",
      outcome: allComplete
        ? "Correct basket, but actual order cannot be identified"
        : "No comparable S&S order found",
      recommendation: `Use ${expectedPoNumber} as the S&S PO. If jobs are combined, record a traceable child reference or the S&S order number in Printavo.`,
      summary: `${candidates.length} S&S orders tied as the strongest candidate; choosing one would be a guess.`,
    };
  }

  const candidate = reconciliation.candidate;

  if (!candidate) {
    return {
      bucket: "Printavo data/practice issue",
      evidenceIds,
      likelyCause:
        "No S&S order in the historical window used the expected PO or contained meaningful generated-SKU overlap.",
      outcome: "No comparable S&S order found",
      recommendation:
        "Verify the vendor and purchase date, then record the supplier order number or PO reference in Printavo.",
      summary: "No historical S&S order could be linked to the generated basket.",
    };
  }

  const difference = candidate.differenceSummary;
  const candidateEvidence = `SS-${candidate.orderNumber}:candidate`;
  const sharedEvidence = [...evidenceIds, candidateEvidence];

  if (
    reconciliation.matchMethod === "sku_overlap" &&
    candidate.expectedCoverage < 1
  ) {
    return {
      bucket: "Insufficient evidence",
      evidenceIds: sharedEvidence,
      likelyCause: `S&S order #${candidate.orderNumber} was the strongest SKU-overlap candidate, but it contained only ${Math.round(candidate.expectedCoverage * 100)}% of the generated units and did not use ${expectedPoNumber}. The data does not prove it was the purchase for this Printavo order.`,
      outcome: "Actual order cannot be identified",
      recommendation:
        "Verify the S&S order number manually before treating product or quantity differences as tool errors. Record that supplier order number in Printavo for future replay.",
      summary: `${candidateSummary(candidate)} This is an investigative lead, not a confirmed actual order.`,
    };
  }

  if (
    difference.extraSkuCount === 0 &&
    difference.missingSkuCount === 0 &&
    difference.quantityMismatchSkuCount === 0
  ) {
    return {
      bucket: "No issue detected",
      evidenceIds: sharedEvidence,
      likelyCause: "The generated and actual baskets agree exactly.",
      outcome: "Exact match",
      recommendation: `Keep using ${expectedPoNumber} so the match remains directly traceable.`,
      summary: candidateSummary(candidate),
    };
  }

  if (
    difference.extraSkuCount === 0 &&
    difference.missingSkuCount === 0 &&
    difference.quantityMismatchSkuCount > 0
  ) {
    return {
      bucket: "Ordering-tool issue",
      evidenceIds: sharedEvidence,
      likelyCause:
        "The tool and purchaser selected the same products but used different quantities.",
      outcome: "Same products, different quantities",
      recommendation:
        "Check whether Printavo quantities changed after purchasing. If not, retain this order as a quantity regression case.",
      summary: candidateSummary(candidate),
    };
  }

  if (candidate.expectedCoverage === 1 && difference.extraSkuCount > 0) {
    return {
      bucket: "S&S purchasing-process issue",
      evidenceIds: sharedEvidence,
      likelyCause:
        "The full generated basket is present inside a larger S&S purchase, suggesting several jobs were ordered together.",
      outcome: "Generated basket included in a larger S&S order",
      recommendation: `Use ${expectedPoNumber} as the S&S PO or record which combined S&S order contains this job.`,
      summary: candidateSummary(candidate),
    };
  }

  if (difference.missingSkuCount > 0 && difference.extraSkuCount > 0) {
    return {
      bucket: "Ordering-tool issue",
      evidenceIds: sharedEvidence,
      likelyCause:
        "The historical purchase contains replacement products while generated products are absent.",
      outcome: "Different products present",
      recommendation:
        "Confirm whether the differences were intentional substitutions. Capture approved substitutions as mapping rules; otherwise retain this order as a matcher regression case.",
      summary: candidateSummary(candidate),
    };
  }

  if (difference.missingSkuCount > 0) {
    return {
      bucket: "Ordering-tool issue",
      evidenceIds: sharedEvidence,
      likelyCause: "One or more generated products were not found in the actual S&S order.",
      outcome: "Missing from actual order",
      recommendation:
        "Verify whether the missing item was sourced elsewhere or whether the tool selected the wrong product.",
      summary: candidateSummary(candidate),
    };
  }

  return {
    bucket: "S&S purchasing-process issue",
    evidenceIds: sharedEvidence,
    likelyCause: "The actual S&S order contains products outside this Printavo basket.",
    outcome: "Extra product in actual order",
    recommendation:
      "Record which Printavo jobs were combined into the supplier order so extra products can be allocated correctly.",
    summary: candidateSummary(candidate),
  };
}

export async function evaluateHistoricalOrder({
  historyError,
  order,
  ssOrders,
  supabase,
}: {
  historyError: string | null;
  order: PrintavoOrderDetails;
  ssOrders: SsPlacedOrder[];
  supabase: SupabaseClient;
}): Promise<HistoricalOrderEvaluation> {
  const readiness = getApparelOrderReadiness(order, {
    replayOrderedLines: true,
  });
  const matchableLines = order.lineItems.filter((lineItem) => {
    const disposition = classifyApparelLineForSourcing(lineItem).disposition;

    return disposition === "sourceable" || disposition === "already_ordered";
  });
  const mappingState = await getApparelVendorMappingState(
    supabase,
    order.orderId,
    matchableLines,
  );
  const suggestions = await getSsLineSuggestions(
    matchableLines,
    mappingState.historicalBySource,
  );
  const lines = order.lineItems.map((lineItem, index) =>
    lineReport(
      order,
      lineItem,
      index,
      lineItem.lineItemId ? suggestions.get(lineItem.lineItemId) : undefined,
    ),
  );
  const resolvedSuggestions = Array.from(suggestions.values()).flatMap(
    (match) => (match.suggestion ? [match.suggestion] : []),
  );
  const historyWindow = historicalReconciliationWindow(order.dueDate);
  const expectedPoNumber = ssPrintavoPoNumber(order.orderNumber);
  const reconciliation =
    resolvedSuggestions.length > 0 && !historyError
      ? reconcileSsBasket({
          expectedPoNumber,
          orders: ordersInsideWindow(ssOrders, historyWindow),
          suggestions: resolvedSuggestions,
        })
      : null;
  const actualCandidates = reconciliation?.candidate
    ? [reconciliation.candidate]
    : (reconciliation?.candidateOptions ?? []);
  const selectedSkus = lines.flatMap((line) => line.selectedSkus);
  const error =
    historyError ??
    (resolvedSuggestions.length === 0
      ? "No generated S&S basket was available to reconcile."
      : null);

  return {
    actualCandidates,
    error,
    expectedPoNumber,
    finding: deterministicFinding({
      error,
      expectedPoNumber,
      lines,
      readiness,
      reconciliation,
    }),
    historyWindow,
    lines,
    order,
    readiness,
    reconciliation,
    selectedSkuCount: new Set(selectedSkus.map((selection) => selection.sku)).size,
    selectedUnitCount: selectedSkus.reduce(
      (total, selection) => total + selection.requestedQty,
      0,
    ),
  };
}

export async function evaluateHistoricalOrderSafely(
  input: Parameters<typeof evaluateHistoricalOrder>[0],
): Promise<HistoricalOrderEvaluation> {
  try {
    return await evaluateHistoricalOrder(input);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown historical replay error.";
    const readiness = getApparelOrderReadiness(input.order, {
      replayOrderedLines: true,
    });
    const lines = input.order.lineItems.map((lineItem, index) =>
      lineReport(input.order, lineItem, index, undefined),
    );
    const expectedPoNumber = ssPrintavoPoNumber(input.order.orderNumber);

    return {
      actualCandidates: [],
      error: message,
      expectedPoNumber,
      finding: {
        bucket: "Insufficient evidence",
        evidenceIds: lines.map((line) => line.evidenceId),
        likelyCause: message,
        outcome: "Tool could not generate a complete basket",
        recommendation:
          "Resolve the failed mapping or supplier lookup, then rerun this order before drawing a product-level conclusion.",
        summary: "This order could not complete the deterministic replay.",
      },
      historyWindow: historicalReconciliationWindow(input.order.dueDate),
      lines,
      order: input.order,
      readiness,
      reconciliation: null,
      selectedSkuCount: 0,
      selectedUnitCount: 0,
    };
  }
}
