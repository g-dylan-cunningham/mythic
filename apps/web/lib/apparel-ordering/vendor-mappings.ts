import type { SupabaseClient } from "@supabase/supabase-js";
import { mappingKey } from "@/lib/apparel-ordering/matching-logic";
import type { PrintavoOrderLineSummary } from "@/lib/printavo/order-summary";

export type ApparelVendorLineMapping = {
  confirmed_at: string;
  confirmed_by: string | null;
  match_source:
    | "historical_confirmation"
    | "vendor_catalog"
    | "vendor_crossref";
  printavo_line_item_id: number;
  printavo_order_id: number;
  source_color: string;
  source_style_number: string;
  vendor_brand_name: string;
  vendor_color: string;
  vendor_key: string;
  vendor_part_number: string;
  vendor_style_id: string;
  vendor_style_name: string;
  vendor_variants: unknown;
};

export type ApparelVendorMappingSource =
  | "historical_confirmation"
  | "historical_reconciliation"
  | "vendor_catalog"
  | "vendor_crossref";

type ApparelVendorCatalogMappingSource =
  | ApparelVendorMappingSource
  | "human_confirmation";

export type ApparelVendorReusableMapping = {
  confidenceScore: number;
  evidenceCount: number;
  matchSource: ApparelVendorMappingSource;
  sourceColor: string;
  sourceStyleNumber: string;
  vendorBrandName: string;
  vendorColor: string;
  vendorKey: string;
  vendorPartNumber: string;
  vendorStyleId: string;
  vendorStyleName: string;
};

type ApparelVendorCatalogMapping = {
  confidence_score: number | string;
  evidence_count: number;
  mapping_source: ApparelVendorCatalogMappingSource;
  source_color: string;
  source_style_number: string;
  vendor_brand_name: string;
  vendor_color: string;
  vendor_key: string;
  vendor_part_number: string;
  vendor_style_id: string;
  vendor_style_name: string;
};

export type ApparelVendorMappingState = {
  currentByLineItemId: Map<number, ApparelVendorLineMapping>;
  historicalBySource: Map<string, ApparelVendorReusableMapping>;
};

function sourcePriority(source: ApparelVendorMappingSource) {
  switch (source) {
    case "historical_confirmation":
      return 4;
    case "historical_reconciliation":
      return 3;
    case "vendor_crossref":
      return 2;
    case "vendor_catalog":
      return 1;
  }
}

function preferMapping(
  current: ApparelVendorReusableMapping | undefined,
  candidate: ApparelVendorReusableMapping,
) {
  if (!current) {
    return candidate;
  }

  const priorityDifference =
    sourcePriority(candidate.matchSource) - sourcePriority(current.matchSource);

  if (priorityDifference !== 0) {
    return priorityDifference > 0 ? candidate : current;
  }

  if (candidate.confidenceScore !== current.confidenceScore) {
    return candidate.confidenceScore > current.confidenceScore
      ? candidate
      : current;
  }

  return candidate.evidenceCount > current.evidenceCount ? candidate : current;
}

function reusableFromLine(
  mapping: ApparelVendorLineMapping,
): ApparelVendorReusableMapping {
  return {
    confidenceScore: 1,
    evidenceCount: 1,
    matchSource: "historical_confirmation",
    sourceColor: mapping.source_color,
    sourceStyleNumber: mapping.source_style_number,
    vendorBrandName: mapping.vendor_brand_name,
    vendorColor: mapping.vendor_color,
    vendorKey: mapping.vendor_key,
    vendorPartNumber: mapping.vendor_part_number,
    vendorStyleId: mapping.vendor_style_id,
    vendorStyleName: mapping.vendor_style_name,
  };
}

function reusableFromCatalog(
  mapping: ApparelVendorCatalogMapping,
): ApparelVendorReusableMapping {
  return {
    confidenceScore: Number(mapping.confidence_score),
    evidenceCount: mapping.evidence_count,
    matchSource:
      mapping.mapping_source === "human_confirmation"
        ? "historical_confirmation"
        : mapping.mapping_source,
    sourceColor: mapping.source_color,
    sourceStyleNumber: mapping.source_style_number,
    vendorBrandName: mapping.vendor_brand_name,
    vendorColor: mapping.vendor_color,
    vendorKey: mapping.vendor_key,
    vendorPartNumber: mapping.vendor_part_number,
    vendorStyleId: mapping.vendor_style_id,
    vendorStyleName: mapping.vendor_style_name,
  };
}

export async function getApparelVendorMappingState(
  supabase: SupabaseClient,
  orderId: number,
  lineItems: PrintavoOrderLineSummary[],
  vendorKey = "ss",
): Promise<ApparelVendorMappingState> {
  const styleNumbers = Array.from(
    new Set(
      lineItems.flatMap((lineItem) =>
        lineItem.styleNumber ? [lineItem.styleNumber] : [],
      ),
    ),
  );
  const styleKeys = styleNumbers.map((styleNumber) =>
    mappingKey(styleNumber, "").split("::", 1)[0] as string,
  );

  if (styleNumbers.length === 0) {
    return {
      currentByLineItemId: new Map(),
      historicalBySource: new Map(),
    };
  }

  const [lineResult, catalogResult] = await Promise.all([
    supabase
      .from("apparel_vendor_line_mappings")
      .select(
        "printavo_order_id,printavo_line_item_id,source_style_number,source_color,vendor_key,vendor_style_id,vendor_part_number,vendor_brand_name,vendor_style_name,vendor_color,vendor_variants,match_source,confirmed_by,confirmed_at",
      )
      .eq("source_system", "printavo")
      .eq("vendor_key", vendorKey)
      .in("source_style_key", styleKeys)
      .order("confirmed_at", { ascending: false })
      .returns<ApparelVendorLineMapping[]>(),
    supabase
      .from("apparel_vendor_catalog_mappings")
      .select(
        "source_style_number,source_color,vendor_key,vendor_style_id,vendor_part_number,vendor_brand_name,vendor_style_name,vendor_color,mapping_source,confidence_score,evidence_count",
      )
      .eq("source_system", "printavo")
      .eq("vendor_key", vendorKey)
      .eq("review_status", "active")
      .in("source_style_key", styleKeys)
      .returns<ApparelVendorCatalogMapping[]>(),
  ]);

  if (lineResult.error) {
    throw new Error(
      `Could not load confirmed apparel mappings: ${lineResult.error.message}`,
    );
  }

  if (catalogResult.error) {
    throw new Error(
      `Could not load reusable apparel mappings: ${catalogResult.error.message}`,
    );
  }

  const currentByLineItemId = new Map<number, ApparelVendorLineMapping>();
  const historicalBySource = new Map<
    string,
    ApparelVendorReusableMapping
  >();

  for (const mapping of lineResult.data ?? []) {
    const key = mappingKey(
      mapping.source_style_number,
      mapping.source_color,
    );
    historicalBySource.set(
      key,
      preferMapping(historicalBySource.get(key), reusableFromLine(mapping)),
    );

    if (
      mapping.printavo_order_id === orderId &&
      !currentByLineItemId.has(mapping.printavo_line_item_id)
    ) {
      currentByLineItemId.set(mapping.printavo_line_item_id, mapping);
    }
  }

  for (const mapping of catalogResult.data ?? []) {
    const key = mappingKey(
      mapping.source_style_number,
      mapping.source_color,
    );
    historicalBySource.set(
      key,
      preferMapping(
        historicalBySource.get(key),
        reusableFromCatalog(mapping),
      ),
    );
  }

  return { currentByLineItemId, historicalBySource };
}
