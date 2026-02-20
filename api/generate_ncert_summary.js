import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;
// Check if API key is present
if (!apiKey) {
    console.warn("GEMINI_API_KEY is not set.");
}
const genAI = new GoogleGenerativeAI(apiKey || "dummy_key");

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { meta } = req.body;
    if (!meta) {
        return res.status(400).json({ error: "Missing meta object" });
    }
    const { classId, subject, chapter } = meta;

    const subjectType = getSubjectType(subject);

    const prompt = `
      Create a structured JSON summary for the NCERT ${subject} chapter "${chapter}" for Class ${classId}.
      The JSON must follow this structure based on the subject type:

      ${getPromptStructure(subjectType)}

      Ensure all formulas are in LaTeX format (e.g., $E=mc^2$).
      Return ONLY the JSON object, no markdown formatting.
    `;

    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Clean up markdown if present
    const jsonString = text.replace(/```json/g, "").replace(/```/g, "").trim();

    // Attempt to find JSON object in text
    const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
    const finalJsonString = jsonMatch ? jsonMatch[0] : jsonString;

    const json = JSON.parse(finalJsonString);

    return res.status(200).json(json);
  } catch (error) {
    console.error("Error generating summary:", error);
    return res.status(500).json({ error: error.message });
  }
}

function getSubjectType(subject) {
  if (!subject) return "generic";
  const s = subject.toLowerCase();
  if (s.includes("science") || s.includes("physics") || s.includes("chemistry") || s.includes("biology")) return "science";
  if (s.includes("math")) return "mathematics";
  if (s.includes("social") || s.includes("history") || s.includes("civics") || s.includes("geography")) return "social_science";
  return "generic";
}

function getPromptStructure(type) {
  if (type === "mathematics") {
    return `{
        "formulaVault": [ "LaTeX string 1", "LaTeX string 2" ],
        "theorems": [ "Theorem 1", "Theorem 2" ],
        "keyConcepts": [ "Concept 1", "Concept 2" ]
      }`;
  }
  if (type === "science") {
    return `{
        "definitions": [ "Def 1", "Def 2" ],
        "laws": [ "Law 1", "Law 2" ],
        "siUnits": [ "Unit 1", "Unit 2" ],
        "keyPoints": [ "Point 1", "Point 2" ]
      }`;
  }
  if (type === "social_science") {
    return `{
        "timeline": [ { "date": "Date 1", "event": "Event 1" } ],
        "keyFigures": [ "Person 1", "Person 2" ],
        "majorPoints": [ "Point 1", "Point 2" ]
      }`;
  }
  return `{ "summary": "Text summary", "keyPoints": [] }`;
}
