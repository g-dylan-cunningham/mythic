"use server";

import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { canViewReports } from "@/lib/auth/roles";
import { runPrintavoProductionSync } from "@/lib/printavo/production-sync";
import { createClient } from "@/utils/supabase/server";

export async function runManualPrintavoProductionSync() {
  const { profile, user } = await getCurrentProfile();

  if (!profile || !profile.is_active || !canViewReports(profile.role)) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  let redirectUrl = "/reporting/printavo-sync";

  try {
    const result = await runPrintavoProductionSync(supabase, {
      actorUserId: user.id,
      maxPages: 1,
      pageDelayMs: 2500,
      perPage: 10,
      retryBaseDelayMs: 5000,
    });

    redirectUrl = `/reporting/printavo-sync?created=${result.createdJobs}&existing=${result.existingJobs}&scanned=${result.scannedOrders}&paid=${result.paidOrders}&syncRunId=${result.syncRunId}`;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Printavo sync error.";

    redirectUrl = `/reporting/printavo-sync?error=${encodeURIComponent(message)}`;
  }

  redirect(redirectUrl);
}
