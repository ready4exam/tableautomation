// api/debug.js
export default async function handler(req, res) {
  // allow CORS to your frontend origin(s)
  res.setHeader("Access-Control-Allow-Origin", "https://ready4exam.github.io");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Only GET allowed" });

  // Check presence of environment variable (do NOT return the key)
  const hasKey = !!process.env.PERPLEXITY_API_KEY;
  // Optionally return the length only (non-sensitive) — comment out if you prefer boolean-only
  const keyLength = hasKey ? String(process.env.PERPLEXITY_API_KEY.length) : null;

  return res.status(200).json({ hasKey, keyLength });
}
