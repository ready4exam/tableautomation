export const config = {
  runtime: "edge", // super fast
};

export default async function handler(req) {
  const allowedOrigins = [
    "https://ready4exam.github.io",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
  ];

  const origin = req.headers.get("origin");
  const corsHeaders = {
    "Access-Control-Allow-Origin": allowedOrigins.includes(origin)
      ? origin
      : "https://ready4exam.github.io",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  const send = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return send({}, 200);
  if (req.method !== "POST") return send({ error: "Only POST allowed" }, 405);

  let body;
  try {
    body = await req.json();
  } catch {
    return send({ error: "Invalid JSON body" }, 400);
  }

  const { prompt } = body;
  if (!prompt || typeof prompt !== "string" || !prompt.trim())
    return send({ error: "Missing or invalid 'prompt'" }, 400);

  const apiKey = process.env.google_api;
  if (!apiKey)
    return send(
      { error: "Missing GOOGLE_API key in environment variables" },
      500
    );

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
              parts: [
                {
                  text:
                    "You are an education data assistant. Return clean, structured JSON or lists — no markdown or extra text.\n\n" +
                    prompt.trim(),
                },
              ],
            },
          ],
        }),
      }
    );

    const data = await response.json();
    if (!response.ok) return send({ error: "Gemini API failed", data }, response.status);

    return send(data, 200);
  } catch (err) {
    return send({ error: err.message }, 500);
  }
}
