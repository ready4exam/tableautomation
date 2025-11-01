// File: gemini_test.js
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const apiKey = process.env.google_api;

if (!apiKey) {
  console.error("❌ Missing google_api key in environment.");
  process.exit(1);
}

const testPrompt = "List three subjects taught in NCERT Class 8.";

(async () => {
  console.log("🚀 Testing Gemini 2.5 Flash with your API key...");
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
              parts: [{ text: testPrompt }],
            },
          ],
        }),
      }
    );

    console.log("HTTP status:", response.status);
    const data = await response.json();

    if (response.ok) {
      const text =
        data?.candidates?.[0]?.content?.parts?.[0]?.text ??
        JSON.stringify(data, null, 2);
      console.log("✅ Gemini response:\n", text);
    } else {
      console.error("❌ API error:", JSON.stringify(data, null, 2));
    }
  } catch (err) {
    console.error("🔥 Connection error:", err);
  }
})();
