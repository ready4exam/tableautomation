// js/gemini_frontend.js
// TableAutomation frontend (Mode A) — A+ version
// - Class → Subject → Book → Chapter UI
// - Calls MasterAutomation backend APIs
// - Updates class repo curriculum table_id
// - Redirects to quiz-engine with table & difficulty

const API_BASE = "https://ready4exam-master-automation.vercel.app";

let CURRENT_CURRICULUM = null;

// ------------------- Helpers -------------------
async function loadCurriculumForClass(classNum) {
  const url = `https://ready4exam.github.io/ready4exam-${classNum}/js/curriculum.js`;
  const module = await import(url).catch((e) => {
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
    setDisabled(subjectSel, true);
    setDisabled(bookSel, true);
    setDisabled(chapterSel, true);
    generateBtn.disabled = true;
    refreshBtn.disabled = true;
    if (bookContainer) bookContainer.classList.remove("hidden");

    const classNum = classSel.value;
    if (!classNum) {
      showStatus("Select a class.");
      return;
    }

    showStatus(`Loading curriculum for class ${classNum}...`);
    const curriculum = await loadCurriculumForClass(classNum);
    CURRENT_CURRICULUM = curriculum;

    const subjects = getSubjectKeys(curriculum);
    if (!subjects.length) {
      showStatus(`No subjects found in curriculum for class ${classNum}.`);
      return;
    }

    fillSelectWithArray(subjectSel, subjects, "-- Select Subject --");
    setDisabled(subjectSel, false);
    fillSelectWithArray(bookSel, ["-- Select Book --"], "-- Select Book --");
    setDisabled(bookSel, true);
    clearSelect(chapterSel);
    setDisabled(chapterSel, true);

    showStatus(`Loaded ${subjects.length} subjects for class ${classNum}.`);
  } catch (err) {
    console.error("onClassChange error:", err);
    showStatus("Error loading curriculum: " + (err.message || err));
    alert("Error loading curriculum: " + (err.message || err));
  }
}

function onSubjectChange() {
  try {
    const subjectSel = el("subjectSelect");
    const bookSel = el("bookSelect");
    const bookContainer = el("bookContainer");
    const chapterSel = el("chapterSelect");
    const generateBtn = el("generateBtn");
    const refreshBtn = el("refreshBtn");

    clearSelect(bookSel);
    clearSelect(chapterSel);
    setDisabled(bookSel, true);
    setDisabled(chapterSel, true);
    generateBtn.disabled = true;
    refreshBtn.disabled = true;
    if (bookContainer) bookContainer.classList.remove("hidden");

    const subjectKey = subjectSel.value;
    if (!subjectKey) {
      showStatus("Select a subject.");
      return;
    }

    const curriculum = CURRENT_CURRICULUM;
    const books = getBookKeysForSubject(curriculum, subjectKey);

    if (!books.length) {
      showStatus(`No books found for subject "${subjectKey}".`);
      return;
    }

    fillSelectWithArray(bookSel, books, "-- Select Book --");
    setDisabled(bookSel, false);
    clearSelect(chapterSel);
    setDisabled(chapterSel, true);
    generateBtn.disabled = true;
    refreshBtn.disabled = true;

    showStatus(`Loaded ${books.length} books for subject "${subjectKey}".`);
  } catch (err) {
    console.error("onSubjectChange error:", err);
    showStatus("Error while selecting subject: " + (err.message || err));
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
    setDisabled(chapterSel, true);
    generateBtn.disabled = true;
    refreshBtn.disabled = true;

    const subjectKey = subjectSel.value;
    const bookKey = bookSel.value;
    if (!subjectKey || !bookKey) return;

    const curriculum = CURRENT_CURRICULUM;
    const chapters = getChaptersForBook(curriculum, subjectKey, bookKey);
    if (!chapters.length) {
      showStatus(`No chapters found for ${subjectKey} / ${bookKey}`);
      return;
    }

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
    showStatus(`Loaded ${chapters.length} chapters for ${bookKey}.`);
  } catch (err) {
    console.error("onBookChange error:", err);
    showStatus("Error loading chapters: " + (err.message || err));
  }
}

function onChapterChange() {
  const chapterSel = el("chapterSelect");
  const generateBtn = el("generateBtn");
  const refreshBtn = el("refreshBtn");

  const has = chapterSel.value && chapterSel.value.trim().length > 0;
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
    const difficultyVal = options?.difficulty || "Medium"; // Option 2: difficulty-aware, UI can extend later

    if (!classVal || !subjectVal || !bookVal || !chapterVal) {
      throw new Error("Please select class, subject, book and chapter before generating.");
    }

    showStatus(`Starting automation: Class ${classVal} / ${subjectVal} / ${bookVal} / ${chapterVal}`);

    // 1) Gemini — generate questions
    showStatus("Requesting Gemini to generate questions...");
    const geminiRes = await postJSON("/api/gemini", {
      meta: { class_name: classVal, subject: subjectVal, book: bookVal, chapter: chapterVal, difficulty: difficultyVal }
    });
    if (!geminiRes.ok) throw new Error(geminiRes.error || "Gemini failed.");
    const questions = geminiRes.questions || [];
    if (!questions.length) throw new Error("Gemini returned no questions.");
    showStatus(`Gemini produced ${questions.length} questions.`);

    // 2) Decide existing table_id from CURRENT_CURRICULUM (if it's a string and not a numeric placeholder)
    let existingTableId = null;
    try {
      const curriculum = CURRENT_CURRICULUM || await loadCurriculumForClass(classVal);
      const subjKeys = Object.keys(curriculum || {});
      for (const sk of subjKeys) {
        if (sk.toLowerCase() === subjectVal.toLowerCase() || sk.toLowerCase().includes(subjectVal.toLowerCase())) {
          const books = curriculum[sk];
          const bk = bookVal;
          const chapters = books[bk] || [];
          for (const ch of chapters) {
            if (ch.chapter_title && ch.chapter_title.trim().toLowerCase() === chapterVal.trim().toLowerCase()) {
              const tid = ch.table_id;
              if (tid && isNaN(Number(tid))) {
                existingTableId = tid;
              }
              break;
            }
          }
          break;
        }
      }
    } catch (e) {
      console.warn("Could not determine existing table_id:", e);
    }

    // 3) manageSupabase — create/reset table & insert questions
    showStatus("Uploading questions to Supabase...");
    const manageBody = {
      meta: { class_name: classVal, subject: subjectVal, book: bookVal, chapter: chapterVal, table_id: existingTableId },
      csv: questions
    };
    const manageRes = await postJSON("/api/manageSupabase", manageBody);
    if (!manageRes.ok) throw new Error(manageRes.error || "manageSupabase failed");
    const newTableId = manageRes.new_table_id || manageRes.table;
    showStatus(`Supabase: table updated -> ${newTableId}`);

    // 4) updateCurriculum — write new table_id to class repo curriculum.js
    try {
      showStatus("Updating curriculum in class repo...");
      const updateBody = {
        class_name: classVal,
        subject: subjectVal,
        book: bookVal,
        chapter: chapterVal,
        new_table_id: newTableId
      };
      const updateRes = await postJSON("/api/updateCurriculum", updateBody);
      if (!updateRes.ok) {
        console.warn("updateCurriculum returned not ok:", updateRes);
        showStatus("Warning: updateCurriculum returned not-ok. Proceeding to quiz.");
      } else {
        showStatus(`Curriculum updated in ${updateRes.repo || "class repo"}.`);
      }
    } catch (err) {
      console.warn("Auto-update failed:", err);
      showStatus("Warning: failed to auto-update curriculum. Proceeding to quiz.");
    }

    // 5) Redirect to quiz-engine
    showStatus("Redirecting to quiz engine...");
    const redirectUrl = `./quiz-engine.html?table=${encodeURIComponent(newTableId)}&difficulty=${encodeURIComponent(difficultyVal)}`;
    window.location.href = redirectUrl;

  } catch (err) {
    console.error("runAutomation error:", err);
    showStatus("Automation failed: " + (err.message || err));
    alert("Automation failed: " + (err.message || err));
    throw err;
  }
}

// ------------------- Refresh flow -------------------
async function onRefreshClick() {
  try {
    const classVal = el("classSelect").value;
    const subjectVal = el("subjectSelect").value;
    const bookVal = el("bookSelect").value;
    const chapterVal = el("chapterSelect").value;
    if (!classVal || !subjectVal || !bookVal || !chapterVal) {
      alert("Select class, subject, book, chapter first.");
      return;
    }
    if (!confirm("Refresh will re-run generation (Gemini → Supabase → updateCurriculum). Proceed?")) return;

    await runAutomation({ class: classVal, subject: subjectVal, book: bookVal, chapter: chapterVal, difficulty: "Medium" });
  } catch (err) {
    console.error("Refresh failed:", err);
    showStatus("Refresh failed: " + (err.message || err));
  }
}

// ------------------- Initialization -------------------
document.addEventListener("DOMContentLoaded", function () {
  const classSel = el("classSelect");
  const subjectSel = el("subjectSelect");
  const bookSel = el("bookSelect");
  const chapterSel = el("chapterSelect");
  const generateBtn = el("generateBtn");
  const refreshBtn = el("refreshBtn");
  const bookContainer = el("bookContainer");

  if (!classSel || !subjectSel || !bookSel || !chapterSel || !generateBtn || !refreshBtn) {
    console.error("Required DOM elements missing. UI will not initialize.");
    appendLog("Required DOM elements missing in index.html.");
    return;
  }

  setDisabled(subjectSel, true);
  setDisabled(bookSel, true);
  setDisabled(chapterSel, true);
  generateBtn.disabled = true;
  refreshBtn.disabled = true;
  if (bookContainer) bookContainer.classList.remove("hidden");

  classSel.addEventListener("change", onClassChange);
  subjectSel.addEventListener("change", onSubjectChange);
  bookSel.addEventListener("change", onBookChange);
  chapterSel.addEventListener("change", onChapterChange);

  generateBtn.addEventListener("click", async () => {
    generateBtn.disabled = true;
    try {
      await runAutomation({});
    } finally {
      generateBtn.disabled = false;
    }
  });

  refreshBtn.addEventListener("click", onRefreshClick);

  appendLog("TableAutomation UI initialized. Select class to begin.");
});
