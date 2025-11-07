// gemini_frontend.js
// v2 — Combined Automation Controller (Gemini + Supabase + Curriculum Sync)

const API_BASE = "https://ready4exam-master-automation.vercel.app/api"; // Backend base URL

// DOM references
const classSelect = document.getElementById("classSelect");
const subjectSelect = document.getElementById("subjectSelect");
const chapterSelect = document.getElementById("chapterSelect");
const generateBtn = document.getElementById("generateBtn");
const logEl = document.getElementById("log");

let curriculumData = {};
let generatedData = {
  csv: null,
  meta: null,
};

// Utility — log messages
function log(msg, type = "info") {
  const time = new Date().toLocaleTimeString();
  const color =
    type === "error"
      ? "color:#f87171"
      : type === "success"
      ? "color:#4ade80"
      : "color:#93c5fd";
  logEl.innerHTML += `<span style="${color}">[${time}] ${msg}</span><br>`;
  logEl.scrollTop = logEl.scrollHeight;
}

// --- 1️⃣ LOAD CURRICULUM DATA ---
async function loadCurriculum() {
  log("📘 Loading curriculum data...");
  try {
    const res = await fetch(`${API_BASE}/curriculum.json`);
    if (!res.ok) throw new Error("Unable to fetch curriculum.json");
    curriculumData = await res.json();
    log("✅ Curriculum loaded successfully.");
  } catch (err) {
    log("❌ Failed to load curriculum: " + err.message, "error");
  }
}

// --- Populate Subjects ---
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

// --- Populate Chapters ---
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

// --- Enable Generate Button ---
function enableGenerateButton() {
  generateBtn.disabled =
    !classSelect.value || !subjectSelect.value || !chapterSelect.value;
}

// --- 2️⃣ GENERATE QUIZ (Gemini) ---
async function generateQuiz() {
  const cls = classSelect.value;
  const subject = subjectSelect.value;
  const chapter = chapterSelect.value;

  if (!cls || !subject || !chapter) {
    log("⚠️ Please select class, subject, and chapter before generating.", "error");
    return;
  }

  generateBtn.disabled = true;
  log(`🚀 Generating questions for Class ${cls} — ${subject} (${chapter})...`);

  try {
    const res = await fetch(`${API_BASE}/gemini`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ class: cls, subject, chapter }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Gemini generation failed.");

    generatedData.csv = data.csv;
    generatedData.meta = data.meta || {
      class: cls,
      subject,
      chapter,
      tableName: data.table || `${subject}_${chapter}`.toLowerCase().replace(/\\s+/g, "_"),
    };

    log("✅ Gemini generation completed successfully.", "success");
    log(`📦 Table target: ${generatedData.meta.tableName}`);
    log("⚙️ Proceeding to Supabase table creation and upload...");

    // Automatically trigger next automation phase
    await uploadToSupabase();

  } catch (err) {
    log("❌ Error during Gemini generation: " + err.message, "error");
  } finally {
    generateBtn.disabled = false;
  }
}

// --- 3️⃣ UPLOAD TO SUPABASE ---
async function uploadToSupabase() {
  if (!generatedData.csv || !generatedData.meta) {
    log("⚠️ No generated CSV found. Please generate first.", "error");
    return;
  }

  log("📤 Uploading data to Supabase (table creation if needed)...");

  try {
    const res = await fetch(`${API_BASE}/manageSupabase`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        csv: generatedData.csv,
        meta: generatedData.meta,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload failed.");

    log(`✅ Supabase upload completed: ${data.message}`, "success");
    log(`🧱 Table created: ${data.table || generatedData.meta.tableName}`);
    log(`📊 Rows inserted: ${data.rows}`);

    // Proceed to curriculum sync
    await syncCurriculum();

  } catch (err) {
    log("❌ Error uploading to Supabase: " + err.message, "error");
  }
}

// --- 4️⃣ SYNC CURRICULUM (Update curriculum.js) ---
async function syncCurriculum() {
  log("🔄 Syncing updated table with curriculum.js...");

  try {
    const res = await fetch(`${API_BASE}/updateCurriculum`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meta: generatedData.meta }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Curriculum sync failed.");

    log("✅ Curriculum synced successfully.", "success");
    log(`🎓 ${generatedData.meta.subject} → ${generatedData.meta.chapter} updated in curriculum.js`);
    log("🎉 Full automation (Gemini + Supabase + Curriculum) completed!");
  } catch (err) {
    log("❌ Error during curriculum sync: " + err.message, "error");
  }
}

// --- 5️⃣ EVENT LISTENERS ---
classSelect.addEventListener("change", (e) => populateSubjects(e.target.value));
subjectSelect.addEventListener("change", (e) =>
  populateChapters(classSelect.value, e.target.value)
);
chapterSelect.addEventListener("change", enableGenerateButton);
generateBtn.addEventListener("click", generateQuiz);

// --- Initialize ---
window.addEventListener("DOMContentLoaded", loadCurriculum);
