// /api/manageSupabase.js
import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  console.log("🚀 manageSupabase function started");
  console.log("🧩 Env URL:", process.env.SUPABASE_URL);

  try {
    // initialize Supabase client
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    console.log("🔑 Supabase client created");

    // set a timeout in case Supabase is slow
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    // try fetching any table list to verify connection
    const { data, error } = await supabase
      .from("pg_tables")
      .select("tablename")
      .limit(1)
      .abortSignal(controller.signal);

    clearTimeout(timer);

    if (error) throw error;
    console.log("✅ Supabase connection OK");
    return res.status(200).json({
      ok: true,
      first_table: data?.[0]?.tablename || "none",
    });
  } catch (err) {
    console.error("❌ Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
