// File: /api/manageSupabase.js
import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  const allowedOrigins = [
    "https://ready4exam.github.io",
    "https://tableautomation-5iuc-git-main-ready4exams-projects.vercel.app",
    "https://ready4exam-master-automation.vercel.app",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
  ];

  const origin = req.headers.origin;
  const corsHeaders = {
    "Access-Control-Allow-Origin": allowedOrigins.includes(origin)
      ? origin
      : "https://ready4exam.github.io",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  // ✅ Handle preflight OPTIONS request
  if (req.method === "OPTIONS") {
    return res.status(200).set(corsHeaders).end();
  }

  if (req.method !== "POST") {
    return res.status(405).set(corsHeaders).json({ error: "Only POST allowed" });
  }

  try {
    const { class: classValue, tableName, rows } = req.body || {};

    if (!tableName || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).set(corsHeaders).json({ error: "Invalid request body" });
    }

    // 🧭 Choose Supabase credentials based on class
    let supabaseUrl, supabaseKey;

    if (classValue === "11") {
      supabaseUrl = process.env.SUPABASE_URL_11;
      supabaseKey = process.env.SUPABASE_SERVICE_KEY_11;
    } else {
      supabaseUrl = process.env.SUPABASE_URL_9;
      supabaseKey = process.env.SUPABASE_SERVICE_KEY_9;
    }

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(`Missing Supabase credentials for class ${classValue}`);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // ✅ Ensure table exists with RLS and policy
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
          CREATE POLICY "Enable all access" ON public.${tableName}
          FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
        END IF;
      END $$;
    `;
    await supabase.rpc("execute_sql", { query: createQuery });

    // ✅ Insert rows
    const { error: insertError } = await supabase.from(tableName).insert(rows);
    if (insertError) throw insertError;

    console.log(`✅ Inserted ${rows.length} rows into ${tableName} for class ${classValue}`);
    return res.status(200).set(corsHeaders).json({
      message: `✅ ${rows.length} rows inserted into ${tableName} (class ${classValue})`,
    });
  } catch (err) {
    console.error("❌ manageSupabase error:", err);
    return res.status(500).set(corsHeaders).json({ error: err.message });
  }
}
