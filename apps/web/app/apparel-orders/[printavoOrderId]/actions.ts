"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { apparelOrderingRollout } from "@/lib/apparel-ordering/rollout";
import { getApparelVendorMappingState } from "@/lib/apparel-ordering/vendor-mappings";
import { getSsLineSuggestions } from "@/lib/apparel-ordering/ss-matching";
import { canAccessFeature } from "@/lib/features/feature-flags";
import {
  getApparelOrderReadiness,
  isSourceableApparelLine,
} from "@/lib/printavo/order-summary";
import { refreshPrintavoOrder } from "@/lib/printavo/recent-orders";
import { createClient } from "@/utils/supabase/server";

function matchingUrl(
  orderId: number,
  result: "confirmed" | "error" | "protected",
) {
  return `/apparel-orders/${orderId}?supplier=ss&result=${result}`;
}

export async function confirmSsLineMapping(
  orderId: number,
  lineItemId: number,
) {
  if (
    !Number.isSafeInteger(orderId) ||
    orderId <= 0 ||
    !Number.isSafeInteger(lineItemId) ||
    lineItemId <= 0
  ) {
    redirect("/dashboard");
  }

  const { profile, user } = await getCurrentProfile();

  if (!canAccessFeature(profile, "apparelOrdering")) {
    redirect("/dashboard");
  }

  if (!apparelOrderingRollout.mappingConfirmationsEnabled) {
    redirect(matchingUrl(orderId, "protected"));
  }

  const supabase = await createClient();
  const refresh = await refreshPrintavoOrder(supabase, orderId);

  if (!refresh.fresh || !refresh.order) {
    redirect(matchingUrl(orderId, "error"));
  }

  const readiness = getApparelOrderReadiness(refresh.order);
  const lineItem = refresh.order.lineItems.find(
    (item) => item.lineItemId === lineItemId && isSourceableApparelLine(item),
  );

  if (!readiness.eligible || !lineItem?.styleNumber || !lineItem.color) {
    redirect(matchingUrl(orderId, "error"));
  }

  const mappingState = await getApparelVendorMappingState(
    supabase,
    orderId,
    [lineItem],
  );
  const matches = await getSsLineSuggestions(
    [lineItem],
    mappingState.historicalBySource,
  );
  const suggestion = matches.get(lineItemId)?.suggestion;

  if (!suggestion) {
    redirect(matchingUrl(orderId, "error"));
  }

  const confirmedAt = new Date().toISOString();
  const { error } = await supabase.from("apparel_vendor_line_mappings").upsert(
    {
      confirmed_at: confirmedAt,
      confirmed_by: user.id,
      match_source: "historical_confirmation",
      printavo_line_item_id: lineItemId,
      printavo_order_id: orderId,
      source_color: lineItem.color,
      source_style_number: lineItem.styleNumber,
      source_system: "printavo",
      vendor_brand_name: suggestion.supplierBrandName,
      vendor_color: suggestion.supplierColor,
      vendor_key: "ss",
      vendor_part_number: suggestion.supplierPartNumber,
      vendor_style_id: suggestion.supplierStyleId,
      vendor_style_name: suggestion.supplierStyleName,
      vendor_variants: suggestion.variants,
    },
    { onConflict: "printavo_order_id,printavo_line_item_id,vendor_key" },
  );

  if (error) {
    redirect(matchingUrl(orderId, "error"));
  }

  const { error: catalogError } = await supabase
    .from("apparel_vendor_catalog_mappings")
    .upsert(
      {
        confidence_score: 1,
        evidence: {
          printavo_line_item_id: lineItemId,
          printavo_order_id: orderId,
          source: "apparel_order_confirmation",
          variants: suggestion.variants,
        },
        evidence_count: 1,
        mapping_source: "human_confirmation",
        review_status: "active",
        reviewed_at: confirmedAt,
        reviewed_by: user.id,
        source_color: lineItem.color,
        source_style_number: lineItem.styleNumber,
        source_system: "printavo",
        vendor_brand_name: suggestion.supplierBrandName,
        vendor_color: suggestion.supplierColor,
        vendor_key: "ss",
        vendor_part_number: suggestion.supplierPartNumber,
        vendor_style_id: suggestion.supplierStyleId,
        vendor_style_name: suggestion.supplierStyleName,
      },
      {
        onConflict:
          "source_system,vendor_key,source_style_key,source_color_key",
      },
    );

  if (catalogError) {
    await supabase.from("audit_logs").insert({
      action: "apparel.catalog_mapping.failed",
      actor_user_id: user.id,
      entity_id: `${orderId}:${lineItemId}:ss`,
      entity_type: "apparel_vendor_catalog_mapping",
      metadata: { error: catalogError.message },
    });
    redirect(matchingUrl(orderId, "error"));
  }

  await supabase.from("audit_logs").insert({
    action: "apparel.vendor_mapping.confirmed",
    actor_user_id: user.id,
    entity_id: `${orderId}:${lineItemId}:ss`,
    entity_type: "apparel_vendor_line_mapping",
    metadata: {
      source_color: lineItem.color,
      source_style_number: lineItem.styleNumber,
      vendor_color: suggestion.supplierColor,
      vendor_key: "ss",
      vendor_part_number: suggestion.supplierPartNumber,
      vendor_skus: suggestion.variants.map((variant) => variant.sku),
    },
  });

  revalidatePath(`/apparel-orders/${orderId}`);
  redirect(matchingUrl(orderId, "confirmed"));
}
