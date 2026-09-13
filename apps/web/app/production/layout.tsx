import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { canAccessFeature } from "@/lib/features/feature-flags";

export default async function ProductionLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { profile } = await getCurrentProfile();

  if (!canAccessFeature(profile, "productionSuite")) {
    redirect("/dashboard");
  }

  return children;
}
