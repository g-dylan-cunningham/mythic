import assert from "node:assert/strict";
import test from "node:test";
import {
  mappingKey,
  normalizeSupplierSize,
  selectSupplierColor,
  selectSupplierCrossReferences,
  selectSupplierStyleCandidate,
  selectSupplierVariant,
} from "./matching-logic.ts";

const lat = {
  brandName: "LAT",
  partNumber: "00638",
  styleID: "2564",
  styleName: "6901",
  title: "Unisex Fine Jersey Tee",
};

const augusta = {
  brandName: "Augusta Sportswear",
  partNumber: "24934",
  styleID: "11558",
  styleName: "6901",
  title: "Women's Eco Revive Full-Zip Hooded Sweatshirt",
};

test("selects an unambiguous exact supplier style", () => {
  assert.deepEqual(
    selectSupplierStyleCandidate({
      candidates: [lat],
      description: "LAT Unisex Fine Jersey Tee",
      styleNumber: "6901",
    }),
    lat,
  );
});

test("uses the Printavo description to resolve duplicate style numbers", () => {
  assert.deepEqual(
    selectSupplierStyleCandidate({
      candidates: [augusta, lat],
      description: "LAT\rUnisex Fine Jersey Tee - 6901",
      styleNumber: "6901",
    }),
    lat,
  );
});

test("leaves an ambiguous style unresolved without a brand signal", () => {
  assert.equal(
    selectSupplierStyleCandidate({
      candidates: [augusta, lat],
      description: "Unisex apparel",
      styleNumber: "6901",
    }),
    null,
  );
});

test("matches exact and uniquely compatible supplier colors", () => {
  assert.equal(
    selectSupplierColor("Dark Chocolate", ["Black", "Dark Chocolate"]),
    "Dark Chocolate",
  );
  assert.equal(
    selectSupplierColor("Chocolate", ["Black", "Dark Chocolate"]),
    "Dark Chocolate",
  );
  assert.equal(selectSupplierColor("Blue", ["Blue Storm", "Blue Jean"]), null);
});

test("normalizes common size aliases and selects one exact SKU", () => {
  assert.equal(normalizeSupplierSize("XXL"), "2xl");
  assert.equal(normalizeSupplierSize("2X-Large"), "2xl");
  assert.deepEqual(
    selectSupplierVariant("2XL", "Black", [
      {
        colorName: "Black",
        customerPrice: 8,
        sizeName: "2X-Large",
        sku: "B123",
        totalQty: 40,
      },
    ]),
    {
      colorName: "Black",
      customerPrice: 8,
      sizeName: "2X-Large",
      sku: "B123",
      totalQty: 40,
    },
  );
});

test("builds stable mapping keys across punctuation and case", () => {
  assert.equal(mappingKey("202LS", "Vintage White"), "202ls::vintagewhite");
});

test("uses S&S CrossRef only when every requested size maps unambiguously", () => {
  const crossReferences = [
    {
      brandName: "Gildan",
      colorName: "Black",
      sizeName: "M",
      sku: "B001",
      styleName: "18000",
      yourSku: "MYTHIC-18000-BLK-M",
    },
    {
      brandName: "Gildan",
      colorName: "Black",
      sizeName: "L",
      sku: "B002",
      styleName: "18000",
      yourSku: "MYTHIC-18000-BLK-L",
    },
  ];

  assert.deepEqual(
    selectSupplierCrossReferences({
      color: "Black",
      crossReferences,
      sizes: ["M", "L"],
      styleNumber: "18000",
    }),
    crossReferences,
  );
  assert.equal(
    selectSupplierCrossReferences({
      color: "Black",
      crossReferences,
      sizes: ["M", "XL"],
      styleNumber: "18000",
    }),
    null,
  );
});
