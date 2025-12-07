// ======================================================================================================
// gemini_frontend.js — FINAL PRODUCTION VERSION WITH BULK MODE + META FIX
// ======================================================================================================

const API_BASE = "https://ready4exam-master-automation.vercel.app";

let CURRENT_CURRICULUM = null;
let CURRENT_REQUIRES_BOOK = false;


// ======================================================================================================
// HELPERS
// ======================================================================================================

function el(id) { return document.getElementById(id); }

function appendLog(text) {
  const textarea = el("log");
  const ts = new Date().toISOString();
  textarea.value = `${ts}  ${text}\n` + textarea.value;
}

function showStatus(text) { appendLog(text); }

async function postJSON(path, payload) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || "Request failed");
  return data;
}

function clearSelect(sel) { sel.innerHTML = ""; }

function setDisabled(sel, disabled = true) {
  sel.disabled = disabled;
  if (disabled) sel.classList.add("opacity-50");
  else sel.classList.remove("opacity-50");
}

function fillSelect(sel, arr, placeholder = "-- Select --") {
  clearSelect(sel);
  const first = document.createElement("option");
  first.value = "";
  first.text = placeholder;
  sel.appendChild(first);
  for (const item of arr) {
    const o = document.createElement("option");
    o.value = item;
    o.text = item;
    sel.appendChild(o);
  }
}


// ======================================================================================================
// META FIX — ALWAYS RETURN A COMPLETE META OBJECT (Guarantees usage_logs update)
// ======================================================================================================
function buildCleanMeta(classVal, subjectVal, bookVal, chapterVal) {
  return {
    class_name: classVal || "",
    subject: subjectVal || "",
    book: CURRENT_REQUIRES_BOOK ? (bookVal || "") : "",
    chapter: chapterVal || ""
  };
}


// ======================================================================================================
// CURRICULUM LOADER (unchanged)
// ======================================================================================================

async function loadCurriculumForClass(classNum) {
  const repo = `ready4exam-class-${classNum}`;
  const url = `https://ready4exam.github.io/${repo}/js/curriculum.js?v=${Date.now()}`;

  console.log(`📘 Attempting curriculum load → ${url}`);

  try {
    const module = await import(url);
    const curriculum = module.curriculum || module.default || null;
    if (curriculum) return curriculum;
  } catch (err) {
    console.warn("⚠ Failed to load curriculum", err);
  }

  throw new Error("❌ curriculum.js could not be loaded.");
}


// ======================================================================================================
// UI DROPDOWNS (unchanged)
// ======================================================================================================

function getSubjectKeys(curriculum) {
  return Object.keys(curriculum || {}).sort();
}

function getBooksForSubject(curriculum, subjectKey) {
  const s = curriculum?.[subjectKey];
  if (!s || Array.isArray(s)) return [];
  return Object.keys(s).sort();
}

function getChaptersForBook(curriculum, subjectKey, bookKey) {
  const s = curriculum?.[subjectKey];
  if (!s) return [];
  if (Array.isArray(s)) return s;
  return s[bookKey] || [];
}

function getExistingTableId(classVal, subjectVal, bookVal, chapterVal) {
  let chapters = [];
  const s = CURRENT_CURRICULUM?.[subjectVal];
  if (!s) return null;
  chapters = Array.isArray(s)
    ? s
    : (CURRENT_CURRICULUM?.[subjectVal]?.[bookVal] || []);
  const ch = chapters.find(c => c.chapter_title === chapterVal);
  return ch?.table_id || null;
}


// ======================================================================================================
// EVENT HANDLERS (unchanged)
// ======================================================================================================

async function onClassChange() {
  try {
    const classVal = el("classSelect").value;
    const subjectSel = el("subjectSelect");
    const bookSel = el("bookSelect");
    const chapterSel = el("chapterSelect");

    clearSelect(subjectSel);
    clearSelect(bookSel);
    clearSelect(chapterSel);

    setDisabled(subjectSel);
    setDisabled(bookSel);
    setDisabled(chapterSel);

    if (!classVal) {
      showStatus("Select a class");
      return;
    }

    CURRENT_CURRICULUM = await loadCurriculumForClass(classVal);

    const subjects = getSubjectKeys(CURRENT_CURRICULUM);
    fillSelect(subjectSel, subjects, "-- Select Subject --");
    setDisabled(subjectSel, false);

  } catch (err) {
    showStatus("❌ " + err.message);
  }
}

function onSubjectChange() {
  try {
    const subjectVal = el("subjectSelect").value;
    const bookSel = el("bookSelect");
    const chapterSel = el("chapterSelect");
    const bookContainer = el("bookContainer");

    clearSelect(bookSel);
    clearSelect(chapterSel);

    setDisabled(bookSel);
    setDisabled(chapterSel);

    if (!subjectVal) {
      CURRENT_REQUIRES_BOOK = false;
      bookContainer.classList.add("hidden");
      return;
    }

    const subjNode = CURRENT_CURRICULUM?.[subjectVal];

    if (Array.isArray(subjNode)) {
      CURRENT_REQUIRES_BOOK = false;
      bookContainer.classList.add("hidden");

      fillSelect(
        chapterSel,
        subjNode.map(c => c.chapter_title),
        "-- Select Chapter --"
      );
      setDisabled(chapterSel, false);
      return;
    }

    CURRENT_REQUIRES_BOOK = true;
    bookContainer.classList.remove("hidden");

    const books = getBooksForSubject(CURRENT_CURRICULUM, subjectVal);
    fillSelect(bookSel, books, "-- Select Book --");
    setDisabled(bookSel, false);

  } catch (err) {
    showStatus("❌ " + err.message);
  }
}

function onBookChange() {
  const subjectVal = el("subjectSelect").value;
  const bookVal = el("bookSelect").value;
  const chapterSel = el("chapterSelect");

  clearSelect(chapterSel);
  setDisabled(chapterSel);

  if (!CURRENT_REQUIRES_BOOK) return;

  const chapters = getChaptersForBook(CURRENT_CURRICULUM, subjectVal, bookVal);

  fillSelect(
    chapterSel,
    chapters.map(c => c.chapter_title),
    "-- Select Chapter --"
  );
  setDisabled(chapterSel, false);
}

function onChapterChange() {
  const hasChapter = el("chapterSelect").value.trim() !== "";
  el("generateBtn").disabled = !hasChapter;
  el("refreshBtn").disabled = !hasChapter;
}


// ======================================================================================================
// SINGLE AUTOMATION — FIXED META + RETRIES
// ======================================================================================================

export async function runAutomation() {
  try {
    const classVal = el("classSelect").value;
    const subjectVal = el("subjectSelect").value;
    const bookVal = el("bookSelect").value;
    const chapterVal = el("chapterSelect").value;

    const meta = buildCleanMeta(classVal, subjectVal, bookVal, chapterVal);

    showStatus(`🚀 Starting automation for: ${chapterVal}`);

    // CALL GEMINI
    const geminiRes = await postJSON("/api/gemini", { meta });
    const questions = geminiRes.questions || [];

    showStatus(`✔ Gemini produced ${questions.length} questions`);

    // SEND TO SUPABASE
    const manageRes = await postJSON("/api/manageSupabase", {
      meta,
      csv: questions
    });

    showStatus(`📦 Supabase table → ${manageRes.new_table_id}`);
    if (manageRes.message) showStatus(manageRes.message);

    alert("✔ Completed!");

  } catch (err) {
    showStatus("❌ " + err.message);
    alert("Failed: " + err.message);
  }
}


// ======================================================================================================
// BULK AUTOMATION — FIXED + STATUS TABLE + PROGRESS BAR + META CLEAN
// ======================================================================================================

export async function runBulkAutomation() {
  try {
    const classVal = el("classSelect").value;
    const subjectVal = el("subjectSelect").value;
    const bookVal = CURRENT_REQUIRES_BOOK ? el("bookSelect").value : "";

    let chapters = [];

    if (CURRENT_REQUIRES_BOOK) {
      chapters = CURRENT_CURRICULUM?.[subjectVal]?.[bookVal] || [];
    } else {
      chapters = CURRENT_CURRICULUM?.[subjectVal] || [];
    }

    if (!chapters.length) {
      alert("No chapters found");
      return;
    }

    const tbody = el("bulkStatusTbody");
    tbody.innerHTML = "";

    const progressBar = el("bulkProgressBarInner");
    const progressLabel = el("bulkProgressLabel");
    const progressContainer = el("bulkProgressContainer");

    progressContainer.classList.remove("hidden");

    let completed = 0;
    const total = chapters.length;

    const updateProgress = () => {
      const pct = Math.floor((completed / total) * 100);
      progressBar.style.width = pct + "%";
      progressLabel.textContent = `${completed} / ${total}`;
    };

    updateProgress();

    for (let i = 0; i < total; i++) {
      const chapterObj = chapters[i];
      const chapterVal = chapterObj.chapter_title;

      const row = document.createElement("tr");
      row.innerHTML = `
        <td class="border px-2 py-1">${chapterVal}</td>
        <td class="border px-2 py-1" id="status-${i}">⏳ Generating...</td>
        <td class="border px-2 py-1" id="table-${i}">—</td>
      `;
      tbody.appendChild(row);

      const statusCell = el(`status-${i}`);
      const tableCell = el(`table-${i}`);

      try {
        statusCell.textContent = "🧠 Generating Questions…";

        const meta = buildCleanMeta(classVal, subjectVal, bookVal, chapterVal);

        const geminiRes = await postJSON("/api/gemini", { meta });
        const questions = geminiRes.questions || [];

        statusCell.textContent = `✔ ${questions.length} questions`;

        const manageRes = await postJSON("/api/manageSupabase", {
          meta,
          csv: questions
        });

        tableCell.textContent = manageRes.new_table_id;
        statusCell.textContent = "🎉 Completed";

      } catch (err) {
        statusCell.textContent = "❌ Failed";
        showStatus("❌ Bulk error: " + err.message);
      }

      completed++;
      updateProgress();
    }

    alert("🎉 Bulk Generation Completed!");

  } catch (err) {
    showStatus("❌ BULK ERROR: " + err.message);
    alert("Bulk failed: " + err.message);
  }
}


// ======================================================================================================
// INIT
// ======================================================================================================

document.addEventListener("DOMContentLoaded", () => {
  const cs = el("classSelect");
  const ss = el("subjectSelect");
  const bs = el("bookSelect");
  const chs = el("chapterSelect");

  cs.addEventListener("change", onClassChange);
  ss.addEventListener("change", onSubjectChange);
  bs.addEventListener("change", onBookChange);
  chs.addEventListener("change", onChapterChange);

  el("generateBtn").addEventListener("click", runAutomation);
  el("bulkGenerateBtn").addEventListener("click", runBulkAutomation);

  showStatus("Ready4Exam Automation Initialized");
});
