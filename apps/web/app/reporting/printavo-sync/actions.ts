"use server";

import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { canAccessFeature } from "@/lib/features/feature-flags";
import { syncPrintavoOrders } from "@/lib/printavo/production-sync";
import { createClient } from "@/utils/supabase/server";

export async function runManualPrintavoFetch() {
  const { profile } = await getCurrentProfile();

  if (!canAccessFeature(profile, "printavoFetching")) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  let redirectUrl = "/reporting/printavo-sync";

  try {
    const result = await syncPrintavoOrders(supabase, {
      maxPages: 1,
      pageDelayMs: 2500,
      perPage: 10,
      retryBaseDelayMs: 5000,
    });

    redirectUrl = `/reporting/printavo-sync?scanned=${result.scannedOrders}&snapshots=${result.snapshotsStored}&pages=${result.pagesFetched}&syncRunId=${result.syncRunId}`;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Printavo sync error.";

    redirectUrl = `/reporting/printavo-sync?error=${encodeURIComponent(message)}`;
  }

  redirect(redirectUrl);
}
