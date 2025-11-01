// /api/perplexity.js
export default async function handler(req, res) {
  // --- Allow CORS for GitHub Pages + localhost ---
  res.setHeader("Access-Control-Allow-Origin", "https://ready4exam.github.io");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { prompt } = req.body || {};
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Missing or invalid prompt" });
    }

    // --- Call Perplexity API ---
    const perplexityRes = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-sonar-small-128k-online",
        messages: [
          { role: "system", content: "You are a helpful assistant for educational data extraction. Return structured JSON or plain text." },
          { role: "user", content: prompt },
        ],
      }),
    });

    // --- Handle HTTP or JSON parsing errors safely ---
    let data = null;
    try {
      data = await perplexityRes.json();
    } catch {
      return res.status(500).json({ error: "Perplexity returned invalid JSON" });
    }

    if (!perplexityRes.ok) {
      console.error("❌ Perplexity API error:", data);
      return res.status(500).json({
        error: "Perplexity API call failed",
        status: perplexityRes.status,
        details: data,
      });
    }

    console.log("✅ Success:", data);
    return res.status(200).json(data);
  } catch (err) {
    console.error("🔥 Server error:", err);
    return res.status(500).json({
      error: "Server error",
      message: err.message,
      stack: err.stack,
    });
  }
}
