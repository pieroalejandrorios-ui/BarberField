"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./config";
import type { Database } from "./database.types";

let client: SupabaseClient<Database> | undefined;

// Conserva la API existente y comparte la sesión mediante cookies con el servidor.
export function getSupabaseClient(): SupabaseClient<Database> {
  if (client) return client;

  const { url, key } = getSupabaseConfig();
  client = createBrowserClient<Database>(url, key);
  return client;
}

export const createClient = getSupabaseClient;
