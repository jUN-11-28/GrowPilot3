"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabasePublishableKey, supabaseUrl } from "@/lib/env";
import type { Database } from "@/lib/types/database";

export function createClient() {
  return createBrowserClient<Database>(supabaseUrl(), supabasePublishableKey());
}
