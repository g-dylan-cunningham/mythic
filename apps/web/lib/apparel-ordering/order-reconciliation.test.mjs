import assert from "node:assert/strict";
import test from "node:test";
import { reconcileSsBasket } from "./order-reconciliation.ts";

const suggestion = {
  hasSufficientInventory: true,
  matchSource: "historical_reconciliation",
  supplierBrandName: "Comfort Colors",
  supplierColor: "Khaki",
  supplierPartNumber: "1717",
  supplierStyleId: "1",
  supplierStyleName: "1717",
  supplierTitle: "Garment-Dyed Heavyweight T-Shirt",
  variants: [
    {
      availableQty: 100,
      customerPrice: 5,
      requestedQty: 8,
      sku: "B1717S",
      sourceSize: "S",
      supplierSize: "S",
    },
    {
      availableQty: 100,
      customerPrice: 5,
      requestedQty: 10,
      sku: "B1717M",
      sourceSize: "M",
      supplierSize: "M",
    },
  ],
};

function order({
  lines,
  orderNumber = "76543210",
  poNumber = "Legacy PO",
}) {
  return {
    guid: `${orderNumber}-guid`,
    invoiceNumber: "123",
    lines,
    orderNumber,
    orderStatus: "Invoiced",
    poNumber,
    total: 100,
    warehouseAbbr: "TX",
  };
}

test("prefers the canonical Printavo PO and reports quantity discrepancies", () => {
  const result = reconcileSsBasket({
    expectedPoNumber: "PA-19205",
    orders: [
      order({
        lines: [
          { qtyOrdered: 8, sku: "B1717S" },
          { qtyOrdered: 12, sku: "B1717M" },
          { qtyOrdered: 1, sku: "EXTRA" },
        ],
        poNumber: "PA-19205",
      }),
    ],
    suggestions: [suggestion],
  });

  assert.equal(result.matchMethod, "purchase_order");
  assert.equal(result.candidate?.poNumber, "PA-19205");
  assert.equal(result.expectedTotalQty, 18);
  assert.equal(result.actualTotalQty, 21);
  assert.deepEqual(result.candidate?.differenceSummary, {
    exactSkuCount: 1,
    extraSkuCount: 1,
    extraUnitQty: 1,
    missingSkuCount: 0,
    missingUnitQty: 0,
    quantityMismatchSkuCount: 1,
    quantityOverageQty: 2,
    quantityShortageQty: 0,
  });
  assert.deepEqual(
    result.rows.map(({ difference, sku, status }) => ({
      difference,
      sku,
      status,
    })),
    [
      { difference: 2, sku: "B1717M", status: "quantity_mismatch" },
      { difference: 0, sku: "B1717S", status: "match" },
      { difference: 1, sku: "EXTRA", status: "extra" },
    ],
  );
});

test("finds one historical order by exact SKU overlap when the PO is legacy", () => {
  const result = reconcileSsBasket({
    expectedPoNumber: "PA-19205",
    orders: [
      order({ lines: [{ qtyOrdered: 18, sku: "OTHER" }] }),
      order({
        lines: [
          { qtyOrdered: 8, sku: "B1717S" },
          { qtyOrdered: 10, sku: "B1717M" },
        ],
        orderNumber: "76543211",
      }),
    ],
    suggestions: [suggestion],
  });

  assert.equal(result.matchMethod, "sku_overlap");
  assert.equal(result.candidate?.orderNumber, "76543211");
  assert.equal(result.expectedCoverage, 1);
  assert.equal(result.discrepancyCount, 0);
});

test("does not guess when multiple historical orders have the same overlap", () => {
  const result = reconcileSsBasket({
    expectedPoNumber: "PA-19205",
    orders: [
      order({ lines: [{ qtyOrdered: 8, sku: "B1717S" }] }),
      order({
        lines: [{ qtyOrdered: 8, sku: "B1717S" }],
        orderNumber: "76543211",
      }),
    ],
    suggestions: [suggestion],
  });

  assert.equal(result.ambiguous, true);
  assert.equal(result.ambiguityReason, "tied_sku_overlap");
  assert.equal(result.candidate, null);
  assert.equal(result.matchMethod, null);
  assert.deepEqual(
    result.candidateOptions.map(
      ({
        actualTotalQty,
        expectedCoverage,
        matchedQty,
        matchedSkuCount,
        orderNumber,
        supplierCoverage,
      }) => ({
        actualTotalQty,
        expectedCoverage,
        matchedQty,
        matchedSkuCount,
        orderNumber,
        supplierCoverage,
      }),
    ),
    [
      {
        actualTotalQty: 8,
        expectedCoverage: 8 / 18,
        matchedQty: 8,
        matchedSkuCount: 1,
        orderNumber: "76543210",
        supplierCoverage: 1,
      },
      {
        actualTotalQty: 8,
        expectedCoverage: 8 / 18,
        matchedQty: 8,
        matchedSkuCount: 1,
        orderNumber: "76543211",
        supplierCoverage: 1,
      },
    ],
  );
});

test("explains ambiguity when the canonical PO appears on multiple orders", () => {
  const result = reconcileSsBasket({
    expectedPoNumber: "PA-19205",
    orders: [
      order({
        lines: [{ qtyOrdered: 8, sku: "B1717S" }],
        poNumber: "PA-19205",
      }),
      order({
        lines: [{ qtyOrdered: 10, sku: "B1717M" }],
        orderNumber: "76543211",
        poNumber: "PA-19205",
      }),
    ],
    suggestions: [suggestion],
  });

  assert.equal(result.ambiguous, true);
  assert.equal(result.ambiguityReason, "multiple_purchase_order_matches");
  assert.equal(result.candidateOptions.length, 2);
});
