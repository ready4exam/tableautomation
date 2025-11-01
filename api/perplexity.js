// api/perplexity.js
export default async (req, res) => {
  // --- Allow preflight CORS ---
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { prompt } = req.body || {};
    if (!prompt)
      return res.status(400).json({ error: "Missing 'prompt' in body" });

    // --- Call Perplexity API ---
    const r = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.PPLX_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "sonar-small-online",
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant that returns structured JSON or CSV only as requested."
          },
          { role: "user", content: prompt }
        ]
      })
    });

    const text = await r.text();

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(r.status).send(text);
  } catch (err) {
    console.error("Proxy error:", err);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(500).json({ error: err.message || "Proxy failed" });
  }
};
