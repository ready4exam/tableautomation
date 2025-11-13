// ✅ /api/gemini.js — Final Production-Ready Parser (Stable)
// Supports plain JSON, Markdown JSON, escaped JSON, and nested Gemini responses

import { getCorsHeaders } from "./cors.js";
export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  const headers = { ...getCorsHeaders(origin), "Content-Type": "application/json" };
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { meta } = body || {};
    if (!meta) throw new Error("Missing 'meta' field.");

    const { class_name, subject, book, chapter, num = 5, difficulty = "medium" } = meta;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("Missing GEMINI_API_KEY in environment variables.");

    const prompt = `
Generate ${num} multiple-choice questions in pure JSON.
Each question must have:
difficulty, question_type, question_text, scenario_reason_text, option_a, option_b, option_c, option_d, correct_answer_key.
Subject: ${subject}
Book: ${book}
Chapter: ${chapter}
Difficulty: ${difficulty}
Return only valid JSON, no markdown or explanations.
Format:
{
  "questions": [ { "difficulty": "...", "question_type": "...", ... } ]
}
`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
        }),
      }
    );

    const rawText = await geminiRes.text();
    console.log("🧾 GEMINI RAW:", rawText.substring(0, 500));

    // ----------------------------
    // 🧠 UNIVERSAL JSON EXTRACTOR
    // ----------------------------
    function extractJSON(text) {
      if (!text) throw new Error("Empty response from Gemini.");
      // 1️⃣ Try direct JSON
      try {
        return JSON.parse(text);
      } catch (_) {}

      // 2️⃣ Try Markdown-style code block
      const mdMatch = text.match(/```(?:json)?([\s\S]*?)```/i);
      if (mdMatch) {
        try {
          return JSON.parse(mdMatch[1]);
        } catch (_) {}
      }

      // 3️⃣ Try first {...} block
      const blockMatch = text.match(/\{[\s\S]*\}/);
      if (blockMatch) {
        try {
          return JSON.parse(blockMatch[0]);
        } catch (_) {}
      }

      // 4️⃣ Clean escaped quotes and retry
      const cleaned = text.replace(/\\"/g, '"').replace(/\\n/g, "").trim();
      try {
        return JSON.parse(cleaned);
      } catch (_) {
        throw new Error("No valid JSON structure found.");
      }
    }

    // ----------------------------
    // 🧩 PARSE GEMINI RESPONSE
    // ----------------------------
    let jsonText = "";
    try {
      const outer = JSON.parse(rawText);
      jsonText =
        outer?.candidates?.[0]?.content?.parts?.[0]?.text ||
        outer?.output_text ||
        rawText;
    } catch {
      jsonText = rawText;
    }

    const parsed = extractJSON(jsonText);
    const questions = Array.isArray(parsed?.questions) ? parsed.questions : [];

    if (!questions.length) throw new Error("Failed to parse Gemini JSON output.");

    return res.status(200).json({ ok: true, questions });
  } catch (err) {
    console.error("❌ /api/gemini.js error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
