type PrintavoConnectionResult =
  | {
      ok: true;
      status: number;
      url: string;
      data: unknown;
    }
  | {
      ok: false;
      status: number | null;
      url: string | null;
      error: string;
      data?: unknown;
    };

type PrintavoOrder = {
  approved?: boolean | null;
  id: number;
  custom_created_at?: string | null;
  formatted_custom_created_at_date?: string | null;
  order_subtotal?: number | string | null;
  orderstatus?: {
    name?: string | null;
  } | null;
  user?: {
    name?: string | null;
  } | null;
};

type PrintavoOrdersResponse = {
  meta?: {
    page?: number;
    per_page?: number;
    total_count?: number;
    total_pages?: number;
  };
  data?: PrintavoOrder[];
};

export type PrintavoSalesReportCell = {
  amount: number;
  count: number;
};

export type PrintavoSalesReportRow = {
  date: string;
  dateKey: string;
  owners: Record<string, PrintavoSalesReportCell>;
  total: PrintavoSalesReportCell;
};

export type PrintavoSalesReportStatus = {
  status: string;
  amount: number;
  count: number;
};

export type PrintavoSalesReport =
  | {
      ok: true;
      startDate: string;
      endDate: string;
      owners: string[];
      rows: PrintavoSalesReportRow[];
      totalsByOwner: Record<string, PrintavoSalesReportCell>;
      grandTotal: PrintavoSalesReportCell;
      statusBreakdown: PrintavoSalesReportStatus[];
      scannedOrders: number;
      matchedOrders: number;
      pagesFetched: number;
      totalPages: number | null;
      truncated: boolean;
    }
  | {
      ok: false;
      error: string;
    };

function getPrintavoConfig() {
  const baseUrl = process.env.PRINTAVO_API_BASE_URL ?? "https://www.printavo.com";
  const version = process.env.PRINTAVO_API_VERSION ?? "v1";
  const email = process.env.PRINTAVO_API_EMAIL;
  const token = process.env.PRINTAVO_API_TOKEN;

  if (!email || !token) {
    return {
      ok: false as const,
      error: "Missing PRINTAVO_API_EMAIL or PRINTAVO_API_TOKEN.",
    };
  }

  return {
    ok: true as const,
    baseUrl,
    email,
    token,
    version,
  };
}

export async function testPrintavoConnection(): Promise<PrintavoConnectionResult> {
  const config = getPrintavoConfig();

  if (!config.ok) {
    console.error("[printavo] connection test skipped:", config.error);

    return {
      ok: false,
      status: null,
      url: null,
      error: config.error,
    };
  }

  const url = new URL(`/api/${config.version}/accounts`, config.baseUrl);
  url.searchParams.set("email", config.email);
  url.searchParams.set("token", config.token);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });
    const contentType = response.headers.get("content-type") ?? "";
    const data = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      console.error("[printavo] connection test failed:", {
        status: response.status,
        statusText: response.statusText,
        data,
      });

      return {
        ok: false,
        status: response.status,
        url: `${url.origin}${url.pathname}`,
        error: `Printavo returned ${response.status} ${response.statusText}.`,
        data,
      };
    }

    return {
      ok: true,
      status: response.status,
      url: `${url.origin}${url.pathname}`,
      data,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Printavo request error.";

    console.error("[printavo] connection test error:", error);

    return {
      ok: false,
      status: null,
      url: `${url.origin}${url.pathname}`,
      error: message,
    };
  }
}

function toDateKey(order: PrintavoOrder) {
  if (order.custom_created_at) {
    return order.custom_created_at.slice(0, 10);
  }

  const formattedDate = order.formatted_custom_created_at_date;

  if (!formattedDate) {
    return null;
  }

  const [month, day, year] = formattedDate.split("/");

  if (!month || !day || !year) {
    return null;
  }

  return `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function formatDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-");

  return `${Number(month)}/${Number(day)}/${year}`;
}

function toMoneyNumber(value: number | string | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function addCell(
  current: PrintavoSalesReportCell | undefined,
  amount: number,
): PrintavoSalesReportCell {
  return {
    amount: (current?.amount ?? 0) + amount,
    count: (current?.count ?? 0) + 1,
  };
}

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchPrintavoOrdersPage(page: number, perPage: number) {
  const config = getPrintavoConfig();

  if (!config.ok) {
    throw new Error(config.error);
  }

  const url = new URL(`/api/${config.version}/orders`, config.baseUrl);
  url.searchParams.set("email", config.email);
  url.searchParams.set("token", config.token);
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(perPage));
  url.searchParams.set("sort_column", "custom_created_at");
  url.searchParams.set("direction", "desc");

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const body = (await response.json()) as PrintavoOrdersResponse | {
    error?: string;
    message?: string;
  };

  if (!response.ok) {
    console.error("[printavo] orders report page failed:", {
      page,
      status: response.status,
      statusText: response.statusText,
      body,
    });

    throw new Error(`Printavo orders request failed with ${response.status}.`);
  }

  return body as PrintavoOrdersResponse;
}

export async function getPrintavoSalesReport({
  endDate = "2026-06-30",
  maxPages = 80,
  pageDelayMs = 200,
  perPage = 100,
  startDate = "2025-12-01",
}: {
  endDate?: string;
  maxPages?: number;
  pageDelayMs?: number;
  perPage?: number;
  startDate?: string;
} = {}): Promise<PrintavoSalesReport> {
  const rowsByDate = new Map<string, PrintavoSalesReportRow>();
  const owners = new Set<string>();
  const totalsByOwner: Record<string, PrintavoSalesReportCell> = {};
  const totalsByStatus: Record<string, PrintavoSalesReportCell> = {};
  let grandTotal: PrintavoSalesReportCell = { amount: 0, count: 0 };
  let scannedOrders = 0;
  let matchedOrders = 0;
  let pagesFetched = 0;
  let totalPages: number | null = null;
  let reachedBeforeStart = false;

  try {
    for (let page = 1; page <= maxPages; page += 1) {
      if (page > 1 && pageDelayMs > 0) {
        await wait(pageDelayMs);
      }

      const body = await fetchPrintavoOrdersPage(page, perPage);
      const orders = body.data ?? [];
      pagesFetched = page;
      totalPages = body.meta?.total_pages ?? totalPages;

      if (orders.length === 0) {
        break;
      }

      for (const order of orders) {
        scannedOrders += 1;
        const dateKey = toDateKey(order);

        if (!dateKey) {
          continue;
        }

        if (dateKey > endDate) {
          continue;
        }

        if (dateKey < startDate) {
          reachedBeforeStart = true;
          continue;
        }

        const owner = order.user?.name?.trim() || "Unassigned";
        const amount = toMoneyNumber(order.order_subtotal);
        const row =
          rowsByDate.get(dateKey) ??
          ({
            date: formatDate(dateKey),
            dateKey,
            owners: {},
            total: { amount: 0, count: 0 },
          } satisfies PrintavoSalesReportRow);

        row.owners[owner] = addCell(row.owners[owner], amount);
        row.total = addCell(row.total, amount);
        rowsByDate.set(dateKey, row);

        owners.add(owner);
        totalsByOwner[owner] = addCell(totalsByOwner[owner], amount);
        const status = order.orderstatus?.name?.trim() || "No status";
        totalsByStatus[status] = addCell(totalsByStatus[status], amount);
        grandTotal = addCell(grandTotal, amount);
        matchedOrders += 1;
      }

      if (reachedBeforeStart) {
        break;
      }
    }

    return {
      ok: true,
      startDate,
      endDate,
      owners: Array.from(owners).sort((a, b) => a.localeCompare(b)),
      rows: Array.from(rowsByDate.values()).sort((a, b) =>
        a.dateKey.localeCompare(b.dateKey),
      ),
      totalsByOwner,
      grandTotal,
      statusBreakdown: Object.entries(totalsByStatus)
        .map(([status, cell]) => ({
          status,
          amount: cell.amount,
          count: cell.count,
        }))
        .sort((a, b) => b.amount - a.amount),
      scannedOrders,
      matchedOrders,
      pagesFetched,
      totalPages,
      truncated: !reachedBeforeStart && pagesFetched >= maxPages,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown Printavo sales report error.";

    console.error("[printavo] sales report error:", error);

    return {
      ok: false,
      error: message,
    };
  }
}
