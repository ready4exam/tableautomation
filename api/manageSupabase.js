  // /api/manageSupabase.js
import { createClient } from "@supabase/supabase-js";

export const config = {
  runtime: "nodejs", // edge runtime = faster, free
};

export default async function handler(req) {
   console.log("🚀 manageSupabase function started");  // <-- add
  console.log("🧩 Env URL:", process.env.SUPABASE_URL); // <-- add
  
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Only POST allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 🔑 use your Supabase environment variables (set in Vercel)
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // service role key (secure)
  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: "Missing Supabase credentials" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { tableName, rows } = body || {};
  if (!tableName || !Array.isArray(rows) || rows.length === 0) {
    return new Response(JSON.stringify({ error: "Missing tableName or rows" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 1️⃣ create table if not exists
  const sql = `
    CREATE TABLE IF NOT EXISTS public.${tableName} (
      id SERIAL PRIMARY KEY,
      difficulty TEXT,
      question_type TEXT,
      question_text TEXT,
      scenario_reason_text TEXT,
      option_a TEXT,
      option_b TEXT,
      option_c TEXT,
      option_d TEXT,
      correct_answer_key TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
    ALTER TABLE public.${tableName} ENABLE ROW LEVEL SECURITY;
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = '${tableName}'
      ) THEN
        CREATE POLICY "Enable read for all" ON public.${tableName}
        FOR SELECT TO public USING (true);
      END IF;
    END $$;
  `;

  try {
    // call SQL RPC (must exist in your Supabase project)
    const { error: sqlError } = await supabase.rpc("execute_sql", { query: sql });
    if (sqlError) throw sqlError;

    // 2️⃣ insert rows
    const { error: insertError } = await supabase.from(tableName).insert(rows);
    if (insertError) throw insertError;

    return new Response(
      JSON.stringify({ message: `✅ ${rows.length} rows inserted into ${tableName}` }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("manageSupabase error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}
