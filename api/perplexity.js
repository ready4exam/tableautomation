// /api/perplexity.js

export const config = {
  runtime: "nodejs", // ✅ use Node.js to access process.env
};

export default async function handler(req, res) {
  // --- CORS setup ---
  const allowedOrigins = [
    "https://ready4exam.github.io",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
  ];
  const origin = req.headers.origin;
  const corsHeaders = {
    "Access-Control-Allow-Origin": allowedOrigins.includes(origin)
      ? origin
      : "https://ready4exam.github.io",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (req.method === "OPTIONS") {
    res.writeHead(200, corsHeaders);
    return res.end();
  }

  if (req.method !== "POST") {
    res.writeHead(405, { ...corsHeaders, "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  }

  // --- Parse body safely ---
  let body;
  try {
    body = req.body ? req.body : JSON.parse(await streamToString(req));
  } catch {
    res.writeHead(400, { ...corsHeaders, "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Invalid JSON body" }));
  }

  const { prompt } = body || {};
  if (!prompt || typeof prompt !== "string") {
    res.writeHead(400, { ...corsHeaders, "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Missing or invalid 'prompt'" }));
  }

  // --- Ensure key exists ---
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    console.error("❌ Missing PERPLEXITY_API_KEY in environment");
    res.writeHead(500, { ...corsHeaders, "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Server misconfiguration" }));
  }

  // --- Call Perplexity API ---
  try {
    const perplexityRes = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-sonar-small-128k-online",
        messages: [
          {
            role: "system",
            content: "You are an educational assistant. Return JSON arrays or plain lists only.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    const text = await perplexityRes.text();
    let data = {};
    try {
      data = JSON.parse(text);
    } catch {
      console.error("⚠️ Non-JSON Perplexity response:", text);
      res.writeHead(perplexityRes.status, { ...corsHeaders, "Content-Type": "application/json" });
      return res.end(JSON.stringify({ raw: text }));
    }

    if (!perplexityRes.ok) {
      console.error("❌ Perplexity API Error:", data);
      res.writeHead(perplexityRes.status, { ...corsHeaders, "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Perplexity API failed", data }));
    }

    res.writeHead(200, { ...corsHeaders, "Content-Type": "application/json" });
    return res.end(JSON.stringify(data));
  } catch (err) {
    console.error("🔥 Unexpected error:", err);
    res.writeHead(500, { ...corsHeaders, "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: err.message }));
  }
}

// --- Helper for reading request stream ---
function streamToString(stream) {
  const chunks = [];
  return new Promise((resolve, reject) => {
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("error", (err) => reject(err));
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}
