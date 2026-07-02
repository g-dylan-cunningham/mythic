type SsConnectionResult =
  | {
      ok: true;
      endpoint: string;
      remainingRequests: string | null;
      status: number;
      data: unknown;
    }
  | {
      ok: false;
      endpoint: string | null;
      status: number | null;
      error: string;
      data?: unknown;
    };

type SsWarehouse = {
  warehouseAbbr?: string | null;
  qty?: number | string | null;
};

type SsProduct = {
  brandName?: string | null;
  color1?: string | null;
  color2?: string | null;
  colorName?: string | null;
  colorSwatchTextColor?: string | null;
  customerPrice?: number | string | null;
  piecePrice?: number | string | null;
  qty?: number | string | null;
  sizeName?: string | null;
  sizeOrder?: string | null;
  sku?: string | null;
  styleID?: number | string | null;
  styleName?: string | null;
  warehouses?: SsWarehouse[] | null;
};

type SizeSortValue = {
  sizeName: string;
  sizeOrder: string;
};

export type SsStyleInventoryVariant = {
  color1: string | null;
  color2: string | null;
  colorName: string;
  customerPrice: number;
  sizeName: string;
  sizeOrder: string;
  sku: string;
  totalQty: number;
  warehouses: {
    qty: number;
    warehouse: string;
  }[];
};

export type SsStyleInventoryReport =
  | {
      ok: true;
      endpoint: string;
      remainingRequests: string | null;
      status: number;
      query: {
        color: string;
        minQty: number;
        search: string;
        size: string;
        warehouse: string;
      };
      partNumber: string | null;
      brandName: string;
      styleName: string;
      styleID: string;
      variantCount: number;
      filteredVariantCount: number;
      colorCount: number;
      sizeCount: number;
      totalQty: number;
      filteredTotalQty: number;
      warehouseTotals: {
        qty: number;
        warehouse: string;
      }[];
      colorTotals: {
        color1: string | null;
        color2: string | null;
        colorName: string;
        qty: number;
        variantCount: number;
      }[];
      sizeTotals: {
        qty: number;
        sizeName: string;
        sizeOrder: string;
      }[];
      availableColors: string[];
      availableSizes: string[];
      availableWarehouses: string[];
      variants: SsStyleInventoryVariant[];
      filteredVariants: SsStyleInventoryVariant[];
    }
  | {
      ok: false;
      endpoint: string | null;
      status: number | null;
      error: string;
      data?: unknown;
    };

function getSsConfig() {
  const accountNumber = process.env.SS_ACCOUNT_NUMBER;
  const apiKey = process.env.SS_API_KEY;
  const baseUrl = process.env.SS_API_BASE_URL ?? "https://api.ssactivewear.com";
  const version = process.env.SS_API_VERSION ?? "v2";
  const reportPartNumber = process.env.SS_REPORT_PART_NUMBER ?? "00760";
  const testSku = process.env.SS_TEST_SKU ?? "B00760004";

  if (!accountNumber || !apiKey) {
    return {
      ok: false as const,
      error: "Missing SS_ACCOUNT_NUMBER or SS_API_KEY.",
    };
  }

  return {
    ok: true as const,
    accountNumber,
    apiKey,
    baseUrl,
    reportPartNumber,
    testSku,
    version,
  };
}

function basicAuth(username: string, password: string) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

function toNumber(value: number | string | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function sortSizes(a: SizeSortValue, b: SizeSortValue) {
  const orderCompare = a.sizeOrder.localeCompare(b.sizeOrder);

  if (orderCompare !== 0) {
    return orderCompare;
  }

  return a.sizeName.localeCompare(b.sizeName);
}

function looksLikeSku(value: string) {
  return /^[a-z]\d{5,}/i.test(value.trim());
}

function matchesQuery(value: string, query: string) {
  return value.toLowerCase().includes(query.toLowerCase());
}

export async function testSsInventoryConnection(): Promise<SsConnectionResult> {
  const config = getSsConfig();

  if (!config.ok) {
    console.error("[ss] inventory test skipped:", config.error);

    return {
      ok: false,
      endpoint: null,
      status: null,
      error: config.error,
    };
  }

  const url = new URL(
    `/${config.version}/inventory/${encodeURIComponent(config.testSku)}`,
    config.baseUrl,
  );
  url.searchParams.set("mediatype", "json");

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: basicAuth(config.accountNumber, config.apiKey),
      },
      cache: "no-store",
    });
    const contentType = response.headers.get("content-type") ?? "";
    const data = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      console.error("[ss] inventory test failed:", {
        status: response.status,
        statusText: response.statusText,
        data,
      });

      return {
        ok: false,
        endpoint: `${url.origin}${url.pathname}`,
        status: response.status,
        error: `S&S returned ${response.status} ${response.statusText}.`,
        data,
      };
    }

    return {
      ok: true,
      endpoint: `${url.origin}${url.pathname}`,
      remainingRequests: response.headers.get("x-rate-limit-remaining"),
      status: response.status,
      data,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown S&S request error.";

    console.error("[ss] inventory test error:", error);

    return {
      ok: false,
      endpoint: `${url.origin}${url.pathname}`,
      status: null,
      error: message,
    };
  }
}

export async function getSsStyleInventoryReport({
  color = "",
  minQty = 1,
  search,
  size = "",
  warehouse = "",
}: {
  color?: string;
  minQty?: number;
  search?: string;
  size?: string;
  warehouse?: string;
} = {}): Promise<SsStyleInventoryReport> {
  const config = getSsConfig();

  if (!config.ok) {
    console.error("[ss] style inventory report skipped:", config.error);

    return {
      ok: false,
      endpoint: null,
      status: null,
      error: config.error,
    };
  }

  const trimmedSearch = (search || config.reportPartNumber).trim();
  const normalizedMinQty = Number.isFinite(minQty) && minQty > 0 ? minQty : 1;
  const url = new URL(
    looksLikeSku(trimmedSearch)
      ? `/${config.version}/products/${encodeURIComponent(trimmedSearch)}`
      : `/${config.version}/products/`,
    config.baseUrl,
  );

  if (!looksLikeSku(trimmedSearch)) {
    url.searchParams.set("partnumber", trimmedSearch);
  }

  url.searchParams.set("mediatype", "json");

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: basicAuth(config.accountNumber, config.apiKey),
      },
      cache: "no-store",
    });
    const contentType = response.headers.get("content-type") ?? "";
    const data = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (!response.ok || !Array.isArray(data)) {
      console.error("[ss] style inventory report failed:", {
        status: response.status,
        statusText: response.statusText,
        data,
      });

      return {
        ok: false,
        endpoint: `${url.origin}${url.pathname}`,
        status: response.status,
        error: response.ok
          ? "S&S returned an unexpected products response."
          : `S&S returned ${response.status} ${response.statusText}.`,
        data,
      };
    }

    const products = data as SsProduct[];
    const firstProduct = products[0];
    const warehouseTotals = new Map<string, number>();
    const colorTotals = new Map<
      string,
      {
        color1: string | null;
        color2: string | null;
        colorName: string;
        qty: number;
        variantCount: number;
      }
    >();
    const sizeTotals = new Map<
      string,
      {
        qty: number;
        sizeName: string;
        sizeOrder: string;
      }
    >();

    const variants = products.map((product) => {
      const warehouses = (product.warehouses ?? [])
        .map((warehouse) => ({
          warehouse: warehouse.warehouseAbbr?.trim() || "Unknown",
          qty: toNumber(warehouse.qty),
        }))
        .sort((a, b) => b.qty - a.qty);
      const totalQty = toNumber(product.qty);
      const colorName = product.colorName?.trim() || "Unknown";
      const sizeName = product.sizeName?.trim() || "Unknown";
      const sizeOrder = product.sizeOrder?.trim() || "";

      for (const warehouse of warehouses) {
        warehouseTotals.set(
          warehouse.warehouse,
          (warehouseTotals.get(warehouse.warehouse) ?? 0) + warehouse.qty,
        );
      }

      const colorTotal =
        colorTotals.get(colorName) ??
        ({
          color1: product.color1?.trim() || null,
          color2: product.color2?.trim() || null,
          colorName,
          qty: 0,
          variantCount: 0,
        } satisfies {
          color1: string | null;
          color2: string | null;
          colorName: string;
          qty: number;
          variantCount: number;
        });
      colorTotal.qty += totalQty;
      colorTotal.variantCount += 1;
      colorTotals.set(colorName, colorTotal);

      const sizeTotal =
        sizeTotals.get(sizeName) ??
        ({
          qty: 0,
          sizeName,
          sizeOrder,
        } satisfies {
          qty: number;
          sizeName: string;
          sizeOrder: string;
        });
      sizeTotal.qty += totalQty;
      sizeTotals.set(sizeName, sizeTotal);

      return {
        color1: product.color1?.trim() || null,
        color2: product.color2?.trim() || null,
        colorName,
        customerPrice: toNumber(product.customerPrice ?? product.piecePrice),
        sizeName,
        sizeOrder,
        sku: product.sku?.trim() || "Unknown",
        totalQty,
        warehouses,
      } satisfies SsStyleInventoryVariant;
    });
    const sortedVariants = variants.sort((a, b) => {
      const colorCompare = a.colorName.localeCompare(b.colorName);

      if (colorCompare !== 0) {
        return colorCompare;
      }

      return sortSizes(a, b);
    });
    const normalizedColor = color.trim();
    const normalizedSize = size.trim();
    const normalizedWarehouse = warehouse.trim().toUpperCase();
    const filteredVariants = sortedVariants.filter((variant) => {
      const warehouseQty =
        normalizedWarehouse.length > 0
          ? (variant.warehouses.find(
              (item) => item.warehouse.toUpperCase() === normalizedWarehouse,
            )?.qty ?? 0)
          : variant.totalQty;

      return (
        (!normalizedColor || matchesQuery(variant.colorName, normalizedColor)) &&
        (!normalizedSize ||
          variant.sizeName.toLowerCase() === normalizedSize.toLowerCase()) &&
        warehouseQty >= normalizedMinQty
      );
    });
    const filteredTotalQty = filteredVariants.reduce((total, variant) => {
      if (!normalizedWarehouse) {
        return total + variant.totalQty;
      }

      return (
        total +
        (variant.warehouses.find(
          (item) => item.warehouse.toUpperCase() === normalizedWarehouse,
        )?.qty ?? 0)
      );
    }, 0);
    const availableWarehouses = Array.from(
      new Set(
        sortedVariants.flatMap((variant) =>
          variant.warehouses.map((item) => item.warehouse),
        ),
      ),
    ).sort((a, b) => a.localeCompare(b));

    return {
      ok: true,
      endpoint: `${url.origin}${url.pathname}`,
      remainingRequests: response.headers.get("x-rate-limit-remaining"),
      status: response.status,
      query: {
        color: normalizedColor,
        minQty: normalizedMinQty,
        search: trimmedSearch,
        size: normalizedSize,
        warehouse: normalizedWarehouse,
      },
      partNumber: looksLikeSku(trimmedSearch) ? null : trimmedSearch,
      brandName: firstProduct?.brandName?.trim() || "Unknown brand",
      styleName: firstProduct?.styleName?.trim() || "Unknown style",
      styleID: String(firstProduct?.styleID ?? "Unknown"),
      variantCount: sortedVariants.length,
      filteredVariantCount: filteredVariants.length,
      colorCount: colorTotals.size,
      sizeCount: sizeTotals.size,
      totalQty: sortedVariants.reduce(
        (total, variant) => total + variant.totalQty,
        0,
      ),
      filteredTotalQty,
      warehouseTotals: Array.from(warehouseTotals.entries())
        .map(([warehouse, qty]) => ({ warehouse, qty }))
        .sort((a, b) => b.qty - a.qty),
      colorTotals: Array.from(colorTotals.values()).sort((a, b) => b.qty - a.qty),
      sizeTotals: Array.from(sizeTotals.values()).sort(sortSizes),
      availableColors: Array.from(colorTotals.keys()).sort((a, b) =>
        a.localeCompare(b),
      ),
      availableSizes: Array.from(sizeTotals.values())
        .sort(sortSizes)
        .map((item) => item.sizeName),
      availableWarehouses,
      variants: sortedVariants,
      filteredVariants,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown S&S request error.";

    console.error("[ss] style inventory report error:", error);

    return {
      ok: false,
      endpoint: `${url.origin}${url.pathname}`,
      status: null,
      error: message,
    };
  }
}
