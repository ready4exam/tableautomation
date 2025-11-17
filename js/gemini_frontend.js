// js/gemini_frontend.js
// TableAutomation frontend (FINAL PRODUCTION VERSION)
// Updated logic:
// - First run for a chapter → create table + update curriculum
// - Refresh run → only delete + insert rows (no curriculum update)
// - Auto-refresh dropdown after first-run update

const API_BASE = "https://ready4exam-master-automation.vercel.app";

let CURRENT_CURRICULUM = null;

// ------------------- Helpers -------------------
async function loadCurriculumForClass(classNum) {
  const url = `https://ready4exam.github.io/ready4exam-${classNum}/js/curriculum.js`;
  const version = Date.now();
  const module = await import(`${url}?v=${version}`).catch((e) => {
    console.error("Failed to import curriculum module:", e);
    throw e;
  });
  const curriculum = module.curriculum || module.default || null;
  if (!curriculum) throw new Error("Curriculum module did not export 'curriculum'.");
  return curriculum;
}

function el(id) {
  return document.getElementById(id);
}

function appendLog(text) {
  const textarea = el("log");
  const ts = new Date().toISOString();
  if (textarea) {
    textarea.value = `${ts}  ${text}\n` + textarea.value;
  } else {
    console.log("[TableAutomation][LOG]", text);
  }
}

function showStatus(text) {
  appendLog(text);
  const statusEl = el("automation-status");
  if (statusEl) statusEl.innerText = text;
}

async function postJSON(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({ ok: false, error: "Invalid JSON response" }));
  if (!res.ok) throw new Error(data.error || data.message || JSON.stringify(data));
  return data;
}

// ------------------- Select utils -------------------
function clearSelect(sel) {
  sel.innerHTML = "";
}

function setDisabled(sel, disabled = true) {
  if (!sel) return;
  sel.disabled = disabled;
  if (disabled) sel.classList.add("opacity-50");
  else sel.classList.remove("opacity-50");
}

function fillSelectWithArray(sel, arr, placeholder = "-- Select --") {
  clearSelect(sel);
  const empty = document.createElement("option");
  empty.value = "";
  empty.text = placeholder;
  sel.appendChild(empty);
  for (const item of arr) {
    const o = document.createElement("option");
    o.value = item;
    o.text = item;
    sel.appendChild(o);
  }
}

// ------------------- Curriculum helpers -------------------
function getSubjectKeys(curriculum) {
  return Object.keys(curriculum || {}).sort();
}

function getBookKeysForSubject(curriculum, subjectKey) {
  if (!curriculum || !subjectKey) return [];
  const booksObj = curriculum[subjectKey] || {};
  return Object.keys(booksObj || {}).sort();
}

function getChaptersForBook(curriculum, subjectKey, bookKey) {
  if (!curriculum || !subjectKey || !bookKey) return [];
  const chapters = curriculum[subjectKey] && curriculum[subjectKey][bookKey];
  return Array.isArray(chapters) ? chapters : [];
}

function getExistingTableId(classVal, subjectVal, bookVal, chapterVal) {
  const chapters = CURRENT_CURRICULUM?.[subjectVal]?.[bookVal] || [];
  const ch = chapters.find(c => c.chapter_title === chapterVal);
  return ch?.table_id || null;
}

// ------------------- Event Handlers -------------------
async function onClassChange() {
  try {
    const classSel = el("classSelect");
    const subjectSel = el("subjectSelect");
    const bookSel = el("bookSelect");
    const bookContainer = el("bookContainer");
    const chapterSel = el("chapterSelect");
    const generateBtn = el("generateBtn");
    const refreshBtn = el("refreshBtn");

    clearSelect(subjectSel);
    clearSelect(bookSel);
    clearSelect(chapterSel);
    setDisabled(subjectSel);
    setDisabled(bookSel);
    setDisabled(chapterSel);
    generateBtn.disabled = true;
    refreshBtn.disabled = true;
    if (bookContainer) bookContainer.classList.remove("hidden");

    const classNum = classSel.value;
    if (!classNum) {
      showStatus("Select a class.");
      return;
    }

    showStatus(`Loading curriculum for class ${classNum}...`);
    CURRENT_CURRICULUM = await loadCurriculumForClass(classNum);

    const subjects = getSubjectKeys(CURRENT_CURRICULUM);
    if (!subjects.length) return showStatus("No subjects found.");

    fillSelectWithArray(subjectSel, subjects, "-- Select Subject --");
    setDisabled(subjectSel, false);

    showStatus(`Loaded ${subjects.length} subjects.`);
  } catch (err) {
    console.error(err);
    alert("Error loading curriculum: " + err.message);
  }
}

function onSubjectChange() {
  try {
    const subjectSel = el("subjectSelect");
    const bookSel = el("bookSelect");
    const chapterSel = el("chapterSelect");
    const generateBtn = el("generateBtn");
    const refreshBtn = el("refreshBtn");

    clearSelect(bookSel);
    clearSelect(chapterSel);
    setDisabled(bookSel);
    setDisabled(chapterSel);
    generateBtn.disabled = true;
    refreshBtn.disabled = true;

    const subjectKey = subjectSel.value;
    if (!subjectKey) return showStatus("Select a subject.");

    const books = getBookKeysForSubject(CURRENT_CURRICULUM, subjectKey);
    if (!books.length) return showStatus("No books found for subject.");

    fillSelectWithArray(bookSel, books, "-- Select Book --");
    setDisabled(bookSel, false);
  } catch (err) {
    console.error(err);
  }
}

function onBookChange() {
  try {
    const subjectSel = el("subjectSelect");
    const bookSel = el("bookSelect");
    const chapterSel = el("chapterSelect");
    const generateBtn = el("generateBtn");
    const refreshBtn = el("refreshBtn");

    clearSelect(chapterSel);
    setDisabled(chapterSel);
    generateBtn.disabled = true;
    refreshBtn.disabled = true;

    const subjectKey = subjectSel.value;
    const bookKey = bookSel.value;
    if (!subjectKey || !bookKey) return;

    const chapters = getChaptersForBook(CURRENT_CURRICULUM, subjectKey, bookKey);
    if (!chapters.length) return showStatus("No chapters found.");

    const empty = document.createElement("option");
    empty.value = "";
    empty.text = "-- Select Chapter --";
    chapterSel.appendChild(empty);

    for (const ch of chapters) {
      const o = document.createElement("option");
      o.value = ch.chapter_title;
      o.text = ch.chapter_title + (ch.table_id ? ` (${ch.table_id})` : "");
      chapterSel.appendChild(o);
    }

    setDisabled(chapterSel, false);
    showStatus(`Loaded ${chapters.length} chapters.`);
  } catch (err) {
    console.error(err);
  }
}

function onChapterChange() {
  const chapterSel = el("chapterSelect");
  const generateBtn = el("generateBtn");
  const refreshBtn = el("refreshBtn");
  const has = chapterSel.value?.trim().length > 0;
  generateBtn.disabled = !has;
  refreshBtn.disabled = !has;
}

// ------------------- Automation core -------------------
export async function runAutomation(options) {
  try {
    const classVal = options?.class || el("classSelect").value;
    const subjectVal = options?.subject || el("subjectSelect").value;
    const bookVal = options?.book || el("bookSelect").value;
    const chapterVal = options?.chapter || el("chapterSelect").value;

    if (!classVal || !subjectVal || !bookVal || !chapterVal)
      throw new Error("Select all dropdowns before generating.");

    const existingTable = getExistingTableId(classVal, subjectVal, bookVal, chapterVal);

    // 🔥 FIX: Refresh only when existing table_id is REAL (contains "_quiz")
    const isRefresh =
      existingTable &&
      typeof existingTable === "string" &&
      existingTable.includes("_quiz");

    showStatus(`Starting ${isRefresh ? "Refresh" : "Automation"}: ${chapterVal}`);

    // 1️⃣ Gemini
    showStatus("Requesting Gemini...");
    const geminiRes = await postJSON("/api/gemini", {
      meta: { class_name: classVal, subject: subjectVal, book: bookVal, chapter: chapterVal }
    });
    const questions = geminiRes.questions || [];
    showStatus(`Gemini produced ${questions.length} questions.`);

    // 2️⃣ manageSupabase
    showStatus(`${isRefresh ? "Refreshing" : "Uploading"} to Supabase...`);
    const manageRes = await postJSON("/api/manageSupabase", {
      meta: { class_name: classVal, subject: subjectVal, book: bookVal, chapter: chapterVal },
      csv: questions
    });

    const newTableId = manageRes.new_table_id;
    showStatus(`Supabase table → ${newTableId}`);

    // 3️⃣ updateCurriculum — ONLY IF FIRST RUN
    if (!isRefresh) {
      showStatus("Updating curriculum...");
      try {
        await postJSON("/api/updateCurriculum", {
          class_name: classVal,
          subject: subjectVal,
          book: bookVal,
          chapter: chapterVal,
          new_table_id: newTableId
        });
        showStatus("Curriculum updated.");
        CURRENT_CURRICULUM = await loadCurriculumForClass(classVal);
        onBookChange(); // update dropdown
      } catch (err) {
        console.warn("curriculum update failed", err);
      }
    } else {
      showStatus("Curriculum unchanged (Refresh mode).");
    }

    alert(`✔ ${isRefresh ? "Refreshed" : "Generated"} Successfully!`);
    showStatus("Done! Ready for next chapter.");

    el("chapterSelect").value = "";
    el("generateBtn").disabled = true;
    el("refreshBtn").disabled = true;

  } catch (err) {
    console.error(err);
    alert("Failed: " + err.message);
    showStatus("Failed: " + err.message);
  }
}

// ------------------- Refresh button -------------------
async function onRefreshClick() {
  await runAutomation({});
}

// ------------------- Initialization -------------------
document.addEventListener("DOMContentLoaded", () => {
  const classSel = el("classSelect");
  const subjectSel = el("subjectSelect");
  const bookSel = el("bookSelect");
  const chapterSel = el("chapterSelect");
  const generateBtn = el("generateBtn");
  const refreshBtn = el("refreshBtn");
  const bookContainer = el("bookContainer");

  if (!classSel || !subjectSel || !bookSel || !chapterSel)
    return console.error("DOM Missing");

  setDisabled(subjectSel);
  setDisabled(bookSel);
  setDisabled(chapterSel);
  generateBtn.disabled = true;
  refreshBtn.disabled = true;
  if (bookContainer) bookContainer.classList.remove("hidden");

  classSel.addEventListener("change", onClassChange);
  subjectSel.addEventListener("change", onSubjectChange);
  bookSel.addEventListener("change", onBookChange);
  chapterSel.addEventListener("change", onChapterChange);
  generateBtn.addEventListener("click", () => runAutomation({}));
  refreshBtn.addEventListener("click", onRefreshClick);

  appendLog("Ready4Exam TableAutomation Ready");
});
