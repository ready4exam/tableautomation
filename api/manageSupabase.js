// /api/manageSupabase.js
import { createClient } from "@supabase/supabase-js";

// ✅ Force Node runtime on Vercel
export const config = {
  runtime: "nodejs20.x",
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  const { tableName, rows } = req.body || {};
  if (!tableName || !Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: "Invalid request body" });
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    // 🧱 1️⃣ Build CREATE TABLE SQL (safe, idempotent)
    const createSQL = `
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

    // 🧩 2️⃣ Try to execute via RPC; fallback if not available
    try {
      const { error: execError } = await supabase.rpc("execute_sql", { query: createSQL });
      if (execError) {
        console.warn("RPC execute_sql not available, fallback to fetch:", execError.message);
        await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/execute_sql`, {
          method: "POST",
          headers: {
            apikey: process.env.SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: createSQL }),
        });
      }
    } catch (rpcError) {
      console.warn("⚠️ RPC call skipped:", rpcError.message);
    }

    // 🧮 3️⃣ Insert rows
    const { error: insertError } = await supabase.from(tableName).insert(rows);
    if (insertError) throw insertError;

    console.log(`✅ ${rows.length} rows inserted into ${tableName}`);
    return res.status(200).json({
      message: `✅ ${rows.length} rows inserted into ${tableName}`,
    });
  } catch (err) {
    console.error("❌ manageSupabase error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
