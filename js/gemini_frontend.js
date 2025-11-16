// js/gemini_frontend.js
// TableAutomation frontend (FINAL with fix)
// First run → create table & update curriculum
// Refresh → ONLY replace questions (no curriculum update)

const API_BASE = "https://ready4exam-master-automation.vercel.app";
let CURRENT_CURRICULUM = null;

// ------------------- Helpers -------------------
async function loadCurriculumForClass(classNum) {
  const url = `https://ready4exam.github.io/ready4exam-${classNum}/js/curriculum.js`;
  const module = await import(`${url}?v=${Date.now()}`).catch((e) => {
    showStatus("❌ Failed to load curriculum.js: " + e.message);
    throw e;
  });
  const curriculum = module.curriculum || module.default;
  if (!curriculum) throw new Error("Missing curriculum export.");
  return curriculum;
}

function el(id) { return document.getElementById(id); }
function appendLog(msg) {
  const t = el("log");
  if (t) t.value = `${new Date().toISOString()}  ${msg}\n` + t.value;
  console.log(msg);
}
function showStatus(msg) {
  appendLog(msg);
  const statusEl = el("automation-status");
  if (statusEl) statusEl.innerText = msg;
}

async function postJSON(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || json.message || "Unknown error");
  return json;
}

// ------------------- Curriculum lookup -------------------
function getExistingTableId(classVal, subjectVal, bookVal, chapterVal) {
  return CURRENT_CURRICULUM?.[subjectVal]?.[bookVal]
    ?.find((c) => c.chapter_title === chapterVal)?.table_id || null;
}

// Table exists only if ID is non-numeric
function isRealTableId(id) {
  return id && !/^\d+$/.test(id);
}

// ------------------- UI updates -------------------
function resetControls() {
  el("chapterSelect").value = "";
  el("generateBtn").disabled = true;
  el("refreshBtn").disabled = true;
}

function populateChapters() {
  const subjectSel = el("subjectSelect");
  const bookSel = el("bookSelect");
  const chapterSel = el("chapterSelect");

  const subject = subjectSel.value;
  const book = bookSel.value;
  const chapters = CURRENT_CURRICULUM?.[subject]?.[book] || [];

  chapterSel.innerHTML = `<option value="">-- Select Chapter --</option>`;
  for (const ch of chapters) {
    const opt = document.createElement("option");
    opt.value = ch.chapter_title;
    opt.text = ch.chapter_title + (ch.table_id ? ` (${ch.table_id})` : "");
    chapterSel.appendChild(opt);
  }
}

// ------------------- Core automation -------------------
export async function runAutomation() {
  try {
    const classVal = el("classSelect").value;
    const subjectVal = el("subjectSelect").value;
    const bookVal = el("bookSelect").value;
    const chapterVal = el("chapterSelect").value;

    const existing = getExistingTableId(classVal, subjectVal, bookVal, chapterVal);
    const refreshMode = isRealTableId(existing);

    showStatus(`${refreshMode ? "Refreshing" : "Creating"} table for: ${chapterVal}`);

    // 1️⃣ Gemini
    showStatus("Generating questions using Gemini...");
    const geminiRes = await postJSON("/api/gemini", {
      meta: { class_name: classVal, subject: subjectVal, book: bookVal, chapter: chapterVal }
    });
    const questions = geminiRes.questions;
    showStatus(`Gemini done. ${questions.length} questions ready.`);

    // 2️⃣ Supabase
    showStatus("Updating Supabase table...");
    const manageRes = await postJSON("/api/manageSupabase", {
      meta: { class_name: classVal, subject: subjectVal, book: bookVal, chapter: chapterVal },
      csv: questions
    });
    const newTableId = manageRes.new_table_id;
    showStatus(`Supabase updated: ${newTableId}`);

    // 3️⃣ Curriculum update → ONLY first run
    if (!refreshMode) {
      showStatus("Updating curriculum.js in class repo...");
      try {
        const updateRes = await postJSON("/api/updateCurriculum", {
          class_name: classVal,
          subject: subjectVal,
          book: bookVal,
          chapter: chapterVal,
          new_table_id: newTableId
        });
        showStatus("✔ Curriculum updated successfully.");

        CURRENT_CURRICULUM = await loadCurriculumForClass(classVal);
        populateChapters(); // Reflect new table_id in dropdown

      } catch (err) {
        console.error("updateCurriculum failed:", err);
        showStatus("⚠ Failed to update curriculum: " + err.message);
      }
    } else {
      showStatus("ℹ Refresh mode: curriculum unchanged");
    }

    alert(`✔ ${refreshMode ? "Refreshed" : "Uploaded"} Successfully!`);
    resetControls();

  } catch (err) {
    console.error("❌ Automation failed:", err);
    showStatus("Error: " + err.message);
    alert("Failed: " + err.message);
  }
}

// ------------------- Dropdown logic -------------------
document.addEventListener("DOMContentLoaded", () => {
  const classSel = el("classSelect");
  const subjectSel = el("subjectSelect");
  const bookSel = el("bookSelect");
  const chapterSel = el("chapterSelect");

  el("generateBtn").disabled = true;
  el("refreshBtn").disabled = true;

  classSel.addEventListener("change", async () => {
    const v = classSel.value;
    if (!v) return;
    showStatus("Loading curriculum...");
    CURRENT_CURRICULUM = await loadCurriculumForClass(v);

    subjectSel.innerHTML = `<option value="">-- Select Subject --</option>`;
    Object.keys(CURRENT_CURRICULUM).sort().forEach(s => {
      subjectSel.innerHTML += `<option value="${s}">${s}</option>`;
    });

    el("generateBtn").disabled = true;
    el("refreshBtn").disabled = true;
  });

  subjectSel.addEventListener("change", () => {
    const subj = subjectSel.value;
    const books = Object.keys(CURRENT_CURRICULUM?.[subj] || {});
    bookSel.innerHTML = `<option value="">-- Select Book --</option>`;
    books.forEach(b => bookSel.innerHTML += `<option value="${b}">${b}</option>`);
    el("generateBtn").disabled = true;
    el("refreshBtn").disabled = true;
  });

  bookSel.addEventListener("change", populateChapters);

  chapterSel.addEventListener("change", () => {
    const sel = chapterSel.value.trim();
    el("generateBtn").disabled = !sel;
    el("refreshBtn").disabled = !sel;
  });

  appendLog("Ready4Exam TableAutomation Ready");
});
