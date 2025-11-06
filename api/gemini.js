// -------------------- /api/gemini.js --------------------
import { corsHeaders } from "./_cors.js";

export const config = {
  runtime: "nodejs", // ✅ Use Node.js to prevent timeouts and missing CORS on failure
};

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  const headers = { ...corsHeaders(origin), "Content-Type": "application/json" };

  // Preflight (CORS OPTIONS)
  if (req.method === "OPTIONS") {
    return res.status(200).set(headers).end();
  }

  // Restrict to POST only
  if (req.method !== "POST") {
    return res.status(405).set(headers).json({ error: "Only POST method allowed" });
  }

  const apiKey = process.env.google_api;
  if (!apiKey) {
    return res.status(500).set(headers).json({ error: "Missing google_api environment variable" });
  }

  let body;
  try {
    body = req.body;
  } catch {
    return res.status(400).set(headers).json({ error: "Invalid JSON body" });
  }

  const { prompt, class: classValue = "9" } = body;
  if (!prompt) {
    return res.status(400).set(headers).json({ error: "Missing prompt" });
  }

  const payload = { contents: [{ parts: [{ text: prompt }] }] };

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
      return res.status(response.status).set(headers).json({
        error: "Gemini API failed",
        data,
      });
    }

    console.log("✅ Gemini success");
    return res.status(200).set(headers).json(data);
  } catch (err) {
    console.error("🔥 Internal Gemini error:", err);
    return res.status(500).set(headers).json({ error: err.message });
  }
}
