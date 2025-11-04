import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  const { tableName, rows } = req.body;
  if (!tableName || !Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: "Invalid request body" });
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    // 1️⃣ Create table using RPC helper
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

    const { error: execError } = await supabase.rpc("execute_sql", { query: createQuery });
    if (execError) throw execError;

    // 2️⃣ Insert rows
    const { error: insertError } = await supabase.from(tableName).insert(rows);
    if (insertError) throw insertError;

    console.log(`✅ Inserted ${rows.length} rows into ${tableName}`);
    return res.status(200).json({ message: `✅ ${rows.length} rows inserted into ${tableName}` });
  } catch (err) {
    console.error("❌ manageSupabase error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
