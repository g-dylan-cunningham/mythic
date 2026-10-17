import type { SsLineSuggestion } from "@/lib/apparel-ordering/ss-matching";
import type { SsPlacedOrder } from "@/lib/ss/client";

export type SsBasketReconciliationRow = {
  actualQty: number;
  difference: number;
  expectedQty: number;
  sku: string;
  status: "extra" | "match" | "missing" | "quantity_mismatch";
};

export type SsBasketDifferenceSummary = {
  exactSkuCount: number;
  extraSkuCount: number;
  extraUnitQty: number;
  missingSkuCount: number;
  missingUnitQty: number;
  quantityMismatchSkuCount: number;
  quantityOverageQty: number;
  quantityShortageQty: number;
};

export type SsBasketActualLine = {
  brandName: string;
  colorName: string;
  quantity: number;
  sizeName: string;
  sku: string;
  styleName: string;
  title: string;
};

export type SsBasketReconciliationCandidate = {
  actualLines: SsBasketActualLine[];
  actualSkuCount: number;
  actualTotalQty: number;
  differenceSummary: SsBasketDifferenceSummary;
  discrepancyCount: number;
  expectedCoverage: number;
  expectedSkuCount: number;
  expectedTotalQty: number;
  guidCount: number;
  invoiceDate: string | null;
  invoiceNumbers: string[];
  matchedQty: number;
  matchedSkuCount: number;
  orderNumber: string;
  orderDate: string | null;
  orderStatuses: string[];
  poNumber: string;
  rows: SsBasketReconciliationRow[];
  supplierCoverage: number;
  warehouses: string[];
  warehouseCount: number;
};

export type SsBasketReconciliation = {
  actualTotalQty: number;
  ambiguous: boolean;
  ambiguityReason:
    | "multiple_purchase_order_matches"
    | "tied_sku_overlap"
    | null;
  candidate: SsBasketReconciliationCandidate | null;
  candidateOptions: SsBasketReconciliationCandidate[];
  discrepancyCount: number;
  expectedCoverage: number;
  expectedTotalQty: number;
  matchMethod: "purchase_order" | "sku_overlap" | null;
  rows: SsBasketReconciliationRow[];
};

type OrderGroup = {
  actualBySku: Map<string, number>;
  actualLineBySku: Map<string, Omit<SsBasketActualLine, "quantity">>;
  guidCount: number;
  invoiceDate: string | null;
  invoiceNumbers: string[];
  orderNumber: string;
  orderDate: string | null;
  orderStatuses: string[];
  poNumber: string;
  warehouses: string[];
  warehouseCount: number;
};

function positiveQuantity(value: number | string | null | undefined) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function addQuantity(map: Map<string, number>, sku: string, quantity: number) {
  map.set(sku, (map.get(sku) ?? 0) + quantity);
}

function optionalText(value: string | null | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function earliestDate(values: Set<string>) {
  const dated = Array.from(values)
    .map((value) => ({ time: Date.parse(value), value }))
    .filter(({ time }) => Number.isFinite(time))
    .sort((a, b) => a.time - b.time);

  return dated[0]?.value ?? null;
}

function expectedQuantities(suggestions: SsLineSuggestion[]) {
  const expected = new Map<string, number>();

  for (const suggestion of suggestions) {
    for (const variant of suggestion.variants) {
      const sku = variant.sku.trim();
      const quantity = positiveQuantity(variant.requestedQty);

      if (sku && quantity > 0) {
        addQuantity(expected, sku, quantity);
      }
    }
  }

  return expected;
}

function groupOrders(orders: SsPlacedOrder[]) {
  const groups = new Map<
    string,
    Omit<
      OrderGroup,
      | "guidCount"
      | "invoiceDate"
      | "invoiceNumbers"
      | "orderDate"
      | "orderStatuses"
      | "warehouses"
      | "warehouseCount"
    > & {
      guids: Set<string>;
      invoiceDates: Set<string>;
      invoiceNumbers: Set<string>;
      orderDates: Set<string>;
      orderStatuses: Set<string>;
      warehouses: Set<string>;
    }
  >();

  for (const order of orders) {
    const orderNumber = order.orderNumber.trim();
    const poNumber = order.poNumber.trim();
    const key = `${orderNumber.toLowerCase()}::${poNumber.toLowerCase()}`;
    const group = groups.get(key) ?? {
      actualBySku: new Map<string, number>(),
      actualLineBySku: new Map<
        string,
        Omit<SsBasketActualLine, "quantity">
      >(),
      guids: new Set<string>(),
      invoiceDates: new Set<string>(),
      invoiceNumbers: new Set<string>(),
      orderNumber,
      orderDates: new Set<string>(),
      orderStatuses: new Set<string>(),
      poNumber,
      warehouses: new Set<string>(),
    };

    group.guids.add(order.guid);
    if (order.invoiceDate?.trim()) {
      group.invoiceDates.add(order.invoiceDate.trim());
    }
    if (order.invoiceNumber?.trim()) {
      group.invoiceNumbers.add(order.invoiceNumber.trim());
    }
    if (order.orderDate?.trim()) {
      group.orderDates.add(order.orderDate.trim());
    }
    if (order.orderStatus?.trim()) {
      group.orderStatuses.add(order.orderStatus.trim());
    }
    if (order.warehouseAbbr?.trim()) {
      group.warehouses.add(order.warehouseAbbr.trim());
    }

    for (const line of Array.isArray(order.lines) ? order.lines : []) {
      const sku = line.sku?.trim() ?? "";
      const quantity = positiveQuantity(line.qtyOrdered);

      if (sku && quantity > 0) {
        addQuantity(group.actualBySku, sku, quantity);
        if (!group.actualLineBySku.has(sku)) {
          group.actualLineBySku.set(sku, {
            brandName: optionalText(line.brandName),
            colorName: optionalText(line.colorName),
            sizeName: optionalText(line.sizeName),
            sku,
            styleName: optionalText(line.styleName),
            title: optionalText(line.title),
          });
        }
      }
    }

    groups.set(key, group);
  }

  return Array.from(groups.values()).map((group) => ({
    actualBySku: group.actualBySku,
    actualLineBySku: group.actualLineBySku,
    guidCount: group.guids.size,
    invoiceDate: earliestDate(group.invoiceDates),
    invoiceNumbers: Array.from(group.invoiceNumbers).sort(),
    orderNumber: group.orderNumber,
    orderDate: earliestDate(group.orderDates),
    orderStatuses: Array.from(group.orderStatuses).sort(),
    poNumber: group.poNumber,
    warehouses: Array.from(group.warehouses).sort(),
    warehouseCount: group.warehouses.size,
  }));
}

function overlapQuantity(
  expected: Map<string, number>,
  actual: Map<string, number>,
) {
  let overlap = 0;

  for (const [sku, quantity] of expected) {
    overlap += Math.min(quantity, actual.get(sku) ?? 0);
  }

  return overlap;
}

function totalQuantity(quantities: Map<string, number>) {
  return Array.from(quantities.values()).reduce(
    (total, quantity) => total + quantity,
    0,
  );
}

function comparisonRows(
  expected: Map<string, number>,
  actual: Map<string, number>,
) {
  const skus = Array.from(new Set([...expected.keys(), ...actual.keys()])).sort();

  return skus.map((sku): SsBasketReconciliationRow => {
    const expectedQty = expected.get(sku) ?? 0;
    const actualQty = actual.get(sku) ?? 0;
    const difference = actualQty - expectedQty;
    const status =
      expectedQty === actualQty
        ? "match"
        : expectedQty === 0
          ? "extra"
          : actualQty === 0
            ? "missing"
            : "quantity_mismatch";

    return { actualQty, difference, expectedQty, sku, status };
  });
}

function differenceSummary(
  rows: SsBasketReconciliationRow[],
): SsBasketDifferenceSummary {
  return rows.reduce<SsBasketDifferenceSummary>(
    (summary, row) => {
      switch (row.status) {
        case "match":
          summary.exactSkuCount += 1;
          break;
        case "extra":
          summary.extraSkuCount += 1;
          summary.extraUnitQty += row.actualQty;
          break;
        case "missing":
          summary.missingSkuCount += 1;
          summary.missingUnitQty += row.expectedQty;
          break;
        case "quantity_mismatch":
          summary.quantityMismatchSkuCount += 1;
          if (row.difference > 0) {
            summary.quantityOverageQty += row.difference;
          } else {
            summary.quantityShortageQty += Math.abs(row.difference);
          }
          break;
      }

      return summary;
    },
    {
      exactSkuCount: 0,
      extraSkuCount: 0,
      extraUnitQty: 0,
      missingSkuCount: 0,
      missingUnitQty: 0,
      quantityMismatchSkuCount: 0,
      quantityOverageQty: 0,
      quantityShortageQty: 0,
    },
  );
}

function candidateSummary(
  expected: Map<string, number>,
  expectedTotalQty: number,
  group: OrderGroup,
): SsBasketReconciliationCandidate {
  const actualTotalQty = totalQuantity(group.actualBySku);
  const matchedQty = overlapQuantity(expected, group.actualBySku);
  const rows = comparisonRows(expected, group.actualBySku);
  const differences = differenceSummary(rows);

  return {
    actualLines: Array.from(group.actualBySku.entries())
      .map(([sku, quantity]) => ({
        ...(group.actualLineBySku.get(sku) ?? {
          brandName: "",
          colorName: "",
          sizeName: "",
          sku,
          styleName: "",
          title: "",
        }),
        quantity,
      }))
      .sort((a, b) => a.sku.localeCompare(b.sku)),
    actualSkuCount: group.actualBySku.size,
    actualTotalQty,
    differenceSummary: differences,
    discrepancyCount: rows.filter((row) => row.status !== "match").length,
    expectedCoverage: expectedTotalQty > 0 ? matchedQty / expectedTotalQty : 0,
    expectedSkuCount: expected.size,
    expectedTotalQty,
    guidCount: group.guidCount,
    invoiceDate: group.invoiceDate,
    invoiceNumbers: group.invoiceNumbers,
    matchedQty,
    matchedSkuCount: Array.from(expected.keys()).filter(
      (sku) => (group.actualBySku.get(sku) ?? 0) > 0,
    ).length,
    orderNumber: group.orderNumber,
    orderDate: group.orderDate,
    orderStatuses: group.orderStatuses,
    poNumber: group.poNumber,
    rows,
    supplierCoverage: actualTotalQty > 0 ? matchedQty / actualTotalQty : 0,
    warehouses: group.warehouses,
    warehouseCount: group.warehouseCount,
  };
}

export function reconcileSsBasket({
  expectedPoNumber,
  orders,
  suggestions,
}: {
  expectedPoNumber: string;
  orders: SsPlacedOrder[];
  suggestions: SsLineSuggestion[];
}): SsBasketReconciliation {
  const expected = expectedQuantities(suggestions);
  const expectedTotalQty = totalQuantity(expected);
  const groups = groupOrders(orders);
  const poMatches = groups.filter(
    (group) =>
      group.poNumber.toLowerCase() === expectedPoNumber.trim().toLowerCase(),
  );
  const ranked = groups
    .map((group) => ({
      group,
      overlap: overlapQuantity(expected, group.actualBySku),
    }))
    .sort(
      (a, b) =>
        b.overlap - a.overlap ||
        totalQuantity(a.group.actualBySku) -
          totalQuantity(b.group.actualBySku),
    );
  const bestOverlap = ranked[0]?.overlap ?? 0;
  const overlapMatches = ranked.filter(
    (candidate) => candidate.overlap === bestOverlap && bestOverlap > 0,
  );
  const selected =
    poMatches.length === 1
      ? poMatches[0]
      : poMatches.length === 0 && overlapMatches.length === 1
        ? overlapMatches[0]?.group ?? null
        : null;
  const ambiguityReason =
    poMatches.length > 1
      ? "multiple_purchase_order_matches"
      : poMatches.length === 0 && overlapMatches.length > 1
        ? "tied_sku_overlap"
        : null;
  const ambiguousGroups =
    ambiguityReason === "multiple_purchase_order_matches"
      ? poMatches
      : ambiguityReason === "tied_sku_overlap"
        ? overlapMatches.map(({ group }) => group)
        : [];
  const rows = selected
    ? comparisonRows(expected, selected.actualBySku)
    : comparisonRows(expected, new Map());
  const actualTotalQty = selected ? totalQuantity(selected.actualBySku) : 0;
  const selectedOverlap = selected
    ? overlapQuantity(expected, selected.actualBySku)
    : 0;
  const selectedSummary = selected
    ? candidateSummary(expected, expectedTotalQty, selected)
    : null;

  return {
    actualTotalQty,
    ambiguous: ambiguityReason !== null,
    ambiguityReason,
    candidate: selectedSummary,
    candidateOptions: ambiguousGroups.map((group) =>
      candidateSummary(expected, expectedTotalQty, group),
    ),
    discrepancyCount: rows.filter((row) => row.status !== "match").length,
    expectedCoverage:
      expectedTotalQty > 0 ? selectedOverlap / expectedTotalQty : 0,
    expectedTotalQty,
    matchMethod:
      selected && poMatches.length === 1
        ? "purchase_order"
        : selected
          ? "sku_overlap"
          : null,
    rows,
  };
}
