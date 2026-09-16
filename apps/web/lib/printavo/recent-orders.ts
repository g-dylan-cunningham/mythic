import type { SupabaseClient } from "@supabase/supabase-js";
import type { PrintavoOrder } from "@/lib/printavo/client";
import {
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
      orders: PrintavoOrderSummary[];
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

function sortTimestamp(order: PrintavoOrderSummary) {
  const parsed = Date.parse(order.updatedAt ?? order.fetchedAt);

  return Number.isNaN(parsed) ? 0 : parsed;
}

function summarizeRows(rows: RawOrderRow[], limit: number) {
  const ordersById = new Map<number, PrintavoOrderSummary>();

  for (const row of rows) {
    if (!isPrintavoOrder(row.payload)) {
      continue;
    }

    const summary = summarizePrintavoOrder(row.payload, row.fetched_at);

    if (!ordersById.has(summary.orderId)) {
      ordersById.set(summary.orderId, summary);
    }
  }

  return Array.from(ordersById.values())
    .sort((left, right) => sortTimestamp(right) - sortTimestamp(left))
    .slice(0, limit);
}

export async function getRecentPrintavoOrders(
  supabase: SupabaseClient,
  limit = 25,
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
  const lastSuccessfulRun = runs?.find((run) => run.status === "succeeded");
  const lastQuery = lastRun
    ? {
        finishedAt: lastRun.finished_at,
        ordersSeen: lastRun.records_seen,
        startedAt: lastRun.started_at,
        status: lastRun.status,
      }
    : null;

  if (!lastSuccessfulRun) {
    return { error: null, lastQuery, ok: true, orders: [] };
  }

  const { data: rows, error: rowsError } = await supabase
    .from("api_raw_payloads")
    .select("source_entity_id,payload,fetched_at")
    .eq("source", "printavo")
    .eq("source_entity_type", "order")
    .eq("sync_run_id", lastSuccessfulRun.id)
    .order("fetched_at", { ascending: false })
    .limit(Math.max(limit, 1))
    .returns<RawOrderRow[]>();

  if (rowsError) {
    return {
      error: `Could not load recent Printavo orders: ${rowsError.message}`,
      lastQuery: null,
      ok: false,
      orders: [],
    };
  }

  return {
    error: null,
    lastQuery,
    ok: true,
    orders: summarizeRows(rows ?? [], limit),
  };
}

export async function getLatestPrintavoOrder(
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

  if (!data || !isPrintavoOrder(data.payload)) {
    return null;
  }

  return summarizePrintavoOrderDetails(data.payload, data.fetched_at);
}
