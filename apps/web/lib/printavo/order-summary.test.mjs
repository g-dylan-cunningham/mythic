import assert from "node:assert/strict";
import test from "node:test";
import { summarizePrintavoLineItem } from "./order-summary.ts";

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
