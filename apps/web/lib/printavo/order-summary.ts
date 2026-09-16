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
