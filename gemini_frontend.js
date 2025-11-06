// ------------------- Gemini Frontend Automation -------------------
// Works with your secure Vercel API (https://ready4exam-master-automation.vercel.app/api/gemini)
// Creates tables, inserts quiz data, and updates curriculum.js via backend endpoints

import { supabase } from "./supabaseClient.js";

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

// ---------- Secure Gemini Proxy Call ----------
async function askGemini(prompt) {
  try {
    const proxyResp = await fetch(
      "https://ready4exam-master-automation.vercel.app/api/gemini",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      }
    );

    if (!proxyResp.ok) {
      const errText = await proxyResp.text();
      throw new Error(`Gemini proxy error ${proxyResp.status}: ${errText}`);
    }

    const data = await proxyResp.json();
    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      data?.output?.[0]?.content?.parts?.[0]?.text ||
      JSON.stringify(data);
    if (!text || !text.trim()) throw new Error("Empty response from Gemini proxy");
    return text.trim();
  } catch (err) {
    console.error("❌ askGemini error:", err);
    throw err;
  }
}

// ---------- Extract Array / JSON ----------
function extractArrayFromText(text) {
  if (!text || typeof text !== "string") return [];
  try {
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (match) {
      const clean = match[0].replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(clean);
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

// ---------- Parse CSV ----------
function parseCSV(csv) {
  csv = csv.replace(/```csv/gi, "").replace(/```/g, "").trim();
  const lines = csv.split("\n").filter((l) => l.trim());
  if (lines.length < 2) throw new Error("CSV incomplete");

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
  return rows;
}

// ---------- Handle Class Selection ----------
classSelect.addEventListener("change", async () => {
  const selectedClass = classSelect.value;
  if (!selectedClass) return;
  subjectSelect.innerHTML = "";
  chapterSelect.innerHTML = "";
  generateBtn.disabled = true;

  log(`🔍 Fetching NCERT subjects for Class ${selectedClass}...`);
  const prompt = `List all NCERT subjects for Class ${selectedClass} as a JSON array like ["Science","Math","Social Science","English"].`;

  try {
    const text = await askGemini(prompt);
    const subjects = extractArrayFromText(text);
    subjectSelect.innerHTML = '<option value="">-- Select Subject --</option>';
    subjects.forEach((s) => (subjectSelect.innerHTML += `<option>${s}</option>`));
    subjectSelect.disabled = false;
    log(`✅ Found ${subjects.length} subjects.`);
  } catch (err) {
    log(`❌ Failed: ${err.message}`);
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
  const prompt = `Return a JSON array of all NCERT chapter titles for Class ${selectedClass}, Subject ${subject}.`;

  try {
    const text = await askGemini(prompt);
    const chapters = extractArrayFromText(text);
    chapterSelect.innerHTML = '<option value="">-- Select Chapter --</option>';
    chapters.forEach((c) => (chapterSelect.innerHTML += `<option>${c}</option>`));
    chapterSelect.disabled = false;
    log(`✅ Found ${chapters.length} chapters.`);
  } catch (err) {
    log(`❌ Failed: ${err.message}`);
  }
});

// ---------- Generate Quiz ----------
generateBtn.addEventListener("click", async () => {
  const selectedClass = classSelect.value;
  const subject = subjectSelect.value;
  const chapter = chapterSelect.value;
  if (!chapter) return alert("Select a chapter first.");

  const tableName = chapter
    .toLowerCase()
    .replace(/chapter\s*\d+[:\-]?\s*/i, "")
    .replace(/[^\w]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .concat("_quiz");

  log(`🧾 Preparing table: ${tableName}`);

  const prompt = `
Generate exactly 60 quiz questions for Class ${selectedClass}, Subject ${subject}, Chapter ${chapter}.
Return a valid CSV with headers:
difficulty,question_type,question_text,scenario_reason_text,option_a,option_b,option_c,option_d,correct_answer_key
`;

  try {
    const csv = await askGemini(prompt);
    const rows = parseCSV(csv);
    log(`📤 Uploading ${rows.length} rows...`);

    const resp = await fetch("https://ready4exam-master-automation.vercel.app/api/manageSupabase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ class: selectedClass, tableName, rows }),
    });

    const json = await resp.json();
    if (!resp.ok) throw new Error(json.error || JSON.stringify(json));
    log(`🎉 Inserted ${rows.length} rows into ${tableName}`);
    await updateCurriculum(selectedClass, chapter, tableName);
  } catch (err) {
    log(`❌ Error: ${err.message}`);
  }
});

// ---------- Update curriculum.js ----------
async function updateCurriculum(className, chapterTitle, newId) {
  try {
    const res = await fetch("https://ready4exam-master-automation.vercel.app/api/updateCurriculum", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ className, chapterTitle, newId }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || "Update failed");
    log(`✅ curriculum.js updated successfully.`);
  } catch (err) {
    log(`❌ curriculum update failed: ${err.message}`);
  }
}
