import tables from "./pricing-tables.json" with { type: "json" };

export type Service = "print" | "embroidery" | "dtg-dtf";
export type Finishing = { service: keyof typeof tables["finishing-options.tsx"]["SERVICES"]; steamingRate: number; insideTags: boolean };
export type PricingInput = {
  service: Service; quantity: number; garmentCost: number; colors: [number, number, number];
  specialtyInks: number; rush: string; finishing: Finishing;
  mode: "supplied" | "walk-in" | "recurring"; stitches: number; newDesign: boolean;
  puff: boolean; hatLocations: number; hemTags: boolean; stitchOuts: number;
  colorChanges: number; winterSurcharge: number; method: "dtg" | "dtf";
  garmentPreparation: "light" | "pretreated"; firstLocation: "full" | "left-chest" | "hat";
  secondLocation: "none" | "full" | "small"; thirdLocation: "none" | "full" | "small";
};
export const rushOptions = tables["print-calculator.tsx"].RUSH_OPTIONS;
export const finishingServices = tables["finishing-options.tsx"].SERVICES;
export const stitchRanges = tables["embroidery-calculator.tsx"].STITCH_RANGES;
export function defaults(service: Service): PricingInput {
  return { service, quantity: service === "print" ? 100 : 50, garmentCost: service === "print" ? 6.72 : service === "embroidery" ? 10.5 : 4.5,
    colors: [3, 0, 0], specialtyInks: 0, rush: "standard", finishing: { service: "none", steamingRate: 0, insideTags: false },
    mode: "supplied", stitches: 7500, newDesign: true, puff: false, hatLocations: 0, hemTags: false,
    stitchOuts: 0, colorChanges: 0, winterSurcharge: 0, method: "dtf", garmentPreparation: "light",
    firstLocation: "full", secondLocation: "none", thirdLocation: "none" };
}
export function finishingPrice(quantity: number, input: Finishing) {
  const index = quantity < 100 ? 0 : quantity < 250 ? 1 : quantity < 500 ? 2 : 3;
  const service = finishingServices[input.service];
  const needsReview = quantity < 25 && (input.service !== "none" || input.insideTags);
  const serviceRate = quantity < 25 ? 0 : service.rates[index];
  const insideTagRate = quantity < 25 || !input.insideTags ? 0 : tables["finishing-options.tsx"].INSIDE_TAG_RATES[index];
  const perItem = serviceRate + insideTagRate + input.steamingRate;
  return { perItem, total: perItem * quantity, needsReview, serviceRate, insideTagRate, steamingRate: input.steamingRate };
}
export type Quote = {
  valid: boolean; error?: string; review: boolean; reviewReasons: string[];
  lowUnit: number; highUnit: number; lowTotal: number; highTotal: number;
  baseUnit: number; projectFees: number; tier: string;
  details: { label: string; value: number }[];
};
const invalid = (error: string): Quote => ({ valid: false, error, review: true, reviewReasons: [error], lowUnit: 0, highUnit: 0, lowTotal: 0, highTotal: 0, baseUnit: 0, projectFees: 0, tier: "Outside matrix", details: [] });
export function calculate(input: PricingInput): Quote {
  const { service, quantity: q, garmentCost: cost } = input;
  if (!Number.isSafeInteger(q) || q < 1 || !Number.isFinite(cost) || cost < 0) return invalid("Enter a whole quantity and a nonnegative garment cost.");
  const rush = rushOptions.find(r => r.value === input.rush);
  if (!rush) return invalid("Select a valid turnaround.");
  if (!(input.finishing.service in finishingServices) || ![0, 1, 1.25, 1.5, 1.75, 2].includes(input.finishing.steamingRate)) return invalid("Select valid finishing options.");
  const finishing = finishingPrice(q, { ...input.finishing, insideTags: service === "embroidery" ? false : input.finishing.insideTags });
  const reviewReasons: string[] = [];
  if (rush.value === "same-day") reviewReasons.push("Same / next day requires approval.");
  if (finishing.needsReview) reviewReasons.push("Finishing below 25 pieces requires review; matrix finishing fees are pending.");
  let unit = 0, fees = 0, subtotal = 0, tier = "", details: Quote["details"] = [];
  if (service === "print") {
    const t = tables["print-calculator.tsx"].TIERS.find(t => q >= t.min && q <= t.max);
    if (!t) return invalid("Screen print quantities outside 12–2,500 require manager pricing.");
    const [a, b, c] = input.colors;
    if (!input.colors.every((v, index) => Number.isInteger(v) && v >= (index === 0 ? 1 : 0) && v <= 8) || (c > 0 && b === 0)) return invalid("Select valid colors and add location 2 before location 3.");
    if (!Number.isInteger(input.specialtyInks) || input.specialtyInks < 0 || input.specialtyInks > 8) return invalid("Select 0–8 specialty inks.");
    const locations = input.colors.filter(v => v > 0).length;
    const effectiveColors = a + b + c + locations - 1;
    const garment = cost * (cost <= 12 ? t.lowCostMarkup : cost <= 20 ? t.midCostMarkup : t.highCostMarkup);
    const decoration = effectiveColors * (cost <= 12 ? t.lowCostPrintCharge : t.highCostPrintCharge);
    const screens = 30 * effectiveColors / t.min;
    unit = garment + decoration + screens + t.smallOrderAdder + finishing.perItem;
    fees = 40 * input.specialtyInks;
    subtotal = unit * q;
    tier = t.label;
    details = [{ label: "Garment / piece", value: garment }, { label: "Print / piece", value: decoration }, { label: "Setup / piece (tier minimum)", value: screens }, { label: "Small order / piece", value: t.smallOrderAdder }];
  } else {
    const t = tables["embroidery-calculator.tsx"].QUANTITY_TIERS.find(t => q >= t.min && (typeof t.max === "string" || q <= t.max));
    if (!t) return invalid("Quantity is outside the pricing matrix.");
    const index = tables["embroidery-calculator.tsx"].QUANTITY_TIERS.indexOf(t);
    tier = t.label;
    if (service === "embroidery") {
      const e = tables["embroidery-calculator.tsx"];
      if (!stitchRanges.some(r => r.value === input.stitches) || !["supplied", "walk-in", "recurring"].includes(input.mode) || ![input.hatLocations, input.stitchOuts, input.colorChanges].every(n => Number.isSafeInteger(n) && n >= 0) || !Number.isFinite(input.winterSurcharge) || input.winterSurcharge < 0) return invalid("Enter valid embroidery options.");
      const row = input.stitches <= 7500 ? 0 : input.stitches <= 15000 ? 1 : 2;
      const matrix = input.mode === "supplied" ? e.SUPPLIED_BASE : input.mode === "walk-in" ? e.WALK_IN_BASE : e.RECURRING_BASE;
      const garment = input.mode === "supplied" ? Math.max(0, cost - (q >= 200 ? 0.5 : 0)) * (cost <= 3 ? 2.5 : cost <= 8 ? 2 : cost <= 40 ? 1.6 : 1.4) : 0;
      const stitchOverage = Math.ceil(Math.max(0, input.stitches - 25000) / 1000);
      const addons = stitchOverage + (input.puff ? 3 : 0) + input.hatLocations * e.HAT_LOCATION_RATE[index] + (input.hemTags ? e.HEM_TAG_RATE[index] : 0) + input.winterSurcharge;
      unit = garment + matrix[row][index] + addons + finishing.perItem;
      fees = (input.newDesign && q < 50 ? Math.max(25, Math.ceil(input.stitches / 1000)) : 0) + input.stitchOuts * 10 + input.colorChanges * 5;
      const calculated = unit * q + fees;
      subtotal = Math.max(50, calculated);
      details = [{ label: "Garment / piece", value: garment }, { label: "Embroidery / piece", value: matrix[row][index] }, { label: "Add-ons / piece", value: addons }, { label: "$50 minimum adjustment", value: subtotal - calculated }];
    } else {
      const d = tables["dtg-dtf-calculator.tsx"];
      const firstTable = d.FIRST_LOCATION[input.method];
      const first = firstTable[input.firstLocation as keyof typeof firstTable];
      if (!first || !["none", "full", "small"].includes(input.secondLocation) || !["none", "full", "small"].includes(input.thirdLocation)) return invalid("Select valid print locations for this method.");
      const garment = cost * (cost <= 3.5 ? 2.25 : cost <= 7.5 ? 1.8 : cost <= 15 ? 1.65 : 1.5);
      const added = d.ADDED_LOCATION[input.method];
      const decoration = first.rates[index] + (input.secondLocation === "none" ? 0 : added[input.secondLocation].rates[index]) + (input.thirdLocation === "none" ? 0 : added[input.thirdLocation].rates[index]);
      const prep = input.method === "dtg" ? d.DTG_PREPARATION_ADJUSTMENT[input.garmentPreparation][index] : 0;
      unit = garment + decoration + prep + finishing.perItem;
      subtotal = unit * q;
      if (q < 12) reviewReasons.push("DTG / DTF below 12 pieces requires review.");
      details = [{ label: "Garment / piece", value: garment }, { label: "Decoration / piece", value: decoration }, { label: "Preparation / piece", value: prep }];
    }
  }
  const lowUnit = unit * (1 + rush.min), highUnit = unit * (1 + rush.max);
  const lowTotal = subtotal * (1 + rush.min) + (service === "print" ? fees : 0);
  const highTotal = subtotal * (1 + rush.max) + (service === "print" ? fees : 0);
  if (![unit, fees, lowUnit, highUnit, lowTotal, highTotal].every(Number.isFinite)) return invalid("Inputs exceed the supported pricing range.");
  return { valid: true, review: reviewReasons.length > 0, reviewReasons, lowUnit, highUnit, lowTotal, highTotal, baseUnit: unit, projectFees: fees, tier,
    details: [...details, { label: "Finishing / piece", value: finishing.perItem }, { label: "One-time project fees", value: fees }] };
}
