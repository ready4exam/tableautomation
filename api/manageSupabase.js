// File: /api/manageSupabase.js
import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  try {
    const { class: classValue, tableName, rows } = req.body || {};

    if (!tableName || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "Invalid request body" });
    }

    // 🧭 Choose Supabase credentials dynamically based on class
    let supabaseUrl, supabaseKey;

    if (String(classValue) === "11") {
      supabaseUrl = process.env.SUPABASE_URL_11;
      supabaseKey = process.env.SUPABASE_SERVICE_KEY_11;
    } else {
      // default for class 9 or others
      supabaseUrl = process.env.SUPABASE_URL_9;
      supabaseKey = process.env.SUPABASE_SERVICE_KEY_9;
    }

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(`Missing Supabase credentials for class ${classValue}`);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // ✅ Step 1: Ensure table exists with proper schema
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
          SELECT 1 FROM pg_policies WHERE tablename = '${tableName}' AND policyname = 'Allow all select'
        ) THEN
          CREATE POLICY "Allow all select" ON public.${tableName} FOR SELECT USING (true);
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = '${tableName}' AND policyname = 'Allow all insert'
        ) THEN
          CREATE POLICY "Allow all insert" ON public.${tableName} FOR INSERT WITH CHECK (true);
        END IF;
      END $$;
    `;

    // Some Supabase projects lack execute_sql RPC — fallback safely
    const { error: ddlError } =
      (await supabase.rpc("execute_sql", { query: createQuery })) ||
      (await supabase.from("pg_catalog.pg_tables").select("*")); // safe dummy fallback

    if (ddlError) console.warn("⚠️ Table DDL warning:", ddlError.message);

    // ✅ Step 2: Insert quiz rows
    const { error: insertError } = await supabase.from(tableName).insert(rows);
    if (insertError) throw insertError;

    console.log(`✅ Inserted ${rows.length} rows into ${tableName} for class ${classValue}`);
    return res.status(200).json({
      success: true,
      message: `✅ ${rows.length} rows inserted into ${tableName} (class ${classValue})`,
    });
  } catch (err) {
    console.error("❌ manageSupabase error:", err);
    return res.status(500).json({ error: err.message });
  }
}
