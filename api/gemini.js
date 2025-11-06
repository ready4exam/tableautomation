// File: /api/gemini.js
export const config = {
  runtime: "edge", // Fast Vercel Edge Function
};

export default async function handler(req) {
  // ✅ Allow all current known frontends
  const allowedOrigins = [
    "https://ready4exam.github.io",
    "https://ready4exam.github.io/ninth",
    "https://tableautomation-5iuc-git-main-ready4exams-projects.vercel.app",
    "https://ready4exam-master-automation.vercel.app",
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
    return new Response(JSON.stringify({ error: "Only POST allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const apiKey = process.env.google_api;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Missing google_api key" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { prompt, tableName, rows, class: classValue = "9" } = body || {};
  if (!prompt) {
    return new Response(JSON.stringify({ error: "Missing prompt" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const payload = { contents: [{ parts: [{ text: prompt }] }] };

  try {
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
      return new Response(JSON.stringify({ error: "Gemini API failed", data }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ✅ Optional forwarding to Supabase manager
    if (rows?.length && tableName) {
      const url = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}/api/manageSupabase`
        : "http://localhost:3000/api/manageSupabase";

      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ class: classValue, tableName, rows }),
      });
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}
