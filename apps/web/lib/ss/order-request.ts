export type SsShippingAddressInput = {
  address: string;
  attn?: string;
  city: string;
  customer?: string;
  residential?: boolean;
  state: string;
  zip: string;
};

export type SsOrderLineInput = {
  identifier: string;
  qty: number;
  warehouseAbbr?: string;
};

export type SsPrintavoOrderInput = {
  autoselectWarehouse?: boolean;
  autoselectWarehousePreference?: "fastest" | "fewest";
  autoselectWarehouseWarehouses?: string[];
  emailConfirmation?: string;
  lines: SsOrderLineInput[];
  printavoOrderNumber: number | string;
  shippingAddress: SsShippingAddressInput;
  shippingMethod?: string;
  shipBlind?: boolean;
  testOrder?: boolean;
};

export type SsOrderRequest = {
  AutoSelectWarehouse_Preference?: "fastest" | "fewest";
  autoselectWarehouse: boolean;
  autoselectWarehouse_Warehouses?: string;
  emailConfirmation: string;
  lines: Array<{
    identifier: string;
    qty: number;
    warehouseAbbr?: string;
  }>;
  poNumber: string;
  rejectLineErrors: true;
  shipBlind: boolean;
  shippingAddress: {
    address: string;
    attn: string;
    city: string;
    customer: string;
    residential: boolean;
    state: string;
    zip: string;
  };
  shippingMethod: string;
  testOrder: boolean;
};

function requiredText(value: string, field: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(`${field} is required.`);
  }

  return trimmed;
}

export function ssPrintavoPoNumber(value: number | string) {
  const orderNumber = String(value).trim();

  if (!/^\d*[1-9]\d*$/.test(orderNumber)) {
    throw new Error("A positive numeric Printavo order number is required.");
  }

  return `PA-${orderNumber}`;
}

export function buildSsPrintavoOrderRequest(
  input: SsPrintavoOrderInput,
): SsOrderRequest {
  if (input.lines.length === 0) {
    throw new Error("At least one S&S order line is required.");
  }

  const autoselectWarehouse = input.autoselectWarehouse ?? true;
  const selectedWarehouses = input.autoselectWarehouseWarehouses
    ?.map((warehouse) => warehouse.trim().toUpperCase())
    .filter(Boolean);
  const request: SsOrderRequest = {
    autoselectWarehouse,
    emailConfirmation: input.emailConfirmation?.trim() ?? "",
    lines: input.lines.map((line, index) => {
      if (!Number.isSafeInteger(line.qty) || line.qty <= 0) {
        throw new Error(`S&S order line ${index + 1} needs a positive quantity.`);
      }

      const warehouseAbbr = line.warehouseAbbr?.trim().toUpperCase();

      return {
        identifier: requiredText(
          line.identifier,
          `S&S order line ${index + 1} identifier`,
        ),
        qty: line.qty,
        ...(warehouseAbbr && !autoselectWarehouse
          ? { warehouseAbbr }
          : {}),
      };
    }),
    poNumber: ssPrintavoPoNumber(input.printavoOrderNumber),
    rejectLineErrors: true,
    shipBlind: input.shipBlind ?? false,
    shippingAddress: {
      address: requiredText(input.shippingAddress.address, "Shipping address"),
      attn: input.shippingAddress.attn?.trim() ?? "",
      city: requiredText(input.shippingAddress.city, "Shipping city"),
      customer: input.shippingAddress.customer?.trim() ?? "",
      residential: input.shippingAddress.residential ?? false,
      state: requiredText(input.shippingAddress.state, "Shipping state"),
      zip: requiredText(input.shippingAddress.zip, "Shipping ZIP code"),
    },
    shippingMethod: input.shippingMethod?.trim() || "1",
    testOrder: input.testOrder ?? false,
  };

  if (input.autoselectWarehousePreference) {
    request.AutoSelectWarehouse_Preference =
      input.autoselectWarehousePreference;
  }

  if (selectedWarehouses?.length) {
    request.autoselectWarehouse_Warehouses = selectedWarehouses.join(",");
  }

  return request;
}
