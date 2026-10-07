import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSsPrintavoOrderRequest,
  ssPrintavoPoNumber,
} from "./order-request.ts";

test("formats the Printavo visual order number as the S&S PO", () => {
  assert.equal(ssPrintavoPoNumber(19332), "PA-19332");
  assert.equal(ssPrintavoPoNumber(" 0019332 "), "PA-0019332");
});

test("rejects invalid Printavo visual order numbers", () => {
  assert.throws(() => ssPrintavoPoNumber("PA-19332"), /positive numeric/);
  assert.throws(() => ssPrintavoPoNumber(0), /positive numeric/);
});

test("builds a guarded S&S request with the canonical PO", () => {
  assert.deepEqual(
    buildSsPrintavoOrderRequest({
      autoselectWarehouseWarehouses: ["tx", " ga "],
      lines: [{ identifier: " B00760003 ", qty: 2 }],
      printavoOrderNumber: "19332",
      shippingAddress: {
        address: "123 Main St",
        city: "Phoenix",
        customer: "Mythic",
        state: "AZ",
        zip: "85001",
      },
    }),
    {
      autoselectWarehouse: true,
      autoselectWarehouse_Warehouses: "TX,GA",
      emailConfirmation: "",
      lines: [{ identifier: "B00760003", qty: 2 }],
      poNumber: "PA-19332",
      rejectLineErrors: true,
      shipBlind: false,
      shippingAddress: {
        address: "123 Main St",
        attn: "",
        city: "Phoenix",
        customer: "Mythic",
        residential: false,
        state: "AZ",
        zip: "85001",
      },
      shippingMethod: "1",
      testOrder: false,
    },
  );
});

test("keeps explicit warehouses only when auto-selection is disabled", () => {
  const request = buildSsPrintavoOrderRequest({
    autoselectWarehouse: false,
    lines: [{ identifier: "B00760003", qty: 2, warehouseAbbr: "tx" }],
    printavoOrderNumber: 19332,
    shippingAddress: {
      address: "123 Main St",
      city: "Phoenix",
      state: "AZ",
      zip: "85001",
    },
  });

  assert.deepEqual(request.lines, [
    { identifier: "B00760003", qty: 2, warehouseAbbr: "TX" },
  ]);
});

test("rejects empty orders and invalid line quantities", () => {
  const address = {
    address: "123 Main St",
    city: "Phoenix",
    state: "AZ",
    zip: "85001",
  };

  assert.throws(
    () =>
      buildSsPrintavoOrderRequest({
        lines: [],
        printavoOrderNumber: 19332,
        shippingAddress: address,
      }),
    /At least one/,
  );
  assert.throws(
    () =>
      buildSsPrintavoOrderRequest({
        lines: [{ identifier: "B00760003", qty: 0 }],
        printavoOrderNumber: 19332,
        shippingAddress: address,
      }),
    /positive quantity/,
  );
});
