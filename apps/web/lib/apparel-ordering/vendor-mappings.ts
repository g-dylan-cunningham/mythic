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

export type ApparelVendorMappingState = {
  currentByLineItemId: Map<number, ApparelVendorLineMapping>;
  historicalBySource: Map<string, ApparelVendorLineMapping>;
};

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

  if (styleNumbers.length === 0) {
    return {
      currentByLineItemId: new Map(),
      historicalBySource: new Map(),
    };
  }

  const { data, error } = await supabase
    .from("apparel_vendor_line_mappings")
    .select(
      "printavo_order_id,printavo_line_item_id,source_style_number,source_color,vendor_key,vendor_style_id,vendor_part_number,vendor_brand_name,vendor_style_name,vendor_color,vendor_variants,match_source,confirmed_by,confirmed_at",
    )
    .eq("source_system", "printavo")
    .eq("vendor_key", vendorKey)
    .in("source_style_number", styleNumbers)
    .order("confirmed_at", { ascending: false })
    .returns<ApparelVendorLineMapping[]>();

  if (error) {
    throw new Error(`Could not load confirmed apparel mappings: ${error.message}`);
  }

  const currentByLineItemId = new Map<number, ApparelVendorLineMapping>();
  const historicalBySource = new Map<string, ApparelVendorLineMapping>();

  for (const mapping of data ?? []) {
    const key = mappingKey(
      mapping.source_style_number,
      mapping.source_color,
    );

    if (!historicalBySource.has(key)) {
      historicalBySource.set(key, mapping);
    }

    if (
      mapping.printavo_order_id === orderId &&
      !currentByLineItemId.has(mapping.printavo_line_item_id)
    ) {
      currentByLineItemId.set(mapping.printavo_line_item_id, mapping);
    }
  }

  return { currentByLineItemId, historicalBySource };
}
