import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { canAccessFeature } from "@/lib/features/feature-flags";
import { migratedTools } from "@/lib/tools/catalog";
import { PricingTool } from "@/app/tool/pricing-tool";

export const metadata: Metadata = {
  title: "Mythic Tools",
  robots: { index: false, follow: false },
};

export default async function ToolPage({ params }: { params: Promise<{ toolName: string }> }) {
  const { profile, user } = await getCurrentProfile();
  const { toolName } = await params;
  const tool = migratedTools.find((item) => item.name === toolName);
  if (!tool) notFound();
  if (!canAccessFeature(profile, tool.feature)) redirect("/dashboard");
  switch (tool.name) {
    case "pricing": return <PricingTool userId={user.id} />;
    default: notFound();
  }
}
