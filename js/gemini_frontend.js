// js/gemini_frontend.js
// Ready4Exam Unified Frontend Controller (Gemini + Supabase + Curriculum Sync)

const API_BASE = "https://ready4exam-master-automation.vercel.app/api"; // backend base

// UI element references
const classSelect = document.getElementById("classSelect");
const subjectSelect = document.getElementById("subjectSelect");
const chapterSelect = document.getElementById("chapterSelect");
const generateBtn = document.getElementById("generateBtn");
const logEl = document.getElementById("log");

// Global state
let curriculumData = {};
let generatedData = { csv: null, meta: null };

// ---------- Utility ----------
function log(msg, type = "info") {
  const time = new Date().toLocaleTimeString();
  const color =
    type === "error" ? "#f87171" :
    type === "success" ? "#4ade80" :
    type === "warn" ? "#facc15" : "#93c5fd";
  logEl.innerHTML += `<span style="color:${color}">[${time}] ${msg}</span>\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function sanitizeFileName(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 80);
}

// ---------- Load Curriculum ----------
async function loadCurriculum() {
  log("📘 Loading curriculum data...");
  try {
    // Option A: Local JSON (for testing)
    const res = await fetch("./curriculum.json");

    if (!res.ok) throw new Error("Unable to fetch curriculum.json");
    curriculumData = await res.json();

    log("✅ Curriculum loaded successfully.");
  } catch (err) {
    log("❌ Failed to load curriculum: " + err.message, "error");
  }
}

// ---------- Dropdown Logic ----------
function populateSubjects(classValue) {
  subjectSelect.innerHTML = `<option value="">-- Select Subject --</option>`;
  chapterSelect.innerHTML = `<option value="">-- Select Chapter --</option>`;
  subjectSelect.disabled = true;
  chapterSelect.disabled = true;
  generateBtn.disabled = true;

  if (!classValue || !curriculumData[classValue]) return;

  Object.keys(curriculumData[classValue]).forEach((subject) => {
    const opt = document.createElement("option");
    opt.value = subject;
    opt.textContent = subject;
    subjectSelect.appendChild(opt);
  });

  subjectSelect.disabled = false;
}

function populateChapters(classValue, subjectValue) {
  chapterSelect.innerHTML = `<option value="">-- Select Chapter --</option>`;
  chapterSelect.disabled = true;
  generateBtn.disabled = true;

  if (!subjectValue || !curriculumData[classValue]?.[subjectValue]) return;

  curriculumData[classValue][subjectValue].forEach((chapter) => {
    const opt = document.createElement("option");
    opt.value = chapter;
    opt.textContent = chapter;
    chapterSelect.appendChild(opt);
  });

  chapterSelect.disabled = false;
}

function enableGenerateButton() {
  generateBtn.disabled =
    !classSelect.value || !subjectSelect.value || !chapterSelect.value;
}

// ---------- Phase 1: Gemini Question Generation ----------
async function generateQuiz() {
  const cls = classSelect.value;
  const subject = subjectSelect.value;
  const chapter = chapterSelect.value;

  if (!cls || !subject || !chapter) {
    log("⚠️ Please select class, subject, and chapter before running.", "warn");
    return;
  }

  generateBtn.disabled = true;
  log(`🚀 Starting generation for Class ${cls} — ${subject}: ${chapter}`);

  try {
    const res = await fetch(`${API_BASE}/gemini`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ class: cls, subject, chapter }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Gemini generation failed");

    generatedData.csv = data.csv;
    generatedData.meta = data.meta || {
      class: cls,
      subject,
      chapter,
      tableName: `${subject}_${chapter}`.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
    };

    log("✅ Gemini generation successful.", "success");
    log(`📄 Generated table name: ${generatedData.meta.tableName}`);

    await uploadToSupabase(); // trigger next phase
  } catch (err) {
    log("❌ Gemini Error: " + err.message, "error");
  } finally {
    generateBtn.disabled = false;
  }
}

// ---------- Phase 2: Upload to Supabase ----------
async function uploadToSupabase() {
  if (!generatedData.csv || !generatedData.meta) {
    log("⚠️ No data to upload. Generate first.", "warn");
    return;
  }

  log("📤 Uploading to Supabase...");
  try {
    const res = await fetch(`${API_BASE}/manageSupabase`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(generatedData),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload failed");

    log(`✅ Supabase upload successful. Table: ${data.table}`, "success");
    log(`📊 Rows inserted: ${data.rows}`);

    await syncCurriculum(); // next phase
  } catch (err) {
    log("❌ Supabase Error: " + err.message, "error");
  }
}

// ---------- Phase 3: Curriculum Sync ----------
async function syncCurriculum() {
  if (!generatedData.meta) {
    log("⚠️ No metadata found for curriculum update.", "warn");
    return;
  }

  log("🔄 Syncing curriculum with backend...");
  try {
    const res = await fetch(`${API_BASE}/updateCurriculum`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meta: generatedData.meta }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Curriculum sync failed");

    log("✅ Curriculum successfully updated.", "success");
    log("🎉 Full automation completed!");
  } catch (err) {
    log("❌ Curriculum Sync Error: " + err.message, "error");
  }
}

// ---------- Event Bindings ----------
classSelect.addEventListener("change", (e) => populateSubjects(e.target.value));
subjectSelect.addEventListener("change", (e) =>
  populateChapters(classSelect.value, e.target.value)
);
chapterSelect.addEventListener("change", enableGenerateButton);
generateBtn.addEventListener("click", generateQuiz);
window.addEventListener("DOMContentLoaded", loadCurriculum);
