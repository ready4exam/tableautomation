// /api/gemini_debug.js
export default async function handler(req, res) {
  try {
    const key = process.env.google_api;

    res.status(200).json({
      status: "ok",
      keyFound: !!key,
      keyPreview: key ? key.slice(0, 8) + "********" : null,
      environment: process.env.VERCEL_ENV || "unknown",
      message: key
        ? "✅ Gemini API key loaded successfully."
        : "❌ Missing Gemini API key.",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
