// /api/gemini_test.js
export default async function handler(req, res) {
  const apiKey = process.env.google_api;

  if (!apiKey) {
    return res.status(500).json({ error: "❌ Missing Gemini API key" });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: "Say 'Gemini 2.5 Flash test success'." }],
            },
          ],
        }),
      }
    );

    const result = await response.json();
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
