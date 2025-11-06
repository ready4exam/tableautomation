// File: gemini_frontend.js
import { supabase } from "./supabaseClient.js";

const GEMINI_MODEL = "gemini-2.5-flash";
const FRONTEND_ORIGIN = window.location.origin;

const logEl = document.getElementById("log");
const log = (msg) => {
  console.log(msg);
  if (logEl) {
    logEl.textContent += msg + "\n";
    logEl.scrollTop = logEl.scrollHeight;
  }
};

const classSelect = document.getElementById("classSelect");
const subjectSelect = document.getElementById("subjectSelect");
const chapterSelect = document.getElementById("chapterSelect");
const generateBtn = document.getElementById("generateBtn");

// ---------- askGemini ----------
async function askGemini(prompt) {
  try {
    const res = await fetch("https://ready4exam-master-automation.vercel.app/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    if (!res.ok) throw new Error(`Gemini proxy failed ${res.status}`);
    const data = await res.json();

    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      data?.output?.[0]?.content?.parts?.[0]?.text ||
      JSON.stringify(data);

    if (!text) throw new Error("Empty Gemini response");
    return text.trim();
  } catch (err) {
    log(`❌ askGemini error: ${err.message}`);
    throw err;
  }
}

// ---------- extractArray ----------
function extractArrayFromText(text) {
  try {
    const match = text.match(/\[.*\]/s);
    if (match) return JSON.parse(match[0]);
  } catch {}
  return text.split(/[,;\n]/).map((t) => t.trim()).filter(Boolean);
}

// ---------- parseCSV ----------
function parseCSV(csvText) {
  csvText = csvText.replace(/```csv/gi, "").replace(/```/g, "").trim();
  const lines = csvText.split("\n").filter((l) => l.trim());
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const obj = {};
    headers.forEach((h, i) => (obj[h] = cols[i] || ""));
    return obj;
  });
}

// ---------- Class change ----------
classSelect.addEventListener("change", async () => {
  const selectedClass = classSelect.value;
  if (!selectedClass) return;
  log(`🔍 Fetching NCERT subjects for Class ${selectedClass}...`);

  const prompt = `List NCERT subjects for Class ${selectedClass} as a pure JSON array.`;
  const text = await askGemini(prompt);
  const subjects = extractArrayFromText(text);

  subjectSelect.innerHTML = '<option value="">-- Select Subject --</option>';
  subjects.forEach((s) => {
    subjectSelect.innerHTML += `<option value="${s}">${s}</option>`;
  });
  subjectSelect.disabled = false;
  log(`✅ Found ${subjects.length} subjects.`);
});

// ---------- Subject change ----------
subjectSelect.addEventListener("change", async () => {
  const selectedClass = classSelect.value;
  const subject = subjectSelect.value;
  if (!subject) return;

  log(`📖 Fetching chapters for ${subject} (Class ${selectedClass})...`);
  const prompt = `Return JSON array of official NCERT chapters for Class ${selectedClass}, Subject ${subject}.`;
  const text = await askGemini(prompt);
  const chapters = extractArrayFromText(text);

  chapterSelect.innerHTML = '<option value="">-- Select Chapter --</option>';
  chapters.forEach((c) => {
    chapterSelect.innerHTML += `<option value="${c}">${c}</option>`;
  });
  chapterSelect.disabled = false;
  log(`✅ Found ${chapters.length} chapters.`);
});

chapterSelect.addEventListener("change", () => {
  generateBtn.disabled = !chapterSelect.value;
});

// ---------- Generate questions ----------
generateBtn.addEventListener("click", async () => {
  const selectedClass = classSelect.value;
  const subject = subjectSelect.value;
  const chapter = chapterSelect.value;
  if (!chapter) return alert("Select a chapter.");

  const tableName = chapter
    .toLowerCase()
    .replace(/chapter\s*\d+[:\-]?\s*/i, "")
    .replace(/[^\w]+/g, "_")
    .split("_")
    .slice(0, 2)
    .join("_")
    .concat("_quiz");

  log(`🧾 Preparing table: ${tableName}`);

  const prompt = `
Generate exactly 60 quiz questions for Class ${selectedClass}, Subject ${subject}, Chapter ${chapter}.
Return valid CSV (no markdown) with headers:
difficulty,question_type,question_text,scenario_reason_text,option_a,option_b,option_c,option_d,correct_answer_key
`;

  try {
    const csvText = await askGemini(prompt);
    const rows = parseCSV(csvText);
    log(`📤 Sending ${rows.length} rows to backend for insertion...`);

    const res = await fetch("https://ready4exam-master-automation.vercel.app/api/manageSupabase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ class: selectedClass, tableName, rows }),
    });

    const j = await res.json();
    if (!res.ok) throw new Error(j.error || "Failed to insert rows");
    log(`🎉 ${rows.length} questions inserted successfully.`);

    await updateCurriculum(selectedClass, chapter, tableName);
  } catch (err) {
    log(`❌ ${err.message}`);
  }
});

// ---------- Update curriculum ----------
async function updateCurriculum(className, chapterTitle, newId) {
  try {
    log(`🪶 Updating curriculum.js for ${className} → ${chapterTitle}`);
    const res = await fetch("https://ready4exam-master-automation.vercel.app/api/updateCurriculum", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ className, chapterTitle, newId }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || "Update failed");
    log("✅ curriculum.js updated successfully.");
  } catch (err) {
    log(`❌ curriculum update failed: ${err.message}`);
  }
}
