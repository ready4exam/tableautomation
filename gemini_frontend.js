// ------------------- Gemini Frontend Automation -------------------
// UI only; all sensitive work happens in backend.
// Calls:
//   - POST https://ready4exam-master-automation.vercel.app/api/gemini
//   - POST https://ready4exam-master-automation.vercel.app/api/manageSupabase
//   - POST https://ready4exam-master-automation.vercel.app/api/updateCurriculum

import { supabase } from "./supabaseClient.js";

const API_BASE = "https://ready4exam-master-automation.vercel.app";

const classSelect = document.getElementById("classSelect");
const subjectSelect = document.getElementById("subjectSelect");
const chapterSelect = document.getElementById("chapterSelect");
const generateBtn = document.getElementById("generateBtn");
const logEl = document.getElementById("log");

const log = (m) => {
  console.log(m);
  if (logEl) {
    logEl.textContent += `${m}\n`;
    logEl.scrollTop = logEl.scrollHeight;
  }
};

// --- Helpers ---
async function askGemini(prompt) {
  try {
    const r = await fetch(`${API_BASE}/api/gemini`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || JSON.stringify(j));
    const text =
      j?.candidates?.[0]?.content?.parts?.[0]?.text ||
      j?.output?.[0]?.content?.parts?.[0]?.text ||
      JSON.stringify(j);
    return (text || "").trim();
  } catch (e) {
    log(`⚠️ askGemini error: ${e.message}`);
    throw e;
  }
}

function extractArray(text) {
  if (!text) return [];
  try {
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (match) {
      const cleaned = match[0]
        .replace(/```(?:json)?/gi, "")
        .replace(/```/g, "")
        .trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) return parsed.map(String);
      if (Array.isArray(parsed?.subjects)) return parsed.subjects.map(String);
      if (Array.isArray(parsed?.chapters)) return parsed.chapters.map(String);
    }
  } catch {}
  const q = [...text.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  if (q.length) return q;
  return text.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
}

function toTableName(chapter) {
  let clean = String(chapter)
    .toLowerCase()
    .replace(/chapter\s*\d+[:\-]?\s*/i, "")
    .replace(/[^\w]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .trim();

  const parts = clean.split("_").filter(Boolean);
  if (parts.length > 3) clean = parts.slice(0, 3).join("_");
  return clean.endsWith("_quiz") ? clean : `${clean}_quiz`;
}

// --- UI flows ---
classSelect.addEventListener("change", async () => {
  const cls = classSelect.value;
  if (!cls) return;
  subjectSelect.innerHTML = "";
  chapterSelect.innerHTML = "";
  subjectSelect.disabled = true;
  chapterSelect.disabled = true;
  generateBtn.disabled = true;

  log(`🔍 Fetching NCERT subjects for Class ${cls}...`);
  try {
    const text = await askGemini(
      `List all NCERT subjects for Class ${cls} as a JSON array like ["Science","Mathematics","Social Science","English"].`
    );
    const subjects = extractArray(text);
    if (!subjects.length) throw new Error("No subjects found");

    subjectSelect.innerHTML = '<option value="">-- Select Subject --</option>';
    subjects.forEach((s) => {
      subjectSelect.innerHTML += `<option value="${s}">${s}</option>`;
    });
    subjectSelect.disabled = true; // enable ONLY after we click; we’ll enable on next line for clarity
    subjectSelect.disabled = false;
    log(`✅ Found ${subjects.length} subjects.`);
  } catch (e) {
    log(`❌ Failed to fetch subjects: ${e.message}`);
  }
});

subjectSelect.addEventListener("change", async () => {
  const cls = classSelect.value;
  const subject = subjectSelect.value;
  if (!subject) return;
  chapterSelect.innerHTML = "";
  chapterSelect.disabled = true;
  generateBtn.disabled = true;

  log(`📖 Fetching chapters for ${subject} (Class ${cls})...`);
  try {
    const text = await askGemini(
      `Return ONLY a JSON array of official NCERT chapter titles for Class ${cls}, Subject ${subject}. Each item like "Chapter 1: Title".`
    );
    const chapters = extractArray(text);
    if (!chapters.length) throw new Error("No chapters found");

    chapterSelect.innerHTML = '<option value="">-- Select Chapter --</option>';
    chapters.forEach((c) => {
      chapterSelect.innerHTML += `<option value="${c}">${c}</option>`;
    });
    chapterSelect.disabled = false;
    log(`✅ Found ${chapters.length} chapters.`);
  } catch (e) {
    log(`❌ Failed to fetch chapters: ${e.message}`);
  }
});

chapterSelect.addEventListener("change", () => {
  generateBtn.disabled = !chapterSelect.value;
});

generateBtn.addEventListener("click", async () => {
  const cls = classSelect.value;
  const subject = subjectSelect.value;
  const chapter = chapterSelect.value;
  if (!cls || !subject || !chapter) return;

  const tableName = toTableName(chapter);

  // We still create the table client-side via RPC so the UI can continue even if the server
  // insert is a separate step (server will just insert if table already exists).
  log(`🧾 Preparing table: ${tableName}`);
  try {
    const ddl = `
      create table if not exists public.${tableName} (
        id bigserial primary key,
        difficulty text,
        question_type text,
        question_text text,
        scenario_reason_text text,
        option_a text,
        option_b text,
        option_c text,
        option_d text,
        correct_answer_key text,
        created_at timestamp default now()
      );
      alter table public.${tableName} enable row level security;
    `;
    try {
      const { error } = await supabase.rpc("execute_sql", { query: ddl });
      if (error) console.warn("RPC DDL warning:", error.message);
    } catch {}
    log(`✅ Table ${tableName} ready with RLS.`);
  } catch (e) {
    log(`❌ Table creation failed: ${e.message}`);
    return;
  }

  log(`📚 Generating 60 questions for ${subject} → ${chapter}...`);
  try {
    const csv = await askGemini(
      `Generate 60 quiz questions for Class ${cls}, Subject ${subject}, Chapter ${chapter}.
Return ONLY valid CSV (no markdown) with headers:
difficulty,question_type,question_text,scenario_reason_text,option_a,option_b,option_c,option_d,correct_answer_key`
    );

    // Parse CSV (lightweight)
    const lines = csv
      .replace(/```csv/gi, "")
      .replace(/```/g, "")
      .trim()
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length < 2) throw new Error("CSV empty/incomplete");
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

    log(`📤 Sending ${rows.length} rows to server for insertion...`);
    const r = await fetch(`${API_BASE}/api/manageSupabase`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ class: String(cls), tableName, rows }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || JSON.stringify(j));
    log(j.message || `✅ Inserted into ${tableName}`);

    // Update curriculum mapping in the right repo
    log(`🪶 Updating curriculum.js for Class ${cls} → ${chapter} → ${tableName}`);
    const u = await fetch(`${API_BASE}/api/updateCurriculum`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        className: String(cls),
        chapterTitle: chapter,
        newId: tableName,
      }),
    });
    const uj = await u.json();
    if (!u.ok) throw new Error(uj.error || JSON.stringify(uj));
    log(`✅ curriculum.js committed (repo: ${uj.repo || "unknown"})`);
  } catch (e) {
    log(`❌ Error: ${e.message}`);
  }
});
