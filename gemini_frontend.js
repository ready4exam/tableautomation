// ------------------- Gemini Frontend Automation -------------------
// Works with Supabase + Gemini 2.5 Flash + Ready4Exam backend APIs
// Creates RLS-enabled tables, inserts quiz data, and updates curriculum.js

import { supabase } from "./supabaseClient.js";

const GEMINI_API_KEY = "AIzaSyBX5TYNhyMR9S8AODdFkfsJW-vSbVZVI5Y"; // fallback only
const GEMINI_MODEL = "gemini-2.5-flash";

const classSelect = document.getElementById("classSelect");
const subjectSelect = document.getElementById("subjectSelect");
const chapterSelect = document.getElementById("chapterSelect");
const generateBtn = document.getElementById("generateBtn");
const logEl = document.getElementById("log");

// ---------------- Logging Helper ----------------
const log = (msg) => {
  console.log(msg);
  if (logEl) {
    logEl.textContent += msg + "\n";
    logEl.scrollTop = logEl.scrollHeight;
  }
};

// ---------------- Ask Gemini ----------------
async function askGemini(prompt) {
  // 1️⃣ Try server proxy first
  try {
    const resp = await fetch("https://ready4exam-master-automation.vercel.app/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    if (resp.ok) {
      const json = await resp.json();
      const text =
        json?.candidates?.[0]?.content?.parts?.[0]?.text ||
        json?.output?.[0]?.content?.parts?.[0]?.text ||
        JSON.stringify(json);
      if (text && text.trim()) return text.trim();
    } else {
      console.warn(`⚠️ Proxy responded ${resp.status}, fallback to direct Gemini.`);
    }
  } catch (err) {
    console.warn("⚠️ Proxy failed, fallback to client Gemini:", err.message);
  }

  // 2️⃣ Client fallback (if proxy unavailable)
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

// ---------------- Extract JSON/Array ----------------
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

      // 🧩 Normalize to simple string array
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => {
            if (typeof item === "string") return item;
            if (typeof item === "object" && item !== null) {
              const val = Object.values(item).find((v) => typeof v === "string");
              return val || JSON.stringify(item);
            }
            return String(item);
          })
          .filter(Boolean);
      }

      if (parsed.chapters && Array.isArray(parsed.chapters)) {
        return parsed.chapters.map((c) =>
          typeof c === "object" ? Object.values(c)[0] : c
        );
      }
      if (parsed.subjects && Array.isArray(parsed.subjects)) {
        return parsed.subjects.map((s) =>
          typeof s === "object" ? Object.values(s)[0] : s
        );
      }
    }
  } catch (e) {
    console.warn("⚠️ JSON parse failed:", e.message);
  }

  // fallback
  const quoted = Array.from(text.matchAll(/"([^"]+)"/g)).map((m) => m[1]);
  if (quoted.length) return quoted;
  return text
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---------------- CSV Parser ----------------
function parseCSV(csvText) {
  if (!csvText || typeof csvText !== "string") return [];
  csvText = csvText.replace(/```csv/gi, "").replace(/```/g, "").trim();
  const lines = csvText.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error("CSV data incomplete");

  const headers = lines[0]
    .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase());

  const rows = lines.slice(1).map((line) => {
    const cols = line
      .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
      .map((v) => v.trim().replace(/^"|"$/g, ""));
    const obj = {};
    headers.forEach((h, i) => (obj[h] = cols[i] || ""));
    return obj;
  });

  return rows.filter((r) => Object.values(r).some((v) => v));
}

// ---------------- Class Selection ----------------
classSelect.addEventListener("change", async () => {
  const selectedClass = classSelect.value;
  if (!selectedClass) return;
  subjectSelect.innerHTML = "";
  chapterSelect.innerHTML = "";
  generateBtn.disabled = true;

  log(`🔍 Fetching NCERT subjects for Class ${selectedClass}...`);
  const prompt = `List all NCERT subjects for Class ${selectedClass} in pure JSON array format like ["Science","Mathematics","Social Science","English"].`;

  try {
    const text = await askGemini(prompt);
    const subjects = extractArrayFromText(text);
    if (!subjects.length) throw new Error("No subjects found");
    subjectSelect.innerHTML = '<option value="">-- Select Subject --</option>';
    subjects.forEach((s) => {
      subjectSelect.innerHTML += `<option value="${s}">${s}</option>`;
    });
    subjectSelect.disabled = false;
    log(`✅ Found ${subjects.length} subjects.`);
  } catch (err) {
    log(`❌ Failed: ${err.message}`);
  }
});

// ---------------- Subject Selection ----------------
subjectSelect.addEventListener("change", async () => {
  const selectedClass = classSelect.value;
  const subject = subjectSelect.value;
  if (!subject) return;
  chapterSelect.innerHTML = "";
  generateBtn.disabled = true;

  log(`📖 Fetching chapters for ${subject} (Class ${selectedClass})...`);
  const prompt = `Return ONLY a JSON array of official NCERT chapter titles for Class ${selectedClass}, Subject ${subject}. Each item must be the full chapter title, e.g. "Chapter 1: Matter in Our Surroundings".`;

  try {
    const text = await askGemini(prompt);
    const chapters = extractArrayFromText(text);
    if (!chapters.length) throw new Error("No chapters found");
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

// ---------------- Chapter Selection ----------------
chapterSelect.addEventListener("change", () => {
  generateBtn.disabled = !chapterSelect.value;
});

// ---------------- Generate Questions ----------------
generateBtn.addEventListener("click", async () => {
  const selectedClass = classSelect.value;
  const subject = subjectSelect.value;
  const chapter = chapterSelect.value;
  if (!chapter) return alert("Please select a chapter.");

  const tableName = (() => {
    let clean = chapter
      .toLowerCase()
      .replace(/chapter\s*\d+[:\-]?\s*/i, "")
      .replace(/[^\w]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .trim();
    const words = clean.split("_").filter(Boolean);
    if (words.length > 2) clean = words.slice(0, 3).join("_");
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
    const { error } = await supabase.rpc("execute_sql", { query: createQuery });
    if (error) throw error;
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

    const res = await fetch("https://ready4exam-master-automation.vercel.app/api/manageSupabase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        class: String(selectedClass),
        tableName,
        rows,
      }),
    });

    const j = await res.json();
    if (!res.ok) throw new Error(j.error || JSON.stringify(j));
    log(`🎉 Successfully inserted ${rows.length} questions into ${tableName}.`);

    await updateCurriculum(selectedClass, chapter, tableName);
  } catch (err) {
    log(`❌ Error: ${err.message}`);
  }
});

// ---------------- Update Curriculum ----------------
async function updateCurriculum(className, chapterTitle, newId) {
  try {
    log(`🪶 Updating curriculum.js for Class ${className} → ${chapterTitle} → ${newId}`);
    const res = await fetch("https://ready4exam-master-automation.vercel.app/api/updateCurriculum", {
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
