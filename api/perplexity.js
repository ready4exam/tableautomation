export default async function handler(req, res) {
  // ✅ Handle CORS (for browser access)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end(); // Preflight check
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    // ✅ Validate input
    const { prompt } = req.body || {};
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Missing or invalid 'prompt' in request body" });
    }

    console.log("🧠 Prompt received:", prompt.slice(0, 120) + "...");

    // ✅ Call Perplexity API
    const r = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.PPLX_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-sonar-small-128k-online",
        messages: [
          {
            role: "system",
            content:
              "You are a structured data assistant. Always return pure JSON or CSV with no explanations.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    const text = await r.text();

    if (!r.ok) {
      console.error("❌ Perplexity API Error:", text);
      return res.status(500).json({ error: "Perplexity API failed", details: text });
    }

    // ✅ Return raw text (JSON or CSV)
    return res.status(200).send(text);
  } catch (err) {
    console.error("🔥 Server error:", err);
    return res.status(500).json({ error: err.message || "Server failure" });
  }
}
