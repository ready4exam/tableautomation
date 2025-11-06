// ------------------- Gemini Frontend Automation ------------------- 
// Works with supabaseClient.js and Gemini 2.5 Flash
// Creates RLS-enabled tables, adds policies, uploads generated quiz data,
// and updates curriculum.js reference IDs automatically.

import { supabase } from './supabaseClient.js';

const GEMINI_API_KEY = "AIzaSyBX5TYNhyMR9S8AODdFkfsJW-vSbVZVI5Y"; // 🔑 Replace with your Gemini API key
const GEMINI_MODEL = "gemini-2.5-flash";

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
  try {
    const proxyResp = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });

    if (proxyResp.ok) {
      const proxyJson = await proxyResp.json();
      const outputText =
        proxyJson?.candidates?.[0]?.content?.parts?.[0]?.text ||
        proxyJson?.output?.[0]?.content?.parts?.[0]?.text ||
        (typeof proxyJson === 'string' ? proxyJson : null) ||
        JSON.stringify(proxyJson);

      if (outputText && String(outputText).trim().length > 0) {
        return String(outputText).trim();
      }
      console.warn('⚠️ /api/gemini returned empty output; falling back to client call.');
    } else {
      console.warn(`⚠️ /api/gemini responded ${proxyResp.status} — falling back to client call.`);
    }
  } catch (err) {
    console.warn('⚠️ Proxy /api/gemini failed:', err?.message || err);
  }

  if (typeof GEMINI_API_KEY !== 'undefined' && GEMINI_API_KEY) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
      const body = { contents: [ { role: "user", parts: [{ text: prompt }] } ] };

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
      if (!output) throw new Error("Empty response from Gemini (client-call)");
      return output;
    } catch (err) {
      console.error("❌ Client Gemini call failed:", err);
      throw err;
    }
  }

  throw new Error('No available Gemini provider: proxy failed and GEMINI_API_KEY not present.');
}

// ------------- JSON / Array Extractor -------------
function extractArrayFromText(text) {
  if (!text || typeof text !== "string") return [];
  try {
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (match) {
      const candidate = match[0]
        .replace(/```(?:json)?/gi, "")
        .replace(/```/g, "")
        .trim();
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) return parsed;
      if (parsed.subjects && Array.isArray(parsed.subjects)) return parsed.subjects;
      if (parsed.chapters && Array.isArray(parsed.chapters)) return parsed.chapters;
      if (parsed.data && Array.isArray(parsed.data)) return parsed.data;
    }
  } catch (e) {
    console.warn("⚠️ JSON parse failed:", e);
  }
  const quoted = Array.from(text.matchAll(/"([^"]+)"/g)).map(m => m[1]);
  if (quoted.length) return quoted;
  const parts = text.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : [];
}

// ------------- Parse CSV -------------
function parseCSV(csv) {
  const lines = csv.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1).map((line) => {
    const cols = line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((v) => v.trim().replace(/^"|"$/g, ""));
    const row = {};
    headers.forEach((h, i) => (row[h] = cols[i] || ""));
    return row;
  });
  return rows;
}

// ------------- Class Selection -------------
classSelect.addEventListener("change", async () => {
  const selectedClass = classSelect.value;
  if (!selectedClass) return;
  subjectSelect.innerHTML = "";
  chapterSelect.innerHTML = "";
  generateBtn.disabled = true;

  log(`🔍 Fetching NCERT subjects for Class ${selectedClass}...`);
  const prompt = `List all NCERT subjects for Class ${selectedClass} in pure JSON array format like ["Science","Mathematics","Social Science","English","Hindi","Sanskrit"].`;

  try {
    const text = await askGemini(prompt);
    const subjects = extractArrayFromText(text);
    if (!subjects?.length) throw new Error("No subjects found in response");

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

// ------------- Subject Selection -------------
subjectSelect.addEventListener("change", async () => {
  const selectedClass = classSelect.value;
  const subject = subjectSelect.value;
  if (!subject) return;
  chapterSelect.innerHTML = "";
  generateBtn.disabled = true;

  log(`📖 Fetching chapters for ${subject} (Class ${selectedClass})...`);

  const prompt = `
Return ONLY a valid JSON array of official NCERT chapter titles
for Class ${selectedClass}, Subject ${subject}.
Example: ["Chapter 1: Matter in Our Surroundings", "Chapter 2: Is Matter Around Us Pure", ...]
`;

  try {
    const text = await askGeminiWithRetry(prompt);
    const chapters = extractArrayFromText(text);
    if (!chapters?.length) throw new Error("No chapters found in response");

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

chapterSelect.addEventListener("change", () => {
  generateBtn.disabled = !chapterSelect.value;
});

// ------------- Generate Questions -------------
generateBtn.addEventListener("click", async () => {
  const selectedClass = classSelect.value;
  const subject = subjectSelect.value;
  const chapter = chapterSelect.value;
  if (!chapter) return alert("Please select a chapter first.");

  const tableName = (() => {
    let clean = chapter
      .toLowerCase()
      .replace(/chapter\s*\d+[:\-]?\s*/i, "")
      .replace(/[:;.,!?'"()]/g, "")
      .replace(/\s+/g, "_")
      .trim();
    const words = clean.split("_").filter(Boolean);
    if (words.length > 1) clean = words.slice(0, 2).join("_");
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
  `;

  try {
    const { error } = await supabase.rpc("execute_sql", { query: sql });
    if (error) throw new Error(error.message);
    log(`✅ Table ${tableName} ready with RLS.`);
  } catch (err) {
    log(`⚠️ Table or RLS setup failed: ${err.message}`);
    return;
  }

  log(`📚 Generating 60 questions for ${subject} → ${chapter}...`);
  const prompt = `
Generate exactly 60 unique quiz questions for Class ${selectedClass}, Subject ${subject}, Chapter ${chapter}.
Return ONLY a valid CSV with headers:
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

// ------------- Retry Helper -------------
async function askGeminiWithRetry(prompt) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const text = await askGemini(prompt);
      if (text?.length > 5) return text;
      log(`⚠️ Empty Gemini response (attempt ${attempt}) — retrying...`);
      await new Promise(r => setTimeout(r, 1200));
    } catch (e) {
      log(`⚠️ Gemini API error (attempt ${attempt}): ${e.message}`);
      if (attempt === 2) throw new Error("Gemini failed twice consecutively");
    }
  }
  throw new Error("No valid response from Gemini after retry");
}

// ------------- ✅ Curriculum Update (with className) -------------
async function updateCurriculum(className, chapterTitle, newId) {
  try {
    log(`🪶 Updating curriculum.js for Class ${className} → Chapter: ${chapterTitle} → ${newId}`);
    const res = await fetch('/api/updateCurriculum', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ className, chapterTitle, newId }),
    });

    const j = await res.json();
    if (!res.ok) {
      log(`❌ curriculum commit failed: ${j.error || JSON.stringify(j)}`);
      return;
    }

    log(`✅ curriculum.js committed successfully. Commit SHA: ${j.commitSHA || 'unknown'}`);
  } catch (err) {
    log(`❌ Failed to update curriculum.js via API: ${err.message}`);
  }
}
