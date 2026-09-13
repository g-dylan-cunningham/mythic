import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createProductionJobFromPrintavoOrder,
  type PrintavoOrderForProduction,
} from "@/lib/production-workflow/engine";
import {
  fetchPrintavoOrdersPage,
  type PrintavoOrder,
} from "@/lib/printavo/client";

type SyncStatus = "running" | "succeeded" | "failed";

export type PrintavoProductionSyncResult = {
  createdJobs: number;
  eligibleOrders: number;
  existingJobs: number;
  failedOrders: Array<{
    error: string;
    printavoOrderId: number;
  }>;
  pagesFetched: number;
  scannedOrders: number;
  skippedIneligibleOrders: number;
  syncRunId: string;
};

export type PrintavoIngestionResult = {
  orders: PrintavoOrder[];
  pagesFetched: number;
  scannedOrders: number;
  snapshotsStored: number;
  syncRunId: string;
};

type PrintavoIngestionOptions = {
  maxPages?: number;
  pageDelayMs?: number;
  perPage?: number;
  retryBaseDelayMs?: number;
};

const productionEligibilityStatusIds = new Set([
  56087, // Approved! - Payment Request Sent
]);

function toNumber(value: number | string | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function isPaidPrintavoOrder(order: PrintavoOrder) {
  if (order.stats?.paid === true) {
    return true;
  }

  const amountPaid = toNumber(order.amount_paid);
  const amountOutstanding = toNumber(order.amount_outstanding);

  if (amountPaid !== null && amountOutstanding !== null) {
    return amountPaid > 0 && amountOutstanding <= 0;
  }

  return false;
}

function isProductionEligiblePrintavoOrder(order: PrintavoOrder) {
  if (isPaidPrintavoOrder(order)) {
    return true;
  }

  const statusId = order.orderstatus?.id ?? order.orderstatus_id ?? null;

  return statusId !== null && productionEligibilityStatusIds.has(statusId);
}

function customerName(order: PrintavoOrder) {
  return (
    order.customer?.name ??
    order.customer?.full_name ??
    order.customer?.company ??
    order.user?.name ??
    null
  );
}

function toWorkflowOrder(order: PrintavoOrder): PrintavoOrderForProduction {
  return {
    id: order.id,
    amount_paid: order.amount_paid,
    due_date: order.due_date,
    invoice_number: order.visual_id,
    name: order.order_nickname ?? undefined,
    order_number: order.visual_id,
    orderstatus_id: order.orderstatus_id,
    orderstatus: {
      id: order.orderstatus?.id ?? order.orderstatus_id ?? null,
      name: order.orderstatus?.name ?? null,
    },
    paid_at: isPaidPrintavoOrder(order) ? new Date().toISOString() : null,
    status_id: order.orderstatus_id,
    customer: {
      name: customerName(order),
    },
    user: order.user,
    metadata: {
      printavo_updated_at: order.updated_at ?? null,
      stats: order.stats ?? null,
    },
  };
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unknown Printavo ingestion error.";
}

async function createSyncRun(
  supabase: SupabaseClient,
  metadata: Record<string, unknown>,
) {
  const { data, error } = await supabase
    .from("sync_runs")
    .insert({
      source: "printavo_orders",
      status: "running" satisfies SyncStatus,
      metadata,
    })
    .select("id")
    .single<{ id: string }>();

  if (error) {
    throw new Error(`Could not create Printavo sync run: ${error.message}`);
  }

  return data.id;
}

async function finishSyncRun(
  supabase: SupabaseClient,
  input: {
    errorCode?: string | null;
    errorContext?: Record<string, unknown>;
    errorMessage?: string | null;
    recordsSeen: number;
    recordsUpserted: number;
    status: SyncStatus;
    syncRunId: string;
  },
) {
  const { error } = await supabase
    .from("sync_runs")
    .update({
      error_code: input.errorCode ?? null,
      error_context: input.errorContext ?? {},
      error_message: input.errorMessage ?? null,
      finished_at: new Date().toISOString(),
      records_seen: input.recordsSeen,
      records_upserted: input.recordsUpserted,
      status: input.status,
    })
    .eq("id", input.syncRunId);

  if (error) {
    throw new Error(`Could not finish Printavo sync run: ${error.message}`);
  }
}

async function storeRawOrders(
  supabase: SupabaseClient,
  input: {
    orders: PrintavoOrder[];
    syncRunId: string;
  },
) {
  if (input.orders.length === 0) {
    return;
  }

  const fetchedAt = new Date().toISOString();
  const { error } = await supabase.from("api_raw_payloads").insert(
    input.orders.map((order) => ({
      fetched_at: fetchedAt,
      payload: order,
      source: "printavo",
      source_entity_id: String(order.id),
      source_entity_type: "order",
      sync_run_id: input.syncRunId,
    })),
  );

  if (error) {
    throw new Error(`Could not store Printavo raw payloads: ${error.message}`);
  }
}

async function existingProductionOrderIds(
  supabase: SupabaseClient,
  printavoOrderIds: number[],
) {
  if (printavoOrderIds.length === 0) {
    return new Set<number>();
  }

  const { data, error } = await supabase
    .from("production_jobs")
    .select("printavo_order_id")
    .in("printavo_order_id", printavoOrderIds)
    .returns<Array<{ printavo_order_id: number }>>();

  if (error) {
    throw new Error(`Could not check existing production jobs: ${error.message}`);
  }

  return new Set((data ?? []).map((row) => row.printavo_order_id));
}

export async function syncPrintavoOrders(
  supabase: SupabaseClient,
  {
    maxPages = 1,
    pageDelayMs = 2000,
    perPage = 10,
    retryBaseDelayMs = 5000,
  }: PrintavoIngestionOptions = {},
): Promise<PrintavoIngestionResult> {
  const syncRunId = await createSyncRun(supabase, {
    max_pages: maxPages,
    page_delay_ms: pageDelayMs,
    per_page: perPage,
    retry_base_delay_ms: retryBaseDelayMs,
    strategy: "ingestion_only",
  });
  const result: PrintavoIngestionResult = {
    orders: [],
    pagesFetched: 0,
    scannedOrders: 0,
    snapshotsStored: 0,
    syncRunId,
  };

  try {
    for (let page = 1; page <= maxPages; page += 1) {
      if (page > 1 && pageDelayMs > 0) {
        await new Promise((resolve) => {
          setTimeout(resolve, pageDelayMs);
        });
      }

      const response = await fetchPrintavoOrdersPage({
        page,
        perPage,
        retryBaseDelayMs,
        sortColumn: "updated_at",
      });
      const orders = response.data ?? [];
      result.pagesFetched = page;

      if (orders.length === 0) {
        break;
      }

      result.scannedOrders += orders.length;
      result.orders.push(...orders);
      await storeRawOrders(supabase, {
        orders,
        syncRunId,
      });
      result.snapshotsStored += orders.length;
    }

    await finishSyncRun(supabase, {
      recordsSeen: result.scannedOrders,
      recordsUpserted: result.snapshotsStored,
      status: "succeeded",
      syncRunId,
    });

    return result;
  } catch (error) {
    await finishSyncRun(supabase, {
      recordsSeen: result.scannedOrders,
      recordsUpserted: result.snapshotsStored,
      status: "failed",
      syncRunId,
      errorCode: "printavo_ingestion_failed",
      errorContext: {},
      errorMessage: errorMessage(error),
    });

    throw error;
  }
}

export async function materializeProductionJobs(
  supabase: SupabaseClient,
  {
    actorUserId,
    orders,
    productCategoryKey = "screen_printing",
  }: {
    actorUserId?: string | null;
    orders: PrintavoOrder[];
    productCategoryKey?: string;
  },
) {
  const eligibleOrders = orders.filter(isProductionEligiblePrintavoOrder);
  const existingOrderIds = await existingProductionOrderIds(
    supabase,
    eligibleOrders.map((order) => order.id),
  );
  const result = {
    createdJobs: 0,
    eligibleOrders: eligibleOrders.length,
    existingJobs: 0,
    failedOrders: [] as PrintavoProductionSyncResult["failedOrders"],
    skippedIneligibleOrders: orders.length - eligibleOrders.length,
  };

  for (const order of eligibleOrders) {
    const existedBeforeSync = existingOrderIds.has(order.id);

    try {
      await createProductionJobFromPrintavoOrder(supabase, {
        actorUserId,
        order: toWorkflowOrder(order),
        productCategoryKey,
        source: "printavo_sync",
      });

      if (existedBeforeSync) {
        result.existingJobs += 1;
      } else {
        result.createdJobs += 1;
        existingOrderIds.add(order.id);
      }
    } catch (error) {
      result.failedOrders.push({
        error: errorMessage(error),
        printavoOrderId: order.id,
      });
    }
  }

  return result;
}

// Retained production-suite entry point. The active rollout calls
// syncPrintavoOrders() directly so ingestion cannot create hidden production work.
export async function runPrintavoProductionSync(
  supabase: SupabaseClient,
  {
    actorUserId,
    maxPages = 1,
    pageDelayMs = 2000,
    perPage = 10,
    productCategoryKey = "screen_printing",
    retryBaseDelayMs = 5000,
  }: PrintavoIngestionOptions & {
    actorUserId?: string | null;
    productCategoryKey?: string;
  } = {},
): Promise<PrintavoProductionSyncResult> {
  const ingestion = await syncPrintavoOrders(supabase, {
    maxPages,
    pageDelayMs,
    perPage,
    retryBaseDelayMs,
  });
  const activation = await materializeProductionJobs(supabase, {
    actorUserId,
    orders: ingestion.orders,
    productCategoryKey,
  });

  return {
    ...activation,
    pagesFetched: ingestion.pagesFetched,
    scannedOrders: ingestion.scannedOrders,
    syncRunId: ingestion.syncRunId,
  };
}
