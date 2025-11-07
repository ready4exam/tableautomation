// js/supabaseClient.js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/esm/supabase.min.js";

// Public (safe) keys for client-side verification only
const SUPABASE_URL =
  window.NEXT_PUBLIC_SUPABASE_URL || "https://your-supabase-url.supabase.co";
const SUPABASE_ANON_KEY =
  window.NEXT_PUBLIC_SUPABASE_ANON_KEY || "your-anon-key";

// Create Supabase client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Optional: verify if a table exists or get row count
export async function verifyTable(tableName) {
  try {
    const { data, error } = await supabase.from(tableName).select("*", { count: "exact", head: true });
    if (error) throw error;
    console.log(`✅ Verified table: ${tableName}, rows: ${data?.length || 0}`);
    return data?.length || 0;
  } catch (err) {
    console.error(`❌ Error verifying table: ${err.message}`);
    return 0;
  }
}
