// File: /api/gemini.js
export const config = {
  runtime: "edge", // Deployed as Vercel Edge Function
};

export default async function handler(req) {
  const allowedOrigins = [
    "https://ready4exam.github.io",
    "https://ready4exam-master-automation.vercel.app",
    "http://localhost:5500",
    "http://127.0.0.1:5500"
  ];

  const origin = req.headers.get("origin");
  const corsHeaders = {
    "Access-Control-Allow-Origin": allowedOrigins.includes(origin)
      ? origin
      : "https://ready4exam.github.io",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  // ✅ Handle CORS preflight correctly
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Only POST allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const apiKey = process.env.google_api;
  if (!apiKey) {
    console.error("❌ Missing google_api key in environment");
    return new Response(JSON.stringify({ error: "Missing API key" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ✅ Parse body safely
  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { prompt, class: classValue = "9", tableName, rows = [] } = body || {};
  if (!prompt) {
    return new Response(JSON.stringify({ error: "Missing prompt" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const payload = { contents: [{ parts: [{ text: prompt }] }] };

  try {
    console.log(`🧠 Gemini request for Class ${classValue}...`);

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(payload),
      }
    );

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      console.error("❌ Gemini API Error:", data);
      return new Response(
        JSON.stringify({ error: "Gemini API failed", data }),
        {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ✅ Forward to manageSupabase if rows provided
    if (rows.length > 0 && tableName) {
      console.log(`📤 Forwarding ${rows.length} rows to manageSupabase for class ${classValue}`);
      try {
        await fetch("https://ready4exam-master-automation.vercel.app/api/manageSupabase", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ class: classValue, tableName, rows }),
        });
      } catch (e) {
        console.warn("⚠️ manageSupabase forward failed:", e.message);
      }
    }

    console.log("✅ Gemini success");
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("🔥 Internal error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}
