// ------------------- Gemini Frontend Automation -------------------
// Works with Supabase and Gemini 2.5 Flash
// Creates RLS-enabled tables, uploads generated quiz data,
// and updates curriculum.js reference IDs automatically.

import { supabase } from "./supabaseClient.js";

const GEMINI_API_KEY = "AIzaSyBX5TYNhyMR9S8AODdFkfsJW-vSbVZVI5Y"; // Keep your current key
const GEMINI_MODEL = "gemini-2.5-flash";

const classSelect = document.getElementById("classSelect");
const subjectSelect = document.getElementById("subjectSelect");
const chapterSelect = document.getElementById("chapterSelect");
const generateBtn = document.getElementById("generateBtn");
const logEl = document.getElementById("log");

// ---------- Logger ----------
const log = (msg) => {
  console.log(msg);
  if (logEl) {
    logEl.textContent += msg + "\n";
    logEl.scrollTop = logEl.scrollHeight;
  }
};

// ---------- Gemini Proxy Call ----------
async function askGemini(prompt) {
  try {
    const proxyResp = await fetch("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    if (proxyResp.ok) {
      const proxyJson = await proxyResp.json();
      const outputText =
        proxyJson?.candidates?.[0]?.content?.parts?.[0]?.text ||
        proxyJson?.output?.[0]?.content?.parts?.[0]?.text ||
        JSON.stringify(proxyJson);
      if (outputText && outputText.trim()) return outputText.trim();
    } else {
      console.warn(`⚠️ Proxy responded ${proxyResp.status}, fallback to client call.`);
    }
  } catch (err) {
    console.warn("⚠️ Proxy failed, fallback to client:", err);
  }

  // Fallback direct Gemini call (only used if proxy fails)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const body = { contents: [{ role: "user", parts: [{ text: prompt }] }] };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
}

// ---------- Extract JSON/Array ----------
function extractArrayFromText(text) {
  if (!text || typeof text !== "string") return [];
  try {
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (match) {
      const jsonText = match[0]
        .replace(/```(?:json)?/gi, "")
        .replace(/```/g, "")
        .trim();
      const parsed = JSON.parse(jsonText);
      if (Array.isArray(parsed)) return parsed;
      if (parsed.subjects) return parsed.subjects;
      if (parsed.chapters) return parsed.chapters;
    }
  } catch (e) {
    console.warn("⚠️ JSON parse failed:", e.message);
  }
  const quoted = Array.from(text.matchAll(/"([^"]+)"/g)).map((m) => m[1]);
  if (quoted.length) return quoted;
  return text.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
}

// ---------- CSV Parser (Fixed version) ----------
function parseCSV(csvText) {
  if (!csvText || typeof csvText !== "string") return [];

  // Clean code fences
  csvText = csvText.replace(/```csv/gi, "").replace(/```/g, "").trim();

  const lines = csvText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  if (lines.length < 2) throw new Error("CSV data incomplete or empty");

  let headers = lines[0]
    .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase());

  // Normalize column names
  const headerMap = {
    reason_text: "scenario_reason_text",
    scenario: "scenario_reason_text",
    rationale: "scenario_reason_text",
  };
  headers = headers.map((h) => headerMap[h] || h);

  const rows = lines.slice(1).map((line) => {
    const cols = line
      .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
      .map((v) => v.trim().replace(/^"|"$/g, ""));
    const row = {};
    headers.forEach((h, i) => (row[h] = cols[i] || ""));
    return row;
  });

  return rows.filter((r) => Object.values(r).some((v) => v));
}

// ---------- Handle Class Selection ----------
classSelect.addEventListener("change", async () => {
  const selectedClass = classSelect.value;
  if (!selectedClass) return;
  subjectSelect.innerHTML = "";
  chapterSelect.innerHTML = "";
  generateBtn.disabled = true;

  log(`🔍 Fetching NCERT subjects for Class ${selectedClass}...`);
  const prompt = `List all NCERT subjects for Class ${selectedClass} as a pure JSON array like ["Science","Math","Social Science","English"].`;

  try {
    const text = await askGemini(prompt);
    const subjects = extractArrayFromText(text);
    subjectSelect.innerHTML = '<option value="">-- Select Subject --</option>';
    subjects.forEach((s) => {
      subjectSelect.innerHTML += `<option value="${s}">${s}</option>`;
    });
    subjectSelect.disabled = false;
    log(`✅ Found ${subjects.length} subjects.`);
  } catch (err) {
    log(`❌ Failed to fetch subjects: ${err.message}`);
  }
});

// ---------- Handle Subject Selection ----------
subjectSelect.addEventListener("change", async () => {
  const selectedClass = classSelect.value;
  const subject = subjectSelect.value;
  if (!subject) return;
  chapterSelect.innerHTML = "";
  generateBtn.disabled = true;

  log(`📖 Fetching chapters for ${subject} (Class ${selectedClass})...`);
  const prompt = `Return ONLY a JSON array of NCERT chapters for Class ${selectedClass}, Subject ${subject}. Each item is "Chapter X: Title".`;

  try {
    const text = await askGemini(prompt);
    const chapters = extractArrayFromText(text);
    chapterSelect.innerHTML = '<option value="">-- Select Chapter --</option>';
    chapters.forEach((c) => {
      chapterSelect.innerHTML += `<option value="${c}">${c}</option>`;
    });
    chapterSelect.disabled = false;
    log(`✅ Found ${chapters.length} chapters.`);
  } catch (err) {
    log(`❌ Failed to fetch chapters: ${err.message}`);
  }
});

chapterSelect.addEventListener("change", () => {
  generateBtn.disabled = !chapterSelect.value;
});

// ---------- Generate Questions ----------
generateBtn.addEventListener("click", async () => {
  const selectedClass = classSelect.value;
  const subject = subjectSelect.value;
  const chapter = chapterSelect.value;
  if (!chapter) return alert("Please select a chapter.");

  const tableName = chapter
    .toLowerCase()
    .replace(/chapter\s*\d+[:\-]?\s*/i, "")
    .replace(/[^\w]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .concat("_quiz");

  log(`🧾 Preparing table: ${tableName}`);

  try {
    const createQuery = `
      CREATE TABLE IF NOT EXISTS public.${tableName} (
        id SERIAL PRIMARY KEY,
        difficulty TEXT,
        question_type TEXT,
        question_text TEXT,
        scenario_reason_text TEXT,
        option_a TEXT,
        option_b TEXT,
        option_c TEXT,
        option_d TEXT,
        correct_answer_key TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
      ALTER TABLE public.${tableName} ENABLE ROW LEVEL SECURITY;
    `;
    const { error } = await supabase.rpc("execute_sql", { query: createQuery });
    if (error) throw error;
    log(`✅ Table ${tableName} ready with RLS.`);
  } catch (err) {
    return log(`❌ Table creation failed: ${err.message}`);
  }

  log(`📚 Generating 60 questions for ${subject} → ${chapter}...`);
  const prompt = `
Generate exactly 60 unique quiz questions for Class ${selectedClass}, Subject ${subject}, Chapter ${chapter}.
Return ONLY CSV (no markdown, no backticks) with headers:
difficulty,question_type,question_text,scenario_reason_text,option_a,option_b,option_c,option_d,correct_answer_key
`;

  try {
    const csvText = await askGemini(prompt);
    const rows = parseCSV(csvText);
    log(`📤 Uploading ${rows.length} rows to Supabase...`);

    const { error: insertError } = await supabase.from(tableName).insert(rows);
    if (insertError) throw insertError;

    log(`🎉 Successfully inserted ${rows.length} questions into ${tableName}.`);
    await updateCurriculum(selectedClass, chapter, tableName);
  } catch (err) {
    log(`❌ Error: ${err.message}`);
  }
});

// ---------- Update curriculum.js ----------
async function updateCurriculum(className, chapterTitle, newId) {
  try {
    log(`🪶 Updating curriculum.js for Class ${className} → Chapter: ${chapterTitle} → ${newId}`);
    const res = await fetch("/api/updateCurriculum", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ className, chapterTitle, newId }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || "Update failed");
    log(`✅ curriculum.js committed successfully.`);
  } catch (err) {
    log(`❌ curriculum commit failed: ${err.message}`);
  }
}
