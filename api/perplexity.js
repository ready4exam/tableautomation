// File: /api/perplexity.js

export const config = {
  runtime: "edge", // lightweight & fast execution
};

export default async function handler(req) {
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

  // --- Handle CORS preflight ---
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // --- Reject invalid methods ---
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Only POST allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // --- Parse request safely ---
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
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return new Response(JSON.stringify({ error: "Missing or invalid 'prompt'" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // --- Ensure API key exists ---
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    console.error("❌ Missing PERPLEXITY_API_KEY in environment variables");
    return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // --- Build the Perplexity API payload ---
  const payload = {
    model: "sonar-pro", // 🔥 using the requested PRO model
    messages: [
      {
        role: "system",
        content:
          "You are an education data assistant. Return clean, structured JSON or lists — no markdown or extra text.",
      },
      { role: "user", content: prompt.trim() },
    ],
  };

  try {
    console.log("🧠 Sending request to Perplexity (sonar-pro)...");

    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      console.warn("⚠️ Non-JSON response from Perplexity:", text);
      data = { raw: text };
    }

    if (!response.ok) {
      console.error("❌ Perplexity API Error:", data);
      return new Response(JSON.stringify({ error: "Perplexity API failed", data }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("✅ Success:", response.status);
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
