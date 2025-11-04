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
// ---------- Safe askGemini (client) with server-proxy fallback ----------
/**
 * askGemini(prompt)
 * - First tries server-side proxy at /api/gemini (recommended).
 * - If proxy fails or not available, FALLS BACK to existing client-side direct call using GEMINI_API_KEY (if present).
 *
 * This keeps things non-breaking while enabling secure server-side usage.
 */
async function askGemini(prompt) {
  // Try server proxy first
  try {
    const proxyResp = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });

    // If proxy returned OK and valid JSON, prefer it
    if (proxyResp.ok) {
      const proxyJson = await proxyResp.json();
      // Many server proxies return Gemini JSON; try to extract text safely
      const outputText =
        proxyJson?.candidates?.[0]?.content?.parts?.[0]?.text ||
        proxyJson?.output?.[0]?.content?.parts?.[0]?.text ||
        (typeof proxyJson === 'string' ? proxyJson : null) ||
        JSON.stringify(proxyJson);

      if (outputText && String(outputText).trim().length > 0) {
        return String(outputText).trim();
      }
      // If proxy returned but with empty payload, fall through to client fallback
      console.warn('⚠️ /api/gemini returned empty output; falling back to client call.');
    } else {
      console.warn(`⚠️ /api/gemini responded ${proxyResp.status} — falling back to client call.`);
    }
  } catch (err) {
    console.warn('⚠️ Proxy /api/gemini failed:', err?.message || err);
  }

  // --- Client-side fallback (non-breaking) ---
  // If your repo still defines GEMINI_API_KEY in some file, this preserves existing behavior.
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
      throw err; // bubble up so caller sees failure
    }
  }

  // If neither proxy nor client call worked, return an error
  throw new Error('No available Gemini provider: proxy failed and GEMINI_API_KEY not present.');
}


// ------------- Universal JSON / Array Extractor -------------
function extractArrayFromText(text) {
  if (!text || typeof text !== "string") return [];

  try {
    // Try to find any JSON block in text
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (match) {
      const candidate = match[0]
        .replace(/```(?:json)?/gi, "")
        .replace(/```/g, "")
        .trim();
      const parsed = JSON.parse(candidate);

      // Handle { "subjects": [...] } or { "chapters": [...] }
      if (Array.isArray(parsed)) return parsed;
      if (parsed.subjects && Array.isArray(parsed.subjects)) return parsed.subjects;
      if (parsed.chapters && Array.isArray(parsed.chapters)) return parsed.chapters;
      if (parsed.data && Array.isArray(parsed.data)) return parsed.data;
    }
  } catch (e) {
    console.warn("⚠️ JSON parse failed:", e);
  }

  // Try extracting quoted list manually
  const quoted = Array.from(text.matchAll(/"([^"]+)"/g)).map(m => m[1]);
  if (quoted.length) return quoted;

  // Fallback: comma-separated
  const parts = text.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
  if (parts.length) return parts;

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
  const prompt = `List all NCERT subjects for Class ${selectedClass} in pure JSON array format like ["Science","Mathematics","Social Science","English","Hindi","Sanskrit"].`;

  try {
    const text = await askGemini(prompt);
    const subjects = extractArrayFromText(text);

    if (!subjects || !subjects.length) throw new Error("No subjects found in response");

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

  // ✅ Updated, more reliable prompt
  const prompt = `
Return ONLY a valid JSON array (no markdown, no code fences) of official NCERT chapter titles
for Class ${selectedClass}, Subject ${subject}.
Each entry must be the full chapter title string, e.g.:
["Chapter 1: Matter in Our Surroundings", "Chapter 2: Is Matter Around Us Pure", ...]
`;

  try {
    const text = await askGeminiWithRetry(prompt);
    const chapters = extractArrayFromText(text);

    if (!chapters || !chapters.length) throw new Error("No chapters found in response");

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
    // Convert to lowercase and replace punctuation/spaces
    let clean = chapter
      .toLowerCase()
      .replace(/chapter\s*\d+[:\-]?\s*/i, "") // remove Chapter X:
      .replace(/[:;.,!?'"()]/g, "")
      .replace(/\s+/g, "_")
      .trim();

    // Simplify for multi-word chapters → only first 2 words
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

// ------------- ✅ Enhanced Retry for Chapter Fetch -------------
async function askGeminiWithRetry(prompt) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const text = await askGemini(prompt);
      if (text && text.length > 5) return text;
      log(`⚠️ Empty Gemini response (attempt ${attempt}) — retrying...`);
      await new Promise(r => setTimeout(r, 1200));
    } catch (e) {
      log(`⚠️ Gemini API error (attempt ${attempt}): ${e.message}`);
      if (attempt === 2) throw new Error("Gemini failed twice consecutively");
    }
  }
  throw new Error("No valid response from Gemini after retry");
}

// ------------- ✅ Improved Curriculum.js Update (calls Vercel API) -------------
async function updateCurriculum(chapterTitle, newId) {
  // This function now calls your serverless endpoint to commit the change to GitHub.
  // Endpoint should be deployed at /api/updateCurriculum (Vercel serverless function).
  // Body: { chapterTitle, newId }
  try {
    log(`🪶 Updating curriculum.js for chapter: ${chapterTitle} → ${newId} (server commit)`);

    const res = await fetch('/api/updateCurriculum', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chapterTitle, newId })
    });

    const j = await res.json();
    if (!res.ok) {
      log(`❌ curriculum commit failed: ${j.error || JSON.stringify(j)}`);
      console.error("curriculum commit details:", j);
      return;
    }

    log(`✅ curriculum.js committed. Commit SHA: ${j.commit || j.commit?.sha || j.commit?.id || 'unknown'}`);
    console.log("Server response:", j);
  } catch (err) {
    log(`❌ Failed to update curriculum.js via API: ${err.message}`);
    console.error(err);
  }
}
