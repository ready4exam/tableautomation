// File: /api/manageSupabase.js
import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  try {
    const { class: classValue, tableName, rows } = req.body;

    if (!tableName || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "Invalid request body" });
    }

    // 🧭 Choose Supabase credentials based on class
    let supabaseUrl, supabaseKey;

    if (classValue === "11") {
      supabaseUrl = process.env.SUPABASE_URL_11;
      supabaseKey = process.env.SUPABASE_SERVICE_KEY_11;
    } else {
      // default to class 9
      supabaseUrl = process.env.SUPABASE_URL_9;
      supabaseKey = process.env.SUPABASE_SERVICE_KEY_9;
    }

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(`Missing Supabase credentials for class ${classValue}`);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // ✅ Ensure table exists before inserting
    const createQuery = `
      create table if not exists public.${tableName} (
        id bigserial primary key,
        difficulty text,
        question_type text,
        question_text text,
        option_a text,
        option_b text,
        option_c text,
        option_d text,
        correct_answer_key text
      );
    `;
    await supabase.rpc("execute_sql", { query: createQuery });

    // ✅ Insert rows
    const { error: insertError } = await supabase.from(tableName).insert(rows);
    if (insertError) throw insertError;

    console.log(`✅ Inserted ${rows.length} rows into ${tableName} for class ${classValue}`);
    return res.status(200).json({
      message: `✅ ${rows.length} rows inserted into ${tableName} (class ${classValue})`,
    });
  } catch (err) {
    console.error("❌ manageSupabase error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
