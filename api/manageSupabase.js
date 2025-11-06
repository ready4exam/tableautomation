// -------------------- /api/manageSupabase.js --------------------
import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "./_cors.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  const headers = { ...corsHeaders(origin), "Content-Type": "application/json" };
  res.set(headers);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

  try {
    const { class: classValue, tableName, rows } = req.body;

    if (!tableName || !Array.isArray(rows) || rows.length === 0)
      return res.status(400).json({ error: "Invalid request body" });

    // Select credentials by class
    let supabaseUrl, supabaseKey;
    if (classValue === "11") {
      supabaseUrl = process.env.SUPABASE_URL_11;
      supabaseKey = process.env.SUPABASE_SERVICE_KEY_11;
    } else {
      supabaseUrl = process.env.SUPABASE_URL_9;
      supabaseKey = process.env.SUPABASE_SERVICE_KEY_9;
    }

    if (!supabaseUrl || !supabaseKey)
      throw new Error(`Missing Supabase credentials for class ${classValue}`);

    const supabase = createClient(supabaseUrl, supabaseKey);

    const createQuery = `
      CREATE TABLE IF NOT EXISTS public.${tableName} (
        id BIGSERIAL PRIMARY KEY,
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
          CREATE POLICY "Allow all access" ON public.${tableName}
          FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
        END IF;
      END $$;
    `;

    await supabase.rpc("execute_sql", { query: createQuery });

    const { error: insertError } = await supabase.from(tableName).insert(rows);
    if (insertError) throw insertError;

    console.log(`✅ Inserted ${rows.length} rows into ${tableName}`);
    return res.status(200).json({ message: `Inserted ${rows.length} rows into ${tableName}` });
  } catch (err) {
    console.error("❌ manageSupabase error:", err);
    return res.status(500).json({ error: err.message });
  }
}
