// File: /api/perplexity.js
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Only POST allowed" });
    }

    const { prompt } = req.body || {};
    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: "Missing prompt text" });
    }

    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
      console.error("❌ Missing Perplexity API key");
      return res.status(500).json({ error: "Missing Perplexity API key" });
    }

    // ✅ Safe, clean request payload
    const perplexityReq = {
      model: "sonar-pro",
      messages: [
        {
          role: "system",
          content:
            "You are an assistant that outputs structured JSON or CSV as instructed. Do not include markdown or explanations.",
        },
        {
          role: "user",
          content: prompt.trim(),
        },
      ],
    };

    const perplexityRes = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(perplexityReq),
    });

    const text = await perplexityRes.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!perplexityRes.ok) {
      console.error("❌ Perplexity error:", text);
      return res.status(perplexityRes.status).json({
        error: "Perplexity API error",
        status: perplexityRes.status,
        body: text,
      });
    }

    res.status(200).json(data);
  } catch (err) {
    console.error("🔥 Internal server error:", err);
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
}
