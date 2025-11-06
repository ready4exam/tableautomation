// -------------------- gemini_frontend.js --------------------
import { supabase } from "./supabaseClient.js";

const API_BASE = "https://ready4exam-master-automation.vercel.app";
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_API_KEY = "AIzaSyBX5TYNhyMR9S8AODdFkfsJW-vSbVZVI5Y"; // fallback

const logEl = document.getElementById("log");
const classSelect = document.getElementById("classSelect");
const subjectSelect = document.getElementById("subjectSelect");
const chapterSelect = document.getElementById("chapterSelect");
const generateBtn = document.getElementById("generateBtn");

const log = (msg) => {
  console.log(msg);
  logEl.textContent += msg + "\n";
  logEl.scrollTop = logEl.scrollHeight;
};

async function askGemini(prompt) {
  try {
    const resp = await fetch(`${API_BASE}/api/gemini`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    if (!resp.ok) throw new Error(`Proxy error ${resp.status}`);
    const json = await resp.json();
    return (
      json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
      JSON.stringify(json)
    );
  } catch (err) {
    console.warn("⚠️ askGemini fallback:", err.message);
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
        }),
      }
    );
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
  }
}

function extractArrayFromText(text) {
  try {
    const match = text.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
  } catch {}
  return text
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseCSV(csv) {
  csv = csv.replace(/```csv|```/g, "").trim();
  const [headerLine, ...lines] = csv.split("\n").filter(Boolean);
  const headers = headerLine.split(",").map((h) => h.trim().toLowerCase());
  return lines.map((line) => {
    const values = line.split(",").map((v) => v.trim());
    const row = {};
    headers.forEach((h, i) => (row[h] = values[i] || ""));
    return row;
  });
}

// Dropdown flows
classSelect.addEventListener("change", async () => {
  const cls = classSelect.value;
  subjectSelect.innerHTML = "";
  chapterSelect.innerHTML = "";
  generateBtn.disabled = true;
  log(`🔍 Fetching NCERT subjects for Class ${cls}...`);

  const text = await askGemini(
    `List all NCERT subjects for Class ${cls} as JSON array.`
  );
  const subjects = extractArrayFromText(text);
  subjectSelect.innerHTML = '<option value="">-- Select Subject --</option>';
  subjects.forEach((s) => {
    subjectSelect.innerHTML += `<option value="${s}">${s}</option>`;
  });
  subjectSelect.disabled = false;
  log(`✅ Found ${subjects.length} subjects.`);
});

subjectSelect.addEventListener("change", async () => {
  const cls = classSelect.value;
  const subj = subjectSelect.value;
  log(`📖 Fetching chapters for ${subj}...`);
  const text = await askGemini(
    `List all NCERT chapters for Class ${cls}, Subject ${subj}, as JSON array like ["Chapter 1: ..."].`
  );
  const chapters = extractArrayFromText(text);
  chapterSelect.innerHTML = '<option value="">-- Select Chapter --</option>';
  chapters.forEach((c) => (chapterSelect.innerHTML += `<option>${c}</option>`));
  chapterSelect.disabled = false;
  log(`✅ Found ${chapters.length} chapters.`);
});

generateBtn.addEventListener("click", async () => {
  const cls = classSelect.value;
  const subj = subjectSelect.value;
  const ch = chapterSelect.value;
  const table = ch
    .toLowerCase()
    .replace(/chapter\s*\d+[:\-]?\s*/i, "")
    .replace(/[^\w]+/g, "_")
    .replace(/^_|_$/g, "")
    .concat("_quiz");

  log(`📚 Generating 60 questions for ${subj} → ${ch}...`);
  const prompt = `
Generate 60 quiz questions for Class ${cls}, Subject ${subj}, Chapter ${ch}.
Return ONLY valid CSV with headers:
difficulty,question_type,question_text,scenario_reason_text,option_a,option_b,option_c,option_d,correct_answer_key
`;
  const csv = await askGemini(prompt);
  const rows = parseCSV(csv);

  const r = await fetch(`${API_BASE}/api/manageSupabase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ class: cls, tableName: table, rows }),
  });

  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "Insert failed");
  log(`✅ Inserted ${rows.length} into ${table}`);
  await updateCurriculum(cls, ch, table);
});

async function updateCurriculum(cls, ch, id) {
  log(`🪶 Updating curriculum.js for ${ch} → ${id}`);
  const r = await fetch(`${API_BASE}/api/updateCurriculum`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ className: cls, chapterTitle: ch, newId: id }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error);
  log(`✅ curriculum.js updated.`);
}
