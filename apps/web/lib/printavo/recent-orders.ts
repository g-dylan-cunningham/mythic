import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchPrintavoOrder,
  type PrintavoOrder,
} from "@/lib/printavo/client";
import {
  type ApparelOrderReadiness,
  getApparelOrderReadiness,
  type PrintavoOrderDetails,
  type PrintavoOrderSummary,
  summarizePrintavoOrder,
  summarizePrintavoOrderDetails,
} from "@/lib/printavo/order-summary";

type SyncRunRow = {
  finished_at: string | null;
  id: string;
  records_seen: number;
  started_at: string;
  status: string;
};

type RawOrderRow = {
  fetched_at: string;
  payload: unknown;
  source_entity_id: string;
};

type LatestOrderRow = {
  fetched_at: string;
  payload: unknown;
  printavo_order_id: number;
  sort_at: string;
};

type PrintavoOrdersCursor = {
  orderId: number;
  sortAt: string;
};

export type PrintavoOrdersPageOptions = {
  after?: string;
  before?: string;
  pageSize?: number;
};

export type PrintavoOrdersPagination = {
  newerCursor: string | null;
  olderCursor: string | null;
  pageSize: number;
};

export type RecentPrintavoOrderSummary = PrintavoOrderSummary & {
  apparelReadiness: ApparelOrderReadiness;
};

export type RefreshedPrintavoOrderResult = {
  checkedAt: string | null;
  fresh: boolean;
  order: PrintavoOrderDetails | null;
  snapshotUpdated: boolean;
  warning: string | null;
};

export type PrintavoQuerySummary = {
  finishedAt: string | null;
  ordersSeen: number;
  startedAt: string;
  status: string;
};

export type RecentPrintavoOrdersResult =
  | {
      error: null;
      lastQuery: PrintavoQuerySummary | null;
      ok: true;
      orders: RecentPrintavoOrderSummary[];
      pagination: PrintavoOrdersPagination;
    }
  | {
      error: string;
      lastQuery: null;
      ok: false;
      orders: [];
    };

function isPrintavoOrder(value: unknown): value is PrintavoOrder {
  if (!value || typeof value !== "object") {
    return false;
  }

  const id = (value as { id?: unknown }).id;

  return typeof id === "number" && Number.isFinite(id);
}

const CURSOR_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

function encodeOrdersCursor(row: LatestOrderRow) {
  return Buffer.from(
    JSON.stringify({
      orderId: row.printavo_order_id,
      sortAt: row.sort_at,
    } satisfies PrintavoOrdersCursor),
  ).toString("base64url");
}

function decodeOrdersCursor(value: string | undefined) {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<PrintavoOrdersCursor>;

    if (
      !Number.isSafeInteger(parsed.orderId) ||
      (parsed.orderId ?? 0) <= 0 ||
      typeof parsed.sortAt !== "string" ||
      !CURSOR_TIMESTAMP_PATTERN.test(parsed.sortAt) ||
      Number.isNaN(Date.parse(parsed.sortAt))
    ) {
      return null;
    }

    return {
      orderId: parsed.orderId as number,
      sortAt: parsed.sortAt,
    };
  } catch {
    return null;
  }
}

function summarizeRows(rows: LatestOrderRow[]) {
  return rows.flatMap((row) => {
    if (!isPrintavoOrder(row.payload)) {
      return [];
    }

    const summary = summarizePrintavoOrder(row.payload, row.fetched_at);
    const details = summarizePrintavoOrderDetails(
      row.payload,
      row.fetched_at,
    );

    return [
      {
        ...summary,
        apparelReadiness: getApparelOrderReadiness(details),
      },
    ];
  });
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`,
      )
      .join(",")}}`;
  }

  return JSON.stringify(value) ?? "null";
}

async function getLatestPrintavoOrderRow(
  supabase: SupabaseClient,
  orderId: number,
) {
  const { data, error } = await supabase
    .from("api_raw_payloads")
    .select("source_entity_id,payload,fetched_at")
    .eq("source", "printavo")
    .eq("source_entity_type", "order")
    .eq("source_entity_id", String(orderId))
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle<RawOrderRow>();

  if (error) {
    throw new Error(`Could not load Printavo order: ${error.message}`);
  }

  return data;
}

export async function getRecentPrintavoOrders(
  supabase: SupabaseClient,
  options: PrintavoOrdersPageOptions = {},
): Promise<RecentPrintavoOrdersResult> {
  const { data: runs, error: runsError } = await supabase
    .from("sync_runs")
    .select("id,status,started_at,finished_at,records_seen")
    .eq("source", "printavo_orders")
    .order("started_at", { ascending: false })
    .limit(25)
    .returns<SyncRunRow[]>();

  if (runsError) {
    return {
      error: `Could not load Printavo query history: ${runsError.message}`,
      lastQuery: null,
      ok: false,
      orders: [],
    };
  }

  const lastRun = runs?.[0] ?? null;
  const lastQuery = lastRun
    ? {
        finishedAt: lastRun.finished_at,
        ordersSeen: lastRun.records_seen,
        startedAt: lastRun.started_at,
        status: lastRun.status,
      }
    : null;

  const requestedPageSize = options.pageSize ?? 10;
  const pageSize = Math.min(Math.max(requestedPageSize, 1), 50);
  const afterCursor = decodeOrdersCursor(options.after);
  const beforeCursor = afterCursor
    ? null
    : decodeOrdersCursor(options.before);
  const direction = afterCursor ? "after" : beforeCursor ? "before" : "first";
  const ascending = direction === "before";
  let ordersQuery = supabase
    .from("latest_printavo_order_payloads")
    .select("printavo_order_id,payload,fetched_at,sort_at")
    .order("sort_at", { ascending })
    .order("printavo_order_id", { ascending })
    .limit(pageSize + 1);

  if (afterCursor) {
    ordersQuery = ordersQuery.or(
      `sort_at.lt.${afterCursor.sortAt},and(sort_at.eq.${afterCursor.sortAt},printavo_order_id.lt.${afterCursor.orderId})`,
    );
  } else if (beforeCursor) {
    ordersQuery = ordersQuery.or(
      `sort_at.gt.${beforeCursor.sortAt},and(sort_at.eq.${beforeCursor.sortAt},printavo_order_id.gt.${beforeCursor.orderId})`,
    );
  }

  const { data: rows, error: rowsError } =
    await ordersQuery.returns<LatestOrderRow[]>();

  if (rowsError) {
    return {
      error: `Could not load recent Printavo orders: ${rowsError.message}`,
      lastQuery: null,
      ok: false,
      orders: [],
    };
  }

  const hasExtraRow = (rows?.length ?? 0) > pageSize;
  const pageRows = (rows ?? []).slice(0, pageSize);

  if (direction === "before") {
    pageRows.reverse();
  }

  const firstRow = pageRows[0] ?? null;
  const lastRow = pageRows.at(-1) ?? null;
  const hasNewerOrders =
    direction === "after" || (direction === "before" && hasExtraRow);
  const hasOlderOrders =
    direction === "before" ||
    ((direction === "first" || direction === "after") && hasExtraRow);

  return {
    error: null,
    lastQuery,
    ok: true,
    orders: summarizeRows(pageRows),
    pagination: {
      newerCursor:
        hasNewerOrders && firstRow ? encodeOrdersCursor(firstRow) : null,
      olderCursor:
        hasOlderOrders && lastRow ? encodeOrdersCursor(lastRow) : null,
      pageSize,
    },
  };
}

export async function getLatestPrintavoOrder(
  supabase: SupabaseClient,
  orderId: number,
) {
  const data = await getLatestPrintavoOrderRow(supabase, orderId);

  if (!data || !isPrintavoOrder(data.payload)) {
    return null;
  }

  return summarizePrintavoOrderDetails(data.payload, data.fetched_at);
}

export async function refreshPrintavoOrder(
  supabase: SupabaseClient,
  orderId: number,
): Promise<RefreshedPrintavoOrderResult> {
  const existing = await getLatestPrintavoOrderRow(supabase, orderId);

  try {
    const liveOrder = await fetchPrintavoOrder(orderId);
    const checkedAt = new Date().toISOString();
    const snapshotUpdated =
      !existing || canonicalJson(existing.payload) !== canonicalJson(liveOrder);
    let warning: string | null = null;

    if (snapshotUpdated) {
      const { error } = await supabase.from("api_raw_payloads").insert({
        fetched_at: checkedAt,
        payload: liveOrder,
        source: "printavo",
        source_entity_id: String(orderId),
        source_entity_type: "order",
      });

      if (error) {
        warning = `Fresh Printavo data was loaded but could not be saved: ${error.message}`;
      }
    }

    return {
      checkedAt,
      fresh: true,
      order: summarizePrintavoOrderDetails(liveOrder, checkedAt),
      snapshotUpdated,
      warning,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Printavo refresh error.";
    const fallback =
      existing && isPrintavoOrder(existing.payload)
        ? summarizePrintavoOrderDetails(existing.payload, existing.fetched_at)
        : null;

    return {
      checkedAt: null,
      fresh: false,
      order: fallback,
      snapshotUpdated: false,
      warning: `Could not refresh this order from Printavo: ${message}`,
    };
  }
}
