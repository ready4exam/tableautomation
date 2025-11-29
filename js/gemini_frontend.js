// ======================================================================================================
// gemini_frontend.js (FINAL PRODUCTION EXPANDED VERSION — 340+ Lines)
// ======================================================================================================
// 🔥 You asked for: 
//    - Same functionality as clean version
//    - Expanded back to similar length as original (~330 lines)
//    - Full comments, clarity, sectioning — NOTHING removed
//
// CORE PRINCIPLES IN THIS VERSION
// --------------------------------
// ✔ Class-12 is *master curriculum* for all classes
// ✔ Class-11 has dual fallback repo (11 → 12)
// ✔ Generation + Refresh use same endpoint / no separate mode button required
// ✔ UI event structure preserved
// ✔ Logging behaviour preserved
// ✔ No deviation from your working automation
// ======================================================================================================


// ------------------------------------------------------------------------------------------------------
// GLOBAL SETTINGS
// ------------------------------------------------------------------------------------------------------

const API_BASE = "https://ready4exam-master-automation.vercel.app";  // backend endpoint

// Store the curriculum JSON object after load
let CURRENT_CURRICULUM = null;



// ======================================================================================================
// SECTION 1 — CURRICULUM LOADER ENGINE
// ======================================================================================================
// This is the most important update in the entire file.
// Earlier → classNumber = repoName (which was breaking for class 11)
// Now:
//      class 12   → always load from "ready4exam-class-12"
//      class 11   → try "ready4exam-11" then fallback "ready4exam-class-12"
//      5–10       → also use 12 as master course base
// ======================================================================================================

async function loadCurriculumForClass(classNum) {

  // Determine repo resolution order
  // --------------------------------------------------
  let repoList = [];

  if (classNum == 11) {
    // special — two paths
    repoList = ["ready4exam-11", "ready4exam-class-12"];
  } else {
    // ALL other classes — use class12 only
    repoList = ["ready4exam-class-12"];
  }

  // Try all repo paths one by one until one loads curriculum.js
  // -----------------------------------------------------------
  for (const repo of repoList) {

    // Cache-busting added so browser reloads fresh
    const url = `https://ready4exam.github.io/${repo}/js/curriculum.js?v=${Date.now()}`;

    console.log(`📘 Attempting curriculum load → ${url}`);

    try {
      // Dynamic import — modern, clean, browser native
      const module = await import(url);

      // Extract curriculum export
      const data = module.curriculum || module.default || null;

      if (data) {
        console.log(`✔ Curriculum Loaded Successfully from → ${repo}`);
        return data;
      }

    } catch (err) {
      console.warn(`⚠ Attempt Failed (${repo}) — Trying next source...`);
    }
  }

  // If no source works → throw hard failure
  throw new Error(
    "❌ Curriculum.js could not be loaded from ANY valid repository.\n" +
    "Check GitHub Pages build OR file path."
  );
}



// ======================================================================================================
// SECTION 2 — Utility Helper Functions (UI + Logs)
// ======================================================================================================

function el(id) {
  return document.getElementById(id);
}

function appendLog(text) {
  const textarea = el("log");
  const timestamp = new Date().toISOString();
  if (textarea) {
    textarea.value = `${timestamp}  ${text}\n` + textarea.value;  // prepend for visibility
  }
}

function showStatus(text) {
  appendLog(text);
}

async function postJSON(path, payload) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) throw new Error(data.error || "Request failed — manageSupabase rejected");

  return data;
}



// ======================================================================================================
// SECTION 3 — SELECT CONTROL UTILITIES (No functional change)
// ======================================================================================================

function clearSelect(sel) { sel.innerHTML = ""; }

function setDisabled(sel, disabled = true) {
  sel.disabled = disabled;
  if (disabled) sel.classList.add("opacity-50");
  else sel.classList.remove("opacity-50");
}

function fillSelect(sel, list) {
  clearSelect(sel);

  const first = document.createElement("option");
  first.text = "-- Select --";
  first.value = "";
  sel.appendChild(first);

  for (const item of list) {
    const option = document.createElement("option");
    option.value = item;
    option.text = item;
    sel.appendChild(option);
  }
}



// ======================================================================================================
// SECTION 4 — Curriculum Data Access Helpers
// ======================================================================================================

function getSubjects(cur) {
  return Object.keys(cur || {}).sort();
}

function getBooks(cur, subject) {
  return Object.keys(cur?.[subject] || {}).sort();
}

function getChapters(cur, subject, book) {
  return Array.isArray(cur?.[subject]?.[book]) ? cur[subject][book] : [];
}

function getExistingTableId(classV, subjectV, bookV, chapterV) {
  const list = CURRENT_CURRICULUM?.[subjectV]?.[bookV] || [];
  const row = list.find(x => x.chapter_title === chapterV);
  return row?.table_id || null;
}



// ======================================================================================================
// SECTION 5 — Dropdown Event Handlers (UI Flow)
// ======================================================================================================
// No changes except curriculum loader now robust.
// ------------------------------------------------------------------------------------------------------

async function onClassChange() {

  try {
    const classNum = el("classSelect").value;
    const subjectSel = el("subjectSelect");
    const bookSel = el("bookSelect");
    const chapterSel = el("chapterSelect");
    const gen = el("generateBtn");
    const ref = el("refreshBtn");

    clearSelect(subjectSel);
    clearSelect(bookSel);
    clearSelect(chapterSel);
    setDisabled(subjectSel);
    setDisabled(bookSel);
    setDisabled(chapterSel);

    gen.disabled = ref.disabled = true;

    if (!classNum) return showStatus("Please select a class.");

    showStatus(`Loading curriculum for Class ${classNum} ...`);

    CURRENT_CURRICULUM = await loadCurriculumForClass(classNum);

    const subjects = getSubjects(CURRENT_CURRICULUM);
    fillSelect(subjectSel, subjects);

    setDisabled(subjectSel, false);
    showStatus(`Loaded ${subjects.length} subjects.`);

  } catch (err) {
    showStatus("❌ Loading failed: " + err.message);
    alert(err.message);
  }
}


function onSubjectChange() {

  const subject = el("subjectSelect").value;
  const books = getBooks(CURRENT_CURRICULUM, subject);

  fillSelect(el("bookSelect"), books);

  setDisabled(el("bookSelect"), false);
  setDisabled(el("chapterSelect"));
  el("generateBtn").disabled = el("refreshBtn").disabled = true;
}


function onBookChange() {

  const subject = el("subjectSelect").value;
  const book = el("bookSelect").value;
  const chapters = getChapters(CURRENT_CURRICULUM, subject, book);

  const chapterSel = el("chapterSelect");
  clearSelect(chapterSel);

  const blank = document.createElement("option");
  blank.text = "-- Select Chapter --";
  blank.value = "";
  chapterSel.appendChild(blank);

  for (const c of chapters) {
    const o = document.createElement("option");
    o.value = c.chapter_title;
    o.text = c.chapter_title + (c.table_id ? ` (${c.table_id})` : "");
    chapterSel.appendChild(o);
  }

  setDisabled(chapterSel, false);
  el("generateBtn").disabled = el("refreshBtn").disabled = true;
}


function onChapterChange() {
  const has = !!el("chapterSelect").value.trim();
  el("generateBtn").disabled = el("refreshBtn").disabled = !has;
}



// ======================================================================================================
// SECTION 6 — CORE AUTOMATION EXECUTION
// ======================================================================================================
// Calling runAutomation() → triggers:
//    1. Gemini question generation
//    2. Supabase insert via /manageSupabase  (this now logs usage and determines refresh vs new)
//    3. (If needed) Curriculum update via backend
// ------------------------------------------------------------------------------------------------------

export async function runAutomation() {

  try {
    const classVal = el("classSelect").value;
    const subjectVal = el("subjectSelect").value;
    const bookVal = el("bookSelect").value;
    const chapterVal = el("chapterSelect").value;

    if (!classVal || !subjectVal || !bookVal || !chapterVal) {
      throw new Error("Please select Class → Subject → Book → Chapter");
    }

    // PHASE 1 — Generate using Gemini
    // -------------------------------------------------
    showStatus("Requesting Gemini ...");
    const gem = await postJSON("/api/gemini", {
      meta:{ class_name:classVal, subject:subjectVal, book:bookVal, chapter:chapterVal }
    });

    showStatus(`Gemini returned ${gem?.questions?.length || 0} questions.`);


    // PHASE 2 — Insert/Refresh to Supabase
    // -------------------------------------------------
    showStatus("Sending to Supabase ...");
    const out = await postJSON("/api/manageSupabase", {
      meta:{ class_name:classVal, subject:subjectVal, book:bookVal, chapter:chapterVal },
      csv: gem.questions
    });

    showStatus(`✔ Table = ${out.table}`);
    showStatus(out.message);


    alert("🎉 Completed Successfully");

    // Reset UI
    el("chapterSelect").value = "";
    el("generateBtn").disabled = el("refreshBtn").disabled = true;

  } catch (err) {
    showStatus("❌ " + err.message);
    alert(err.message);
  }
}



// ======================================================================================================
// SECTION 7 — INIT BINDINGS (DOM Ready)
// ======================================================================================================

document.addEventListener("DOMContentLoaded", () => {

  el("classSelect").addEventListener("change", onClassChange);
  el("subjectSelect").addEventListener("change", onSubjectChange);
  el("bookSelect").addEventListener("change", onBookChange);
  el("chapterSelect").addEventListener("change", onChapterChange);

  // Single engine triggers both modes (generate OR refresh)
  el("generateBtn").addEventListener("click", () => runAutomation());
  el("refreshBtn").addEventListener("click", () => runAutomation());

  appendLog("🚀 Ready4Exam Console Loaded — Automation Active");
});

