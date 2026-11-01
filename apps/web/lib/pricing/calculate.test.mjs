import assert from "node:assert/strict";
import test from "node:test";
import fixtures from "./calculation-fixtures.json" with { type: "json" };
import { calculate, defaults, finishingPrice } from "./calculate.ts";
import { parseSnapshots, quoteHtml, snapshot } from "./quote.ts";

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
for (const fixture of fixtures) {
  test(`imported pricing fixture: ${fixture.name}`, () => {
    const service = fixture.file === "print-calculator.tsx" ? "print" : fixture.file === "embroidery-calculator.tsx" ? "embroidery" : "dtg-dtf";
    const input = { ...defaults(service), ...fixture.input };
    if (service === "print") {
      input.colors = [fixture.input.effectiveColors, 0, 0];
      input.specialtyInks = fixture.input.specialtyInkTotal / 40;
    }
    const actual = calculate(input);
    if (fixture.result.lowTotal === undefined) { assert.equal(actual.valid, false); return; }
    assert.equal(actual.valid, true);
    for (const field of ["lowUnit", "highUnit", "lowTotal", "highTotal"]) near(actual[field], fixture.result[field]);
    assert.equal(actual.tier, (fixture.result.tier || fixture.result.quantityTier).label);
    const finishing = finishingPrice(input.quantity, input.finishing);
    for (const field of ["serviceRate", "insideTagRate", "perItem", "total"]) near(finishing[field], fixture.result.finishingPricing[field]);
    assert.equal(finishing.needsReview, fixture.result.finishingPricing.needsReview);
  });
}

test("screen prices stay constant within each tier and change at tier boundaries", () => {
  const input = defaults("print");
  for (const [min, max] of [[12,24],[25,49],[50,74],[75,99],[100,149],[150,249],[250,499],[500,999],[1000,2500]]) {
    const first = calculate({ ...input, quantity: min });
    near(first.baseUnit, calculate({ ...input, quantity: max }).baseUnit);
    if (min > 12) assert.notEqual(first.tier, calculate({ ...input, quantity: min - 1 }).tier);
  }
  assert.equal(calculate({ ...input, quantity: 2501 }).valid, false);
});
test("screen turnover colors, markup thresholds and separate rush-free specialty fees", () => {
  const input = defaults("print");
  near(calculate({ ...input, colors: [1,1,1] }).baseUnit, calculate({ ...input, colors: [5,0,0] }).baseUnit);
  assert.equal(calculate({ ...input, colors: [1,0,1] }).valid, false);
  near(calculate({ ...input, garmentCost: 12 }).baseUnit, 12 * 1.8 + 3 * .85 + .9);
  near(calculate({ ...input, garmentCost: 20 }).baseUnit, 20 * 1.5 + 3 * 1.25 + .9);
  near(calculate({ ...input, garmentCost: 20.01 }).baseUnit, 20.01 * 1.45 + 3 * 1.25 + .9);
  const base = calculate({ ...input, rush: "under-72" });
  const specialty = calculate({ ...input, rush: "under-72", specialtyInks: 2 });
  near(specialty.lowTotal - base.lowTotal, 80); near(specialty.highTotal - base.highTotal, 80);
});
test("embroidery modes, garment bands, 200+ basis, digitizing and minimum", () => {
  const input = defaults("embroidery");
  near(calculate({ ...input, mode: "walk-in" }).baseUnit, 15);
  near(calculate({ ...input, mode: "recurring" }).baseUnit, 10);
  for (const [cost, markup] of [[3,2.5],[3.01,2],[8,2],[8.01,1.6],[40,1.6],[40.01,1.4]]) near(calculate({ ...input, garmentCost: cost }).baseUnit, cost * markup + 5);
  near(calculate({ ...input, quantity: 200 }).baseUnit, 10 * 1.6 + 4);
  assert.equal(calculate({ ...input, quantity: 49 }).projectFees, 25);
  assert.equal(calculate({ ...input, quantity: 50 }).projectFees, 0);
  const minimum = calculate({ ...input, quantity: 1, garmentCost: 0, rush: "7-10" });
  near(minimum.lowTotal, 55); near(minimum.lowUnit, 13.2);
  near(calculate({ ...input, stitches: 30000, puff: true, hatLocations: 1, hemTags: true, stitchOuts: 1, colorChanges: 2 }).baseUnit, 16.8 + 7 + 5 + 3 + 3.25 + 2);
});
test("DTF hats, DTG preparation, rush ranges and review paths", () => {
  const input = defaults("dtg-dtf");
  near(calculate({ ...input, firstLocation: "hat" }).baseUnit, 8.1 + 4);
  assert.equal(calculate({ ...input, method: "dtg", firstLocation: "hat" }).valid, false);
  near(calculate({ ...input, method: "dtg", garmentPreparation: "pretreated" }).baseUnit, 16.1);
  const ranged = calculate({ ...input, rush: "3-5" });
  near(ranged.lowTotal, 780 * 1.15); near(ranged.highTotal, 780 * 1.2);
  assert.equal(calculate({ ...input, quantity: 11 }).review, true);
  assert.equal(calculate({ ...input, quantity: 12 }).review, false);
  assert.equal(calculate({ ...input, rush: "same-day" }).review, true);
  assert.equal(calculate({ ...input, quantity: 2.5 }).valid, false);
  assert.equal(calculate({ ...input, garmentCost: NaN }).valid, false);
  const review = calculate({ ...input, quantity: 24, rush: "under-72", finishing: { service: "fold", steamingRate: 0, insideTags: false } });
  near(review.provisionalTotal, 410.4);
  assert.equal(snapshot(review, input.service, "Review", "Tee", 24).total, "$410.40+ (provisional)");
});
test("finishing boundaries and steaming while review matrix charges are zero", () => {
  const finishing = { service: "fold", insideTags: true, steamingRate: 1.25 };
  for (const [q, expected] of [[24,1.25],[25,4.75],[99,4.75],[100,4.2],[249,4.2],[250,3.9],[499,3.9],[500,3.6]]) near(finishingPrice(q, finishing).perItem, expected);
  assert.equal(finishingPrice(24, finishing).needsReview, true);
  near(calculate({ ...defaults("embroidery"), finishing: { service: "none", insideTags: true, steamingRate: 0 } }).baseUnit, 21.8);
});
test("saved quotes preserve approval and ranges; exports escape all user text", () => {
  const input = defaults("dtg-dtf");
  const quote = snapshot(calculate({ ...input, rush: "same-day" }), input.service, '<script>alert("x")</script>', "Tee", 50);
  assert.equal(quote.unitPrice, "Approval required"); assert.match(quote.total, /provisional/);
  const html = quoteHtml([quote]); assert.ok(!html.includes("<script>")); assert.ok(html.includes("&lt;script&gt;"));
  const ranged = snapshot(calculate({ ...input, rush: "3-5" }), input.service, "Range", "Tee", 50);
  assert.match(ranged.unitPrice, /–/);
  assert.equal(parseSnapshots(JSON.stringify([quote,ranged,quote,ranged]), input.service).length, 3);
  assert.deepEqual(parseSnapshots("invalid", input.service), []);
  assert.deepEqual(parseSnapshots(JSON.stringify([quote]), "print"), []);
  assert.deepEqual(parseSnapshots('[{"service":"dtg-dtf","facts":null}]', input.service), []);
});
