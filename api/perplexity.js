export const config = {
  runtime: "nodejs", // ⏱️ allows longer execution
};

export default async function handler(req, res) {
  try {
    const origin = req.headers.origin;
    const allowOrigin = allowedOrigins.includes(origin)
      ? origin
      : "https://ready4exam.github.io";

    // --- Handle CORS preflight ---
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", allowOrigin);
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      return res.status(200).end();
    }

    if (req.method !== "POST") {
      return res
        .status(405)
        .setHeader("Access-Control-Allow-Origin", allowOrigin)
        .json({ error: "Only POST allowed" });
    }

    // --- Parse request ---
    const { prompt } = req.body || {};
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return res
        .status(400)
        .setHeader("Access-Control-Allow-Origin", allowOrigin)
        .json({ error: "Missing or invalid 'prompt'" });
    }

    // --- Check API key ---
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
      console.error("❌ Missing PERPLEXITY_API_KEY");
      return res
        .status(500)
        .setHeader("Access-Control-Allow-Origin", allowOrigin)
        .json({ error: "Server misconfiguration" });
    }

    // --- Build request to Perplexity ---
    const payload = {
      model: "sonar-pro",
      messages: [
        {
          role: "system",
          content:
            "You are an education data assistant. Return clean JSON, CSV, or lists only — no markdown.",
        },
        { role: "user", content: prompt.trim() },
      ],
    };

    console.log("🧠 Sending to Perplexity:", prompt.slice(0, 80) + "...");

    const perplexityRes = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const text = await perplexityRes.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      console.warn("⚠️ Non-JSON from Perplexity:", text);
      data = { raw: text };
    }

    if (!perplexityRes.ok) {
      console.error("❌ Perplexity error:", data);
      return res
        .status(perplexityRes.status)
        .setHeader("Access-Control-Allow-Origin", allowOrigin)
        .json({ error: "Perplexity API failed", data });
    }

    res
      .status(200)
      .setHeader("Access-Control-Allow-Origin", allowOrigin)
      .json(data);
  } catch (err) {
    console.error("🔥 Internal error:", err);
    res
      .status(500)
      .setHeader("Access-Control-Allow-Origin", "https://ready4exam.github.io")
      .json({ error: err.message });
  }
}
