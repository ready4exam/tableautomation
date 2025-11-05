// /api/manageSupabase.js
import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  try {
    const { class: className, tableName, rows } = req.body;

    if (!className || !tableName || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "Missing or invalid parameters" });
    }

    // 🧭 Pick Supabase credentials based on class
    let SUPABASE_URL, SUPABASE_SERVICE_KEY;
    switch (className) {
      case "9":
        SUPABASE_URL = process.env.SUPABASE_URL_9;
        SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY_9;
        break;
      case "11":
        SUPABASE_URL = process.env.SUPABASE_URL_11;
        SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY_11;
        break;
      default:
        return res.status(400).json({ error: `Unsupported class: ${className}` });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // 1️⃣ Create table if not exists
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

    // Execute using RPC helper (optional — depends on your setup)
    const { error: execError } = await supabase.rpc("execute_sql", { query: createQuery });
    if (execError) throw execError;

    // 2️⃣ Insert rows
    const { error: insertError } = await supabase.from(tableName).insert(rows);
    if (insertError) throw insertError;

    console.log(`✅ Inserted ${rows.length} rows into ${tableName} (Class ${className})`);
    return res.status(200).json({
      message: `✅ ${rows.length} rows inserted into ${tableName} (Class ${className})`,
    });

  } catch (err) {
    console.error("❌ manageSupabase error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
