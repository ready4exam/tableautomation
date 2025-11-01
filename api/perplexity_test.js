// api/perplexity_test.js
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://ready4exam.github.io");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Only GET" });

  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "No API key in env" });

  try {
    const r = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "sonar-small-online",
        messages: [{ role: "user", content: "Say OK in JSON: {\"ok\":\"yes\"}" }]
      }),
      // set a short timeout if your environment supports AbortController (optional)
    });

    const text = await r.text();
    // Do NOT return text (it can contain data). Return only status and size
    return res.status(200).json({ status: r.status, length: text.length, ok: r.ok });
  } catch (err) {
    console.error("Perplexity test error:", err);
    return res.status(500).json({ error: err.message });
  }
}
