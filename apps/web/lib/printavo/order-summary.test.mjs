import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyApparelLineForSourcing,
  getApparelOrderReadiness,
  summarizePrintavoLineItem,
} from "./order-summary.ts";

function apparelOrder(overrides = {}) {
  return {
    approved: false,
    customerName: "Example Customer",
    dueDate: "2026-09-30",
    fetchedAt: "2026-09-15T12:00:00.000Z",
    lineItems: [
      {
        category: "Printed Apparel",
        color: "Black",
        description: "Unisex Tee",
        goodsStatus: "need_ordering",
        lineItemId: 42,
        quantity: 3,
        sizes: [{ label: "M", quantity: 3 }],
        styleNumber: "5001",
        unitCost: 4.25,
      },
    ],
    nickname: "Example Order",
    orderId: 123,
    orderNumber: "1001",
    paid: false,
    statusName: "Schedule & Order Garments",
    total: 12.75,
    updatedAt: "2026-09-15T11:00:00.000Z",
    ...overrides,
  };
}

test("normalizes a Printavo apparel line and its size quantities", () => {
  assert.deepEqual(
    summarizePrintavoLineItem({
      category: { name: "T-Shirts" },
      color: " Black ",
      goods_status: "need_ordering",
      id: 42,
      size_l: 3,
      size_m: "2",
      size_s: null,
      style_description: " Staple Tee ",
      style_number: " 5001 ",
      total_quantities: 5,
      unit_cost: "4.25",
    }),
    {
      category: "T-Shirts",
      color: "Black",
      description: "Staple Tee",
      goodsStatus: "need_ordering",
      lineItemId: 42,
      quantity: 5,
      sizes: [
        { label: "M", quantity: 2 },
        { label: "L", quantity: 3 },
      ],
      styleNumber: "5001",
      unitCost: 4.25,
    },
  );
});

test("derives total quantity when Printavo omits the total", () => {
  const line = summarizePrintavoLineItem({
    size_2xl: 2,
    size_xl: 1,
  });

  assert.equal(line.quantity, 3);
  assert.deepEqual(line.sizes, [
    { label: "XL", quantity: 1 },
    { label: "2XL", quantity: 2 },
  ]);
});

test("allows a non-quote apparel order with sourceable line details", () => {
  assert.deepEqual(getApparelOrderReadiness(apparelOrder()), {
    eligible: true,
    reasons: [],
    relevantLineCount: 1,
    sourceableLineCount: 1,
  });
});

test("treats a zero-quantity quote choice as informational", () => {
  const order = apparelOrder({
    statusName: "Quote Approval Reminder 2",
    lineItems: [
      {
        category: "Printed Apparel",
        color: null,
        description: "Tee 25 @ $14.18 50 @ $11.88",
        goodsStatus: null,
        lineItemId: 43,
        quantity: 0,
        sizes: [],
        styleNumber: "1717",
        unitCost: 0,
      },
    ],
  });
  const result = getApparelOrderReadiness(order);

  assert.equal(result.eligible, false);
  assert.equal(result.relevantLineCount, 1);
  assert.equal(result.sourceableLineCount, 0);
  assert.ok(result.reasons.some((reason) => reason.includes("quote stage")));
  assert.ok(
    result.reasons.some((reason) =>
      reason.includes("No apparel lines currently require"),
    ),
  );
  assert.ok(!result.reasons.some((reason) => reason.includes("valid quantity")));
  assert.ok(!result.reasons.some((reason) => reason.includes("color")));
});

test("blocks a non-quote apparel order when required details are missing", () => {
  const [lineItem] = apparelOrder().lineItems;
  const result = getApparelOrderReadiness(
    apparelOrder({ lineItems: [{ ...lineItem, color: null }] }),
  );

  assert.equal(result.eligible, false);
  assert.ok(result.reasons.some((reason) => reason.includes("color")));
});

test("blocks an order whose apparel lines are already ordered", () => {
  const [lineItem] = apparelOrder().lineItems;
  const result = getApparelOrderReadiness(
    apparelOrder({ lineItems: [{ ...lineItem, goodsStatus: "ordered" }] }),
  );

  assert.equal(result.eligible, false);
  assert.ok(result.reasons.some((reason) => reason.includes("already marked")));
  assert.equal(result.sourceableLineCount, 0);
});

test("ignores an explicit do-not-order DTF add-on", () => {
  const [garment] = apparelOrder().lineItems;
  const addOn = {
    category: "DTF",
    color: null,
    description:
      "DO NOT ORDER - these are counted in the above quantities. Left chest add-ons.",
    goodsStatus: null,
    lineItemId: 43,
    quantity: 2,
    sizes: [{ label: "M", quantity: 2 }],
    styleNumber: null,
    unitCost: 5,
  };
  const result = getApparelOrderReadiness(
    apparelOrder({ lineItems: [garment, addOn] }),
  );

  assert.deepEqual(classifyApparelLineForSourcing(addOn), {
    disposition: "decoration_only",
    reason: "Marked as a do-not-order decoration or add-on line in Printavo.",
  });
  assert.equal(result.eligible, true);
  assert.equal(result.relevantLineCount, 2);
  assert.equal(result.sourceableLineCount, 1);
  assert.deepEqual(result.reasons, []);
});

test("matches only the garment that still needs ordering", () => {
  const [garment] = apparelOrder().lineItems;
  const orderedLine = {
    ...garment,
    goodsStatus: "ordered",
    lineItemId: 43,
  };
  const result = getApparelOrderReadiness(
    apparelOrder({ lineItems: [orderedLine, garment] }),
  );

  assert.equal(result.eligible, true);
  assert.equal(result.relevantLineCount, 2);
  assert.equal(result.sourceableLineCount, 1);
});

test("reports already ordered when only ordered and informational lines remain", () => {
  const [garment] = apparelOrder().lineItems;
  const orderedLine = { ...garment, goodsStatus: "ordered" };
  const informationalLine = {
    ...garment,
    description: "Presale pricing information",
    goodsStatus: null,
    lineItemId: 43,
    quantity: 0,
    sizes: [],
  };
  const result = getApparelOrderReadiness(
    apparelOrder({ lineItems: [orderedLine, informationalLine] }),
  );

  assert.equal(result.eligible, false);
  assert.equal(result.sourceableLineCount, 0);
  assert.deepEqual(result.reasons, [
    "All sourceable apparel lines are already marked ordered in Printavo.",
  ]);
});
