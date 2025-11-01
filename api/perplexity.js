// /api/perplexity.js

export const config = {
  runtime: "edge", // fast, lightweight
};

export default async function handler(req) {
  // --- CORS setup ---
  const allowedOrigins = [
    "https://ready4exam.github.io",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
  ];
  const origin = req.headers.get("origin");
  const corsHeaders = {
    "Access-Control-Allow-Origin": allowedOrigins.includes(origin)
      ? origin
      : "https://ready4exam.github.io",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // --- Parse body safely ---
  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { prompt } = body || {};
  if (!prompt || typeof prompt !== "string") {
    return new Response(JSON.stringify({ error: "Missing or invalid 'prompt'" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // --- Ensure key exists ---
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    console.error("❌ Missing PERPLEXITY_API_KEY in environment");
    return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // --- Call Perplexity API ---
  try {
    const perplexityRes = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-sonar-small-128k-online",
        messages: [
          {
            role: "system",
            content: "You are an educational assistant. Return JSON arrays or plain lists only.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    const text = await perplexityRes.text();
    let data = {};
    try {
      data = JSON.parse(text);
    } catch {
      console.error("⚠️ Non-JSON Perplexity response:", text);
      return new Response(JSON.stringify({ raw: text }), {
        status: perplexityRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!perplexityRes.ok) {
      console.error("❌ Perplexity API Error:", data);
      return new Response(JSON.stringify({ error: "Perplexity API failed", data }), {
        status: perplexityRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("🔥 Unexpected error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}
