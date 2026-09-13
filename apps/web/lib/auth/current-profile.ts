import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import type { Profile } from "@/lib/auth/roles";

export const getCurrentProfile = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,email,full_name,role,department,authority_level,is_active")
    .eq("id", user.id)
    .single<Profile>();

  return {
    profile,
    user,
  };
});
