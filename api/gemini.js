// -------------------- /api/gemini.js --------------------
import { corsHeaders } from "./_cors.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  const headers = { ...corsHeaders(origin), "Content-Type": "application/json" };
  res.set(headers);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

  const apiKey = process.env.google_api;
  if (!apiKey) return res.status(500).json({ error: "Missing google_api environment variable" });

  let body;
  try {
    body =
      req.body && Object.keys(req.body).length
        ? req.body
        : JSON.parse(await new Promise((r, rej) => {
            let raw = "";
            req.on("data", (c) => (raw += c));
            req.on("end", () => r(raw || "{}"));
            req.on("error", rej);
          }));
  } catch {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  const { prompt, class: classValue = "9" } = body;
  if (!prompt) return res.status(400).json({ error: "Missing prompt" });

  const payload = { contents: [{ parts: [{ text: prompt }] }] };

  try {
    console.log(`🧠 Gemini request for Class ${classValue}`);
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
    const data = JSON.parse(text || "{}");

    if (!response.ok) {
      console.error("❌ Gemini API error:", data);
      return res.status(response.status).json({ error: "Gemini API failed", data });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error("🔥 Gemini error:", err);
    return res.status(500).json({ error: err.message });
  }
}
