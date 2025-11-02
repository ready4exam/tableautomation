// ------------------- Ready4Exam Gemini 2.5 Frontend Automation -------------------
// Works with supabaseClient.js and Gemini 2.5 Flash
// Creates RLS-enabled tables, adds policies, uploads quiz data, and updates curriculum.js

import { supabase } from "./supabaseClient.js";

const GEMINI_API_KEY = "AIzaSyBX5TYNhyMR9S8AODdFkfsJW-vSbVZVI5Y"; // 🔑 Your Gemini API key

// ------------------- Logging -------------------
function log(msg) {
  console.log(msg);
  const logEl = document.getElementById("log");
  if (logEl) {
    logEl.textContent += msg + "\n";
    logEl.scrollTop = logEl.scrollHeight;
  }
}

// ------------------- Gemini 2.5 Flash Call -------------------
async function askGemini(prompt) {
  log("🧠 Asking Gemini 2.5 Flash...");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  );

  if (!res.ok) throw new Error(`Gemini request failed (${res.status})`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return text.replace(/```[a-z]*|```/g, "").trim();
}

// ------------------- Parse CSV -------------------
function parseCSV(csv) {
  const lines = csv
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  const headers = lines[0]
    .split(",")
    .map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1).map((line) => {
    const cols = line
      .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
      .map((v) => v.trim().replace(/^"|"$/g, ""));
    const row = {};
    headers.forEach((h, i) => (row[h] = cols[i] || ""));
    return row;
  });
  return rows;
}

// ------------------- Fetch Subjects -------------------
async function fetchSubjects(selectedClass) {
  log(`🔍 Fetching NCERT subjects for Class ${selectedClass}...`);
  const prompt = `List all NCERT subjects for Class ${selectedClass} in a valid JSON array, like ["Science","Mathematics","Social Science","English"].`;
  const text = await askGemini(prompt);
  const clean = text.replace(/```json|```/g, "").replace(/\n/g, "").trim();
  return JSON.parse(clean.match(/\[.*\]/s)?.[0] || "[]");
}

// ------------------- Fetch Chapters -------------------
async function fetchChapters(selectedClass, subject) {
  log(`📖 Fetching chapters for ${subject} (Class ${selectedClass})...`);
  const prompt = `List all NCERT chapters for Class ${selectedClass}, Subject ${subject} as a JSON array of chapter names.`;
  const text = await askGemini(prompt);
  const clean = text.replace(/```json|```/g, "").replace(/\n/g, "").trim();
  return JSON.parse(clean.match(/\[.*\]/s)?.[0] || "[]");
}

// ------------------- Prepare Supabase Table -------------------
async function prepareTable(tableName) {
  const columns = [
    "difficulty",
    "question_type",
    "question_text",
    "scenario_reason_text",
    "option_a",
    "option_b",
    "option_c",
    "option_d",
    "correct_answer_key",
  ];

  const sql = `
    CREATE TABLE IF NOT EXISTS public.${tableName} (
      id SERIAL PRIMARY KEY,
      ${columns.map((c) => `${c} TEXT`).join(", ")},
      created_at TIMESTAMP DEFAULT NOW()
    );
    ALTER TABLE public.${tableName} ENABLE ROW LEVEL SECURITY;
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = '${tableName}'
          AND policyname = 'Enable insert for authenticated users'
      ) THEN
        CREATE POLICY "Enable insert for authenticated users"
        ON public.${tableName}
        FOR INSERT
        TO anon, authenticated
        WITH CHECK (true);
      END IF;
    END $$;
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = '${tableName}'
          AND policyname = 'Enable read access for all users'
      ) THEN
        CREATE POLICY "Enable read access for all users"
        ON public.${tableName}
        FOR SELECT
        TO public
        USING (true);
      END IF;
    END $$;
  `;

  const { error } = await supabase.rpc("execute_sql", { query: sql });
  if (error) throw new Error(error.message);
  log(`✅ Table ${tableName} ready with RLS and policies.`);
}

// ------------------- Generate Quiz Questions -------------------
async function generateQuestions(selectedClass, subject, chapter) {
  log(`📚 Generating 60 questions for ${subject} → ${chapter}...`);
  const prompt = `
Generate exactly 60 unique quiz questions for Class ${selectedClass}, Subject ${subject}, Chapter ${chapter}.
Return ONLY a valid CSV with these headers:
difficulty,question_type,question_text,scenario_reason_text,option_a,option_b,option_c,option_d,correct_answer_key
Ensure all commas inside text are properly escaped in quotes.
`;
  const csvText = await askGemini(prompt);
  log("✅ CSV received. Parsing...");
  return parseCSV(csvText);
}

// ------------------- Upload Quiz Data -------------------
async function uploadToSupabase(tableName, rows) {
  log(`📤 Uploading ${rows.length} rows to Supabase...`);
  const { error } = await supabase.from(tableName).insert(rows);
  if (error) throw error;
  log(`🎉 Successfully inserted ${rows.length} questions into ${tableName}.`);
}

// ------------------- Update curriculum.js -------------------
async function updateCurriculum(chapterTitle, newId) {
  const CURRICULUM_URL =
    "https://raw.githubusercontent.com/ready4exam/ninth/main/js/curriculum.js";

  try {
    log(`🪶 Updating curriculum.js for chapter: ${chapterTitle} → ${newId}`);
    const res = await fetch(CURRICULUM_URL);
    let text = await res.text();

    const safeTitle = chapterTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(
      `\\{\\s*id:\\s*"(.*?)",\\s*title:\\s*"${safeTitle}"\\s*\\}`,
      "g"
    );

    let updated = false;
    text = text.replace(regex, (match, oldId) => {
      updated = true;
      log(`🧩 Replaced id "${oldId}" → "${newId}"`);
      return match.replace(`id: "${oldId}"`, `id: "${newId}"`);
    });

    if (!updated) {
      log("⚠️ Chapter title not found in curriculum.js — no update performed.");
      return;
    }

    console.log("✅ Updated curriculum.js content preview:\n", text.slice(0, 800));
  } catch (err) {
    log(`❌ Failed to update curriculum.js: ${err.message}`);
  }
}

