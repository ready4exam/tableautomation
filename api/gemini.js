// -------------------- /api/gemini.js --------------------
import { corsHeaders } from "./_cors.js";

export const config = {
  runtime: "edge", // ✅ Fast Vercel Edge Function
};

export default async function handler(req) {
  const origin = req.headers.get("origin") || "";
  const headers = { ...corsHeaders(origin), "Content-Type": "application/json" };

  // Handle preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers });
  }

  // Only POST allowed
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Only POST method allowed" }), {
      status: 405,
      headers,
    });
  }

  // Read API key
  const apiKey = process.env.google_api;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Missing google_api environment variable" }), {
      status: 500,
      headers,
    });
  }

  // Parse request body
  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers,
    });
  }

  const { prompt, class: classValue = "9" } = body;
  if (!prompt) {
    return new Response(JSON.stringify({ error: "Missing prompt" }), {
      status: 400,
      headers,
    });
  }

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
  };

  try {
    console.log(`🧠 Gemini API call (Class ${classValue})...`);

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
        { status: response.status, headers }
      );
    }

    console.log("✅ Gemini success");
    return new Response(JSON.stringify(data), { status: 200, headers });
  } catch (err) {
    console.error("🔥 Internal Gemini error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers,
    });
  }
}
