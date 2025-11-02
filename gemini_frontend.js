// ------------------- Gemini Frontend Automation -------------------
// Works with supabaseClient.js and Gemini 2.5 Flash
// Creates RLS-enabled tables, adds policies, and uploads generated quiz data

import { supabase } from './supabaseClient.js';

const GEMINI_API_KEY = "AIzaSyBX5TYNhyMR9S8AODdFkfsJW-vSbVZVI5Y";
const GEMINI_MODEL = "gemini-1.5-flash";

const classSelect = document.getElementById('classSelect');
const subjectSelect = document.getElementById('subjectSelect');
const chapterSelect = document.getElementById('chapterSelect');
const generateBtn = document.getElementById('generateBtn');
const logEl = document.getElementById('log');

// ---------- Utility: Logging ----------
function log(message, type = "info") {
  const p = document.createElement("p");
  p.textContent = message;
  p.className = type;
  logEl.appendChild(p);
  logEl.scrollTop = logEl.scrollHeight;
}

// ---------- Utility: Basic CSV Parser ----------
function parseCSV(text) {
  const rows = [];
  let current = '', insideQuotes = false;
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const row = [];
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (insideQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (c === ',' && !insideQuotes) {
        row.push(current);
        current = '';
      } else {
        current += c;
      }
    }
    row.push(current);
    current = '';
    rows.push(row);
  }
  return rows.filter(r => r.length > 1);
}

// ---------- Gemini CSV Generation ----------
async function generateQuizCSV(chapterTitle) {
  log(`Generating quiz for: ${chapterTitle} ...`);

  const prompt = `...` // (keep your long prompt as-is)

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    }
  );

  const data = await response.json();
  let csv = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

  // 🧹 Clean Gemini Markdown fences
  csv = csv
    .replace(/^```csv\s*/i, "")
    .replace(/^```/i, "")
    .replace(/```$/i, "")
    .trim();

  if (!csv.startsWith("difficulty,")) {
    console.error("CSV output preview:\n", csv.slice(0, 300));
    throw new Error("Invalid CSV format received from Gemini (missing headers).");
  }

  log("✅ CSV generated successfully!");
  return csv.trim();
}

// ---------- Upload to Supabase ----------
async function uploadQuizToSupabase(tableName, csvText) {
  log(`Uploading quiz data to Supabase table: ${tableName}`);

  const rows = parseCSV(csvText).slice(1); // skip headers
  const inserts = rows.map(cols => ({
    difficulty: cols[0],
    question_type: cols[1],
    question_text: cols[2],
    scenario_reason_text: cols[3],
    option_a: cols[4],
    option_b: cols[5],
    option_c: cols[6],
    option_d: cols[7],
    correct_answer_key: cols[8]
  }));

  const { error } = await supabase.from(tableName).insert(inserts);
  if (error) throw error;

  log("✅ All rows inserted successfully!");
}

// ---------- Update Curriculum ----------
async function updateCurriculum(chapterTitle, tableName) {
  try {
    await fetch("/api/updateCurriculum", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapterTitle, tableName })
    });
    log("✅ curriculum.js updated successfully!");
  } catch (err) {
    console.error("Curriculum update failed:", err);
  }
}

// ---------- Main Flow ----------
generateBtn.addEventListener("click", async () => {
  const selectedClass = classSelect.value;
  const selectedSubject = subjectSelect.value;
  const selectedChapter = chapterSelect.value;
  if (!selectedChapter) return log("⚠️ Please select a chapter first.");

  const tableName = selectedChapter.toLowerCase().replace(/\s+/g, "_") + "_quiz";

  try {
    log(`🚀 Starting quiz generation for ${selectedChapter}`);
    const csv = await generateQuizCSV(selectedChapter);
    await uploadQuizToSupabase(tableName, csv);
    await updateCurriculum(selectedChapter, tableName);
    log(`🎯 Quiz ready for ${selectedChapter}!`);
  } catch (err) {
    console.error(err);
    log("❌ Error: " + err.message, "error");
  }
});
