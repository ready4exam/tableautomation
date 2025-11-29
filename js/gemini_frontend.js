// ======================================================================================================
// gemini_frontend.js (FINAL PRODUCTION EXPANDED VERSION — with correct book-selection behaviour)
// ======================================================================================================
//
// CORE BEHAVIOUR
// --------------
// ✔ Class-12 is the master curriculum source.
// ✔ Class-11 first tries its own repo, then falls back to Class-12.
// ✔ For subjects that have BOOKS (nested structure), book selection is shown and required.
// ✔ For subjects without books (flat subject → chapters array), book selection is hidden and NOT required.
// ✔ Frontend never breaks if book is missing; backend can still log and update without book.
//
// ======================================================================================================

const API_BASE = "https://ready4exam-master-automation.vercel.app";

let CURRENT_CURRICULUM = null;
// Tracks whether the current subject uses a "book" layer (true for 11/12 physics-type structures)
let CURRENT_REQUIRES_BOOK = false;


// ======================================================================================================
// SECTION 1 — CURRICULUM LOADER ENGINE
// ======================================================================================================
//  Class 12 = Master curriculum for most classes.
//  Class 11 = Try ready4exam-11, then fallback to ready4exam-class-12.
// ======================================================================================================

async function loadCurriculumForClass(classNum) {
  let repoList;

  if (classNum == "11" || classNum == 11) {
    // Only Class 11 has its own repo + class12 fallback
    repoList = ["ready4exam-11", "ready4exam-class-12"];
  } else {
    // All other classes will currently use the class-12 curriculum
    repoList = ["ready4exam-class-12"];
  }

  for (const repo of repoList) {
    const url = `https://ready4exam.github.io/${repo}/js/curriculum.js?v=${Date.now()}`;
    console.log(`📘 Attempting curriculum load → ${url}`);

    try {
      const module = await import(url);
      const curriculum = module.curriculum || module.default || null;
      if (curriculum) {
        console.log(`✔ Curriculum loaded from → ${repo}`);
        return curriculum;
      }
    } catch (err) {
      console.warn(`⚠ Failed to load from repo ${repo}, trying next...`);
    }
  }

  throw new Error("❌ curriculum.js could not be loaded from any source.");
}


// ======================================================================================================
// SECTION 2 — Utility Helpers
// ======================================================================================================

function el(id) {
  return document.getElementById(id);
}

function appendLog(text) {
  const textarea = el("log");
  const ts = new Date().toISOString();
  if (textarea) {
    textarea.value = `${ts}  ${text}\n` + textarea.value;
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
  if (!res.ok) throw new Error(data.error || data.message || "Request failed");

  return data;
}

function clearSelect(sel) {
  sel.innerHTML = "";
}

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
// SECTION 3 — Curriculum Access Helpers
// ======================================================================================================

function getSubjectKeys(curriculum) {
  return Object.keys(curriculum || {}).sort();
}

function getBooksForSubject(curriculum, subjectKey) {
  const subjNode = curriculum?.[subjectKey];
  if (!subjNode || Array.isArray(subjNode)) return []; // no books for flat structures
  return Object.keys(subjNode || {}).sort();
}

function getChaptersForBook(curriculum, subjectKey, bookKey) {
  const subjNode = curriculum?.[subjectKey];
  if (!subjNode) return [];

  // If subject node is an array of chapters (no books)
  if (Array.isArray(subjNode)) {
    return subjNode;
  }

  // Otherwise subject node is object of books
  const chapters = subjNode[bookKey];
  return Array.isArray(chapters) ? chapters : [];
}

function getExistingTableId(classVal, subjectVal, bookVal, chapterVal) {
  let chapters = [];

  const subjNode = CURRENT_CURRICULUM?.[subjectVal];

  if (!subjNode) return null;

  if (Array.isArray(subjNode)) {
    // No book layer — subject itself is an array
    chapters = subjNode;
  } else {
    // Has book layer
    chapters = (CURRENT_CURRICULUM?.[subjectVal]?.[bookVal]) || [];
  }

  const ch = chapters.find(c => c.chapter_title === chapterVal);
  return ch?.table_id || null;
}


// ======================================================================================================
// SECTION 4 — Dropdown Event Handlers
// ======================================================================================================

async function onClassChange() {
  try {
    const classSel = el("classSelect");
    const subjectSel = el("subjectSelect");
    const bookSel = el("bookSelect");
    const chapterSel = el("chapterSelect");
    const generateBtn = el("generateBtn");
    const refreshBtn = el("refreshBtn");
    const bookContainer = el("bookContainer");

    const classNum = classSel.value;

    clearSelect(subjectSel);
    clearSelect(bookSel);
    clearSelect(chapterSel);

    setDisabled(subjectSel);
    setDisabled(bookSel);
    setDisabled(chapterSel);

    generateBtn.disabled = true;
    refreshBtn.disabled = true;

    // Initially hide / reset book container
    CURRENT_REQUIRES_BOOK = false;
    if (bookContainer) bookContainer.classList.add("hidden");

    if (!classNum) {
      showStatus("Please select a class.");
      return;
    }

    showStatus(`Loading curriculum for Class ${classNum}...`);
    CURRENT_CURRICULUM = await loadCurriculumForClass(classNum);

    const subjects = getSubjectKeys(CURRENT_CURRICULUM);
    if (!subjects.length) {
      showStatus("No subjects found in curriculum.");
      return;
    }

    fillSelect(subjectSel, subjects, "-- Select Subject --");
    setDisabled(subjectSel, false);

    showStatus(`Loaded ${subjects.length} subjects for Class ${classNum}.`);
  } catch (err) {
    console.error(err);
    alert("Error loading curriculum: " + err.message);
    showStatus("❌ " + err.message);
  }
}


function onSubjectChange() {
  try {
    const subjectSel = el("subjectSelect");
    const bookSel = el("bookSelect");
    const chapterSel = el("chapterSelect");
    const generateBtn = el("generateBtn");
    const refreshBtn = el("refreshBtn");
    const bookContainer = el("bookContainer");

    const subjectKey = subjectSel.value;

    clearSelect(bookSel);
    clearSelect(chapterSel);
    setDisabled(bookSel);
    setDisabled(chapterSel);
    generateBtn.disabled = true;
    refreshBtn.disabled = true;

    if (!subjectKey) {
      showStatus("Select a subject.");
      if (bookContainer) bookContainer.classList.add("hidden");
      CURRENT_REQUIRES_BOOK = false;
      return;
    }

    const subjNode = CURRENT_CURRICULUM?.[subjectKey];

    // CASE 1: Subject is directly an array of chapters (no books)
    if (Array.isArray(subjNode)) {
      CURRENT_REQUIRES_BOOK = false;
      if (bookContainer) bookContainer.classList.add("hidden");

      const chapters = subjNode || [];
      if (!chapters.length) {
        showStatus("No chapters found for this subject.");
        return;
      }

      // fill chapters directly
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
      showStatus(`Loaded ${chapters.length} chapters (no books).`);
      return;
    }

    // CASE 2: Subject is a book → chapters structure
    CURRENT_REQUIRES_BOOK = true;
    if (bookContainer) bookContainer.classList.remove("hidden");

    const books = getBooksForSubject(CURRENT_CURRICULUM, subjectKey);
    if (!books.length) {
      showStatus("No books found for this subject.");
      return;
    }

    fillSelect(bookSel, books, "-- Select Book --");
    setDisabled(bookSel, false);

    showStatus(`Loaded ${books.length} books for ${subjectKey}.`);
  } catch (err) {
    console.error(err);
    showStatus("❌ " + err.message);
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

    // If current subject doesn't require book layer, ignore book selection
    if (!CURRENT_REQUIRES_BOOK) {
      return;
    }

    if (!subjectKey || !bookKey) {
      showStatus("Select a book.");
      return;
    }

    const chapters = getChaptersForBook(CURRENT_CURRICULUM, subjectKey, bookKey);
    if (!chapters.length) {
      showStatus("No chapters found for this book.");
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


// ======================================================================================================
// SECTION 5 — CORE AUTOMATION (Generate / Refresh via backend)
// ======================================================================================================

export async function runAutomation(options) {
  try {
    const classVal = options?.class || el("classSelect").value;
    const subjectVal = options?.subject || el("subjectSelect").value;
    const bookVal = options?.book || el("bookSelect").value;
    const chapterVal = options?.chapter || el("chapterSelect").value;

    // book is required ONLY if CURRENT_REQUIRES_BOOK=true
    if (!classVal || !subjectVal || (!bookVal && CURRENT_REQUIRES_BOOK) || !chapterVal) {
      throw new Error("Please complete Class → Subject → " +
        (CURRENT_REQUIRES_BOOK ? "Book → " : "") +
        "Chapter selection.");
    }

    // Determine existing table id (for logs / UI only; backend decides new vs refresh)
    const existingTable = getExistingTableId(classVal, subjectVal, bookVal, chapterVal);

    showStatus(`Starting automation for: ${chapterVal} ${existingTable ? `(existing: ${existingTable})` : "(new)"}`);

    // 1️⃣ Gemini generation
    showStatus("Requesting Gemini...");
    const geminiRes = await postJSON("/api/gemini", {
      meta: {
        class_name: classVal,
        subject: subjectVal,
        book: CURRENT_REQUIRES_BOOK ? bookVal : null,
        chapter: chapterVal
      }
    });

    const questions = geminiRes.questions || [];
    showStatus(`Gemini produced ${questions.length} questions.`);

    // 2️⃣ Supabase manage endpoint
    showStatus("Sending questions to Supabase...");
    const manageRes = await postJSON("/api/manageSupabase", {
      meta: {
        class_name: classVal,
        subject: subjectVal,
        book: CURRENT_REQUIRES_BOOK ? bookVal : null,
        chapter: chapterVal
      },
      csv: questions
    });

    const newTableId = manageRes.new_table_id || manageRes.table;
    showStatus(`Supabase table → ${newTableId}`);
    if (manageRes.message) showStatus(manageRes.message);

    alert("✔ Automation completed successfully!");
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


// ======================================================================================================
// SECTION 6 — Refresh button simply reuses runAutomation
// ======================================================================================================

async function onRefreshClick() {
  await runAutomation({});
}


// ======================================================================================================
// SECTION 7 — Initialization on DOM Ready
// ======================================================================================================

document.addEventListener("DOMContentLoaded", () => {
  const classSel = el("classSelect");
  const subjectSel = el("subjectSelect");
  const bookSel = el("bookSelect");
  const chapterSel = el("chapterSelect");
  const generateBtn = el("generateBtn");
  const refreshBtn = el("refreshBtn");
  const bookContainer = el("bookContainer");

  if (!classSel || !subjectSel || !bookSel || !chapterSel) {
    console.error("DOM Missing required elements.");
    return;
  }

  setDisabled(subjectSel);
  setDisabled(bookSel);
  setDisabled(chapterSel);
  generateBtn.disabled = true;
  refreshBtn.disabled = true;

  if (bookContainer) {
    // hide by default – will be enabled only when subject actually has books
    bookContainer.classList.add("hidden");
  }

  classSel.addEventListener("change", onClassChange);
  subjectSel.addEventListener("change", onSubjectChange);
  bookSel.addEventListener("change", onBookChange);
  chapterSel.addEventListener("change", onChapterChange);

  generateBtn.addEventListener("click", () => runAutomation({}));
  refreshBtn.addEventListener("click", onRefreshClick);

  appendLog("Ready4Exam TableAutomation Ready");
});
