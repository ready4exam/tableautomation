// ------------------- Gemini Frontend Automation -------------------
// Works with supabaseClient.js and Gemini 2.5 Flash
// Creates RLS-enabled tables, adds policies, uploads generated quiz data,
// and updates curriculum.js reference IDs automatically.

import { supabase } from './supabaseClient.js';

const GEMINI_API_KEY = "AIzaSyBX5TYNhyMR9S8AODdFkfsJW-vSbVZVI5Y"; // 🔑 Replace with your Gemini API key

const classSelect = document.getElementById('classSelect');
const subjectSelect = document.getElementById('subjectSelect');
const chapterSelect = document.getElementById('chapterSelect');
const generateBtn = document.getElementById('generateBtn');
const logEl = document.getElementById('log');

// ------------- Logging -------------
const log = (msg) => {
  console.log(msg);
  if (logEl) {
    logEl.textContent += msg + "\n";
    logEl.scrollTop = logEl.scrollHeight;
  }
};

// ------------- Ask Gemini API -------------
async function askGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ]
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }

    const data = await res.json();
    const output = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!output) throw new Error("Empty response from Gemini");

    // ✅ Extract JSON block even if wrapped in text or markdown
    const match = output.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (err) {
        console.warn("⚠️ Invalid JSON inside Gemini output:", err);
      }
    }

    // Return raw text if no valid JSON found
    return output;
  } catch (err) {
    console.error("❌ Gemini API error:", err);
    throw err;
  }
}
// ------------- Robust Text → Array extractor -------------
function extractArrayFromText(text) {
  if (!text || typeof text !== "string") return [];

  // Remove common fences and trim
  let s = text.replace(/```(?:json|csv)?/gi, "").replace(/```/g, "").trim();

  // Remove leading 'json:', 'JSON:', 'Output:' etc.
  s = s.replace(/^[^\[\{]*?(?=(\[|{|$))/i, "").trim();

  // If there's an explicit JSON array anywhere, try to extract it:
  const firstBracket = s.indexOf("[");
  const lastBracket = s.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    const arrText = s.slice(firstBracket, lastBracket + 1);
    try {
      const parsed = JSON.parse(arrText);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {
      console.warn("JSON.parse failed on extracted array:", e);
    }
  }

  // Normalize separators to newlines
  s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();

  const lines = s.split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length > 1) return lines;

  // Try comma-separated (ignore commas inside quotes)
  const cols = s
    .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map(c => c.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
  if (cols.length > 0) return cols;

  // Fallback: match quoted parts
  const quoted = Array.from(s.matchAll(/"([^"]+)"/g)).map(m => m[1]);
  if (quoted.length) return quoted;

  return [];
}

// ------------- Parse CSV safely -------------
function parseCSV(csv) {
  const lines = csv
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  const headers = lines[0]
    .split(",")
    .map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1).map((line) => {
    const cols = line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((v) =>
      v.trim().replace(/^"|"$/g, "")
    );
    const row = {};
    headers.forEach((h, i) => (row[h] = cols[i] || ""));
    return row;
  });
  return rows;
}

// ------------- Handle Class Selection -------------
classSelect.addEventListener("change", async () => {
  const selectedClass = classSelect.value;
  if (!selectedClass) return;
  subjectSelect.innerHTML = "";
  chapterSelect.innerHTML = "";
  generateBtn.disabled = true;

  log(`🔍 Fetching NCERT subjects for Class ${selectedClass}...`);
  const prompt = `List all NCERT subjects for Class ${selectedClass} in JSON array format. Example: ["Science","Mathematics","Social Science","English"]`;

  try {
    const text = await askGemini(prompt);
    const subjects = extractArrayFromText(text);

    if (!subjects || !subjects.length) {
      throw new Error("No subjects found in response");
    }

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

// ------------- Handle Subject Selection -------------
subjectSelect.addEventListener("change", async () => {
  const selectedClass = classSelect.value;
  const subject = subjectSelect.value;
  if (!subject) return;
  chapterSelect.innerHTML = "";
  generateBtn.disabled = true;

  log(`📖 Fetching chapters for ${subject} (Class ${selectedClass})...`);
  const prompt = `List all NCERT chapters for Class ${selectedClass}, Subject ${subject} as a JSON array of chapter names only.`;

  try {
    const text = await askGemini(prompt);
    const chapters = extractArrayFromText(text);

    if (!chapters || !chapters.length) {
      throw new Error("No chapters found in response");
    }

    chapterSelect.innerHTML = '<option value="">-- Select Chapter --</option>';
    chapters.forEach((ch) => {
      chapterSelect.innerHTML += `<option value="${ch}">${ch}</option>`;
    });
    chapterSelect.disabled = false;
    log(`✅ Found ${chapters.length} chapters.`);
  } catch (err) {
    log(`❌ Failed to fetch chapters: ${err.message}`);
  }
});

// ------------- Handle Chapter Selection -------------
chapterSelect.addEventListener("change", () => {
  generateBtn.disabled = !chapterSelect.value;
});

// ------------- Handle Question Generation -------------
generateBtn.addEventListener("click", async () => {
  const selectedClass = classSelect.value;
  const subject = subjectSelect.value;
  const chapter = chapterSelect.value;
  if (!chapter) return alert("Please select a chapter first.");

  const tableName = (() => {
    let clean = chapter
      .toLowerCase()
      .replace(/[:;.,!?'"()]/g, "")
      .replace(/\s+/g, "_")
      .trim();
    return clean.endsWith("_quiz") ? clean : `${clean}_quiz`;
  })();

  log(`🧾 Preparing table: ${tableName}`);

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

  try {
    const { error } = await supabase.rpc("execute_sql", { query: sql });
    if (error) throw new Error(error.message);
    log(`✅ Table ${tableName} ready with RLS and policies.`);
  } catch (err) {
    log(`⚠️ Table or RLS setup failed: ${err.message}`);
    return;
  }

  log(`📚 Generating 60 questions for ${subject} → ${chapter}...`);
  const prompt = `
Generate exactly 60 unique quiz questions for Class ${selectedClass}, Subject ${subject}, Chapter ${chapter}.
Return ONLY a valid CSV (no markdown fences, no code blocks) with these headers:
difficulty,question_type,question_text,scenario_reason_text,option_a,option_b,option_c,option_d,correct_answer_key
Ensure all commas are properly escaped in quotes. Example row:
Simple,MCQ,"What is the chemical formula of water?","",H2O,CO2,O2,N2,A
Distribution:
- Simple: 20 (10 MCQ, 5 AR, 5 Case-Based)
- Medium: 20 (10 MCQ, 5 AR, 5 Case-Based)
- Advanced: 20 (10 MCQ, 5 AR, 5 Case-Based)
`;

  try {
    const csvText = await askGemini(prompt);
    log("✅ CSV received. Parsing...");
    const rows = parseCSV(csvText);
    log(`📤 Uploading ${rows.length} rows to Supabase...`);

    const { error: insertError } = await supabase.from(tableName).insert(rows);
    if (insertError) throw insertError;
    log(`🎉 Successfully inserted ${rows.length} questions into ${tableName}.`);

    await updateCurriculum(chapter, tableName);
  } catch (err) {
    log(`❌ Error: ${err.message}`);
  }
});

// ------------- Update curriculum.js (after successful insert) -------------
async function updateCurriculum(chapterTitle, newId) {
  const CURRICULUM_URL =
    "https://raw.githubusercontent.com/ready4exam/ninth/main/js/curriculum.js";

  try {
    log(`🪶 Updating curriculum.js for chapter: ${chapterTitle} → ${newId}`);
    const res = await fetch(CURRICULUM_URL);
    let text = await res.text();

    const safeTitle = chapterTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(
      `\\{\\s*id:\\s*"(.*?)",\\s*title:\\s*"(?:Chapter\\s*\\d+:\\s*)?${safeTitle}"\\s*\\}`,
      "gi"
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
