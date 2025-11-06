// ------------------- Gemini Frontend Automation -------------------
// Works with Supabase + Gemini 2.5 Flash + Ready4Exam backend APIs
// Creates RLS-enabled tables, inserts quiz data, and updates curriculum.js

import { supabase } from "./supabaseClient.js";

const GEMINI_API_KEY = "AIzaSyBX5TYNhyMR9S8AODdFkfsJW-vSbVZVI5Y"; // fallback only
const GEMINI_MODEL = "gemini-2.5-flash";
const BACKEND_URL = "https://ready4exam-master-automation.vercel.app"; // central automation backend

const classSelect = document.getElementById("classSelect");
const subjectSelect = document.getElementById("subjectSelect");
const chapterSelect = document.getElementById("chapterSelect");
const generateBtn = document.getElementById("generateBtn");
const logEl = document.getElementById("log");

// ---------- Logging ----------
const log = (msg) => {
  console.log(msg);
  if (logEl) {
    logEl.textContent += msg + "\n";
    logEl.scrollTop = logEl.scrollHeight;
  }
};

// ---------- Ask Gemini ----------
async function askGemini(prompt) {
  try {
    const resp = await fetch(`${BACKEND_URL}/api/gemini`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    if (!resp.ok) {
      console.warn(`⚠️ Proxy responded ${resp.status}, fallback to client Gemini.`);
      throw new Error(`Proxy ${resp.status}`);
    }

    const json = await resp.json();
    const text =
      json?.candidates?.[0]?.content?.parts?.[0]?.text ||
      json?.output?.[0]?.content?.parts?.[0]?.text ||
      JSON.stringify(json);
    return text.trim();
  } catch (err) {
    log(`⚠️ askGemini error: ${err.message}`);
    throw err;
  }
}

// ---------- Extract JSON Arrays ----------
function extractArrayFromText(text) {
  if (!text || typeof text !== "string") return [];
  try {
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      const jsonArray = JSON.parse(match[0]);
      return Array.isArray(jsonArray)
        ? jsonArray.map((x) => (typeof x === "string" ? x : Object.values(x)[0]))
        : [];
    }
  } catch {
    console.warn("⚠️ JSON parse fallback");
  }
  return text
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---------- CSV Parser ----------
function parseCSV(csvText) {
  csvText = csvText.replace(/```csv/gi, "").replace(/```/g, "").trim();
  const lines = csvText.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error("Invalid CSV");
  const headers = lines[0]
    .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const cols = line
      .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
      .map((v) => v.trim().replace(/^"|"$/g, ""));
    const row = {};
    headers.forEach((h, i) => (row[h] = cols[i] || ""));
    return row;
  });
}

// ---------- Class Selection ----------
classSelect.addEventListener("change", async () => {
  const selectedClass = classSelect.value;
  if (!selectedClass) return;
  subjectSelect.innerHTML = "";
  chapterSelect.innerHTML = "";
  generateBtn.disabled = true;

  log(`🔍 Fetching NCERT subjects for Class ${selectedClass}...`);
  const prompt = `List all NCERT subjects for Class ${selectedClass} as a JSON array. Example: ["Science","Mathematics","Social Science","English"].`;

  try {
    const text = await askGemini(prompt);
    const subjects = extractArrayFromText(text);
    if (!subjects.length) throw new Error("No subjects found");

    subjectSelect.innerHTML = '<option value="">-- Select Subject --</option>';
    subjects.forEach((s) => (subjectSelect.innerHTML += `<option value="${s}">${s}</option>`));
    subjectSelect.disabled = false;
    log(`✅ Found ${subjects.length} subjects.`);
  } catch (err) {
    log(`❌ Failed to fetch subjects: ${err.message}`);
  }
});

// ---------- Subject Selection ----------
subjectSelect.addEventListener("change", async () => {
  const selectedClass = classSelect.value;
  const subject = subjectSelect.value;
  if (!subject) return;
  chapterSelect.innerHTML = "";
  generateBtn.disabled = true;

  log(`📖 Fetching chapters for ${subject} (Class ${selectedClass})...`);
  const prompt = `Return only a JSON array of official NCERT chapter titles for Class ${selectedClass}, Subject ${subject}. Example: ["Chapter 1: ...", "Chapter 2: ..."].`;

  try {
    const text = await askGemini(prompt);
    const chapters = extractArrayFromText(text);
    if (!chapters.length) throw new Error("No chapters found");

    chapterSelect.innerHTML = '<option value="">-- Select Chapter --</option>';
    chapters.forEach((c) => (chapterSelect.innerHTML += `<option value="${c}">${c}</option>`));
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
  if (!chapter) return alert("Please select a chapter first.");

  const tableName = (() => {
    let clean = chapter
      .toLowerCase()
      .replace(/chapter\s*\d+[:\-]?\s*/i, "")
      .replace(/[^\w]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .trim();
    const words = clean.split("_").filter(Boolean);
    if (words.length > 3) clean = words.slice(0, 3).join("_");
    return clean.endsWith("_quiz") ? clean : `${clean}_quiz`;
  })();

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
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = '${tableName}'
        ) THEN
          CREATE POLICY "Enable all access" ON public.${tableName}
          FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
        END IF;
      END $$;
    `;
    await supabase.rpc("execute_sql", { query: createQuery });
    log(`✅ Table ${tableName} ready with RLS.`);
  } catch (err) {
    return log(`❌ Table creation failed: ${err.message}`);
  }

  log(`📚 Generating 60 questions for ${subject} → ${chapter}...`);
  const prompt = `
Generate 60 quiz questions for Class ${selectedClass}, Subject ${subject}, Chapter ${chapter}.
Return ONLY valid CSV (no markdown) with headers:
difficulty,question_type,question_text,scenario_reason_text,option_a,option_b,option_c,option_d,correct_answer_key
`;

  try {
    const csvText = await askGemini(prompt);
    const rows = parseCSV(csvText);
    log(`📤 Sending ${rows.length} rows to server for insertion...`);

    const res = await fetch(`${BACKEND_URL}/api/manageSupabase`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ class: selectedClass, tableName, rows }),
    });

    const j = await res.json();
    if (!res.ok) throw new Error(j.error || JSON.stringify(j));
    log(`🎉 Successfully inserted ${rows.length} rows into ${tableName}.`);

    await updateCurriculum(selectedClass, chapter, tableName);
  } catch (err) {
    log(`❌ Error: ${err.message}`);
  }
});

// ---------- Update Curriculum ----------
async function updateCurriculum(className, chapterTitle, newId) {
  try {
    log(`🪶 Updating curriculum.js for Class ${className} → ${chapterTitle} → ${newId}`);
    const res = await fetch(`${BACKEND_URL}/api/updateCurriculum`, {
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
