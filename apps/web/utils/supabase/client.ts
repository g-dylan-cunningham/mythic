import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "./config";

export const createClient = () => {
  const { publishableKey, url } = getSupabaseConfig();

  return createBrowserClient(url, publishableKey);
};
