import type {
  PrintavoLineItem,
  PrintavoOrder,
} from "@/lib/printavo/client";

const SIZE_LABELS: Record<string, string> = {
  size_6m: "6M",
  size_12m: "12M",
  size_18m: "18M",
  size_24m: "24M",
  size_2t: "2T",
  size_3t: "3T",
  size_4t: "4T",
  size_5t: "5T",
  size_yxs: "YXS",
  size_ys: "YS",
  size_ym: "YM",
  size_yl: "YL",
  size_yxl: "YXL",
  size_xs: "XS",
  size_s: "S",
  size_m: "M",
  size_l: "L",
  size_xl: "XL",
  size_2xl: "2XL",
  size_3xl: "3XL",
  size_4xl: "4XL",
  size_5xl: "5XL",
  size_6xl: "6XL",
  size_other: "Other",
};

export type PrintavoOrderSummary = {
  approved: boolean;
  customerName: string | null;
  dueDate: string | null;
  fetchedAt: string;
  nickname: string | null;
  orderId: number;
  orderNumber: string;
  paid: boolean;
  statusName: string | null;
  total: number | null;
  updatedAt: string | null;
};

export type PrintavoOrderLineSummary = {
  category: string | null;
  color: string | null;
  description: string | null;
  goodsStatus: string | null;
  lineItemId: number | null;
  quantity: number | null;
  sizes: Array<{
    label: string;
    quantity: number;
  }>;
  styleNumber: string | null;
  unitCost: number | null;
};

export type PrintavoOrderDetails = PrintavoOrderSummary & {
  lineItems: PrintavoOrderLineSummary[];
};

export type ApparelOrderReadiness = {
  eligible: boolean;
  reasons: string[];
  relevantLineCount: number;
  sourceableLineCount: number;
};

export type ApparelLineSourcingDisposition =
  | "already_ordered"
  | "decoration_only"
  | "informational"
  | "non_apparel"
  | "sourceable";

export type ApparelLineSourcingClassification = {
  disposition: ApparelLineSourcingDisposition;
  reason: string;
};

const APPAREL_CATEGORIES = new Set([
  "dtf",
  "dtg",
  "embroidered apparel",
  "printed apparel",
]);

const DECORATION_CATEGORIES = new Set(["dtf", "dtg"]);
const EXPLICIT_NO_ORDER_PATTERN =
  /\b(?:do not order|do not purchase|not to be ordered|counted in (?:the )?(?:above|other) quantit)/i;
const DECORATION_DETAIL_PATTERN =
  /\b(?:add[ -]?ons?|left chest|individual names?|print locations?)\b/i;

export function printavoNumber(
  value: number | string | null | undefined,
) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function isPaidPrintavoOrder(order: PrintavoOrder) {
  if (order.stats?.paid === true) {
    return true;
  }

  const amountPaid = printavoNumber(order.amount_paid);
  const amountOutstanding = printavoNumber(order.amount_outstanding);

  return (
    amountPaid !== null &&
    amountOutstanding !== null &&
    amountPaid > 0 &&
    amountOutstanding <= 0
  );
}

export function printavoCustomerName(order: PrintavoOrder) {
  return (
    order.customer?.name ??
    order.customer?.full_name ??
    order.customer?.company ??
    order.user?.name ??
    null
  );
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function printavoCategory(lineItem: PrintavoLineItem) {
  if (typeof lineItem.category === "string") {
    return textValue(lineItem.category);
  }

  return textValue(lineItem.category?.name);
}

function printavoSizes(lineItem: PrintavoLineItem) {
  return Object.entries(SIZE_LABELS).flatMap(([key, label]) => {
    const quantity = printavoNumber(lineItem[key] as number | string | null);

    return quantity !== null && quantity > 0 ? [{ label, quantity }] : [];
  });
}

export function summarizePrintavoLineItem(
  lineItem: PrintavoLineItem,
): PrintavoOrderLineSummary {
  const sizes = printavoSizes(lineItem);
  const explicitSize = textValue(lineItem.size);

  if (explicitSize && sizes.length === 0) {
    const quantity = printavoNumber(lineItem.total_quantities);

    sizes.push({ label: explicitSize, quantity: quantity ?? 0 });
  }

  return {
    category: printavoCategory(lineItem),
    color: textValue(lineItem.color),
    description: textValue(lineItem.style_description),
    goodsStatus: textValue(lineItem.goods_status),
    lineItemId:
      typeof lineItem.id === "number" && Number.isFinite(lineItem.id)
        ? lineItem.id
        : null,
    quantity:
      printavoNumber(lineItem.total_quantities) ??
      (sizes.length > 0
        ? sizes.reduce((total, size) => total + size.quantity, 0)
        : null),
    sizes,
    styleNumber: textValue(lineItem.style_number),
    unitCost: printavoNumber(lineItem.unit_cost),
  };
}

export function summarizePrintavoOrder(
  order: PrintavoOrder,
  fetchedAt: string,
): PrintavoOrderSummary {
  return {
    approved: order.approved === true,
    customerName: printavoCustomerName(order),
    dueDate: order.due_date ?? null,
    fetchedAt,
    nickname: order.order_nickname?.trim() || null,
    orderId: order.id,
    orderNumber: String(order.visual_id ?? order.id),
    paid: isPaidPrintavoOrder(order),
    statusName: order.orderstatus?.name?.trim() || null,
    total:
      printavoNumber(order.order_total) ??
      printavoNumber(order.order_subtotal),
    updatedAt: order.updated_at ?? null,
  };
}

export function summarizePrintavoOrderDetails(
  order: PrintavoOrder,
  fetchedAt: string,
): PrintavoOrderDetails {
  return {
    ...summarizePrintavoOrder(order, fetchedAt),
    lineItems: (order.lineitems_attributes ?? []).map(
      summarizePrintavoLineItem,
    ),
  };
}

export function isRelevantApparelLine(lineItem: PrintavoOrderLineSummary) {
  return APPAREL_CATEGORIES.has(lineItem.category?.toLowerCase() ?? "");
}

export function classifyApparelLineForSourcing(
  lineItem: PrintavoOrderLineSummary,
): ApparelLineSourcingClassification {
  const category = lineItem.category?.toLowerCase() ?? "";
  const description = lineItem.description ?? "";

  if (!APPAREL_CATEGORIES.has(category)) {
    return {
      disposition: "non_apparel",
      reason: `Printavo category: ${lineItem.category ?? "Uncategorized"}.`,
    };
  }

  if (lineItem.goodsStatus?.toLowerCase() === "ordered") {
    return {
      disposition: "already_ordered",
      reason: "Already marked ordered in Printavo.",
    };
  }

  if (lineItem.quantity !== null && lineItem.quantity <= 0) {
    return {
      disposition: "informational",
      reason: "Zero-quantity line; no supplier purchase is required.",
    };
  }

  const explicitlyNotOrdered = EXPLICIT_NO_ORDER_PATTERN.test(description);
  const looksLikeDecorationDetail =
    DECORATION_CATEGORIES.has(category) &&
    (!lineItem.styleNumber || !lineItem.color) &&
    DECORATION_DETAIL_PATTERN.test(description);

  if (explicitlyNotOrdered || looksLikeDecorationDetail) {
    return {
      disposition: "decoration_only",
      reason: explicitlyNotOrdered
        ? "Marked as a do-not-order decoration or add-on line in Printavo."
        : "Decoration or add-on details are not a separate garment purchase.",
    };
  }

  return {
    disposition: "sourceable",
    reason: "Eligible for supplier sourcing after readiness checks pass.",
  };
}

export function isSourceableApparelLine(
  lineItem: PrintavoOrderLineSummary,
) {
  return classifyApparelLineForSourcing(lineItem).disposition === "sourceable";
}

export function getApparelOrderReadiness(
  order: PrintavoOrderDetails,
): ApparelOrderReadiness {
  const reasons: string[] = [];
  const status = order.statusName?.toLowerCase() ?? "";
  const relevantLines = order.lineItems.filter(isRelevantApparelLine);
  const classifiedLines = relevantLines.map((lineItem) => ({
    classification: classifyApparelLineForSourcing(lineItem),
    lineItem,
  }));
  const sourceableLines = classifiedLines.flatMap(
    ({ classification, lineItem }) =>
      classification.disposition === "sourceable" ? [lineItem] : [],
  );
  const orderedLineCount = classifiedLines.filter(
    ({ classification }) =>
      classification.disposition === "already_ordered",
  ).length;

  if (!status || status.includes("quote")) {
    reasons.push("The Printavo order is still in a quote stage.");
  }

  if (status.includes("cancel") || status.includes("declin")) {
    reasons.push("The Printavo order is canceled or declined.");
  }

  if (relevantLines.length === 0) {
    reasons.push("No apparel lines were found on the Printavo order.");
  }

  if (relevantLines.length > 0 && sourceableLines.length === 0) {
    reasons.push(
      orderedLineCount > 0
        ? "All sourceable apparel lines are already marked ordered in Printavo."
        : "No apparel lines currently require supplier ordering.",
    );
  }

  if (
    sourceableLines.some(
      (lineItem) => lineItem.quantity === null || lineItem.quantity <= 0,
    )
  ) {
    reasons.push("One or more apparel lines do not have a valid quantity.");
  }

  if (sourceableLines.some((lineItem) => lineItem.sizes.length === 0)) {
    reasons.push("One or more apparel lines do not have size quantities.");
  }

  if (sourceableLines.some((lineItem) => !lineItem.styleNumber)) {
    reasons.push("One or more apparel lines do not have a style number.");
  }

  if (sourceableLines.some((lineItem) => !lineItem.color)) {
    reasons.push("One or more apparel lines do not have a color.");
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    relevantLineCount: relevantLines.length,
    sourceableLineCount: sourceableLines.length,
  };
}
