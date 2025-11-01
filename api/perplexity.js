export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { prompt } = req.body || {};
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Missing or invalid prompt" });
    }

    console.log("🧠 Received prompt:", prompt);

    const perplexityRes = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-sonar-small-128k-online",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant that returns only JSON or structured text output for educational queries.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    const data = await perplexityRes.json();

    if (!perplexityRes.ok) {
      console.error("❌ Perplexity API error:", data);
      return res.status(500).json({ error: "Perplexity API call failed", details: data });
    }

    console.log("✅ Perplexity response:", data);
    return res.status(200).json(data);
  } catch (err) {
    console.error("🔥 Server error:", err);
    return res.status(500).json({ error: "Server error", details: err.message });
  }
}
