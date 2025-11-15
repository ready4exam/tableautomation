// js/gemini_frontend.js
// TableAutomation frontend (Mode A — full UI + automation)
// - Populates Class -> Subject -> Book -> Chapter dropdowns
// - Calls /api/gemini, /api/manageSupabase, /api/updateCurriculum
// - AUTO_UPDATE = YES (automatically updates class repo curriculum.js)
// - Exports runAutomation(options) for programmatic use

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
  // optional visual status element
  const statusEl = el("automation-status");
  if (statusEl) statusEl.innerText = text;
}

async function postJSON(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({ ok: false, error: "Invalid JSON response" }));
  if (!res.ok) throw new Error(data.error || data.message || JSON.stringify(data));
  return data;
}

// ------------------- UI population -------------------
function clearSelect(sel) {
  sel.innerHTML = "";
}

function setDisabled(sel, disabled = true) {
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

// Given curriculum object, return sorted subject keys
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
  const chapters = curriculum[subjectKey][bookKey] || [];
  return Array.isArray(chapters) ? chapters : [];
}

// ------------------- DOM-binding functions -------------------
async function onClassChange() {
  try {
    const classSel = el("classSelect");
    const subjectSel = el("subjectSelect");
    const bookSel = el("bookSelect");
    const bookContainer = el("bookContainer");
    const chapterSel = el("chapterSelect");
    const generateBtn = el("generateBtn");
    const refreshBtn = el("refreshBtn");

    const classNum = classSel.value;
    // reset subsequent controls
    clearSelect(subjectSel);
    clearSelect(bookSel);
    clearSelect(chapterSel);
    setDisabled(subjectSel, true);
    setDisabled(bookSel, true);
    setDisabled(chapterSel, true);
    generateBtn.disabled = true;
    refreshBtn.disabled = true;
    bookContainer.classList.add("hidden");

    if (!classNum) {
      showStatus("Select a class.");
      return;
    }

    showStatus(`Loading curriculum for class ${classNum}...`);
    const curriculum = await loadCurriculumForClass(classNum);

    const subjects = getSubjectKeys(curriculum);
    if (!subjects.length) {
      showStatus(`No subjects found in curriculum for class ${classNum}.`);
      return;
    }

    // populate subjects
    fillSelectWithArray(subjectSel, subjects, "-- Select Subject --");
    setDisabled(subjectSel, false);
    showStatus(`Loaded ${subjects.length} subjects for class ${classNum}.`);

    // store curriculum in element for later use
    subjectSel.dataset.curriculum = JSON.stringify(curriculum);
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

    // reset lower controls
    clearSelect(bookSel);
    clearSelect(chapterSel);
    setDisabled(bookSel, true);
    setDisabled(chapterSel, true);
    generateBtn.disabled = true;
    refreshBtn.disabled = true;
    bookContainer.classList.add("hidden");

    const subjectKey = subjectSel.value;
    if (!subjectKey) {
      return;
    }

    const curriculum = JSON.parse(subjectSel.dataset.curriculum || subjectSel.parentElement.dataset.curriculum || "{}");
    const books = getBookKeysForSubject(curriculum, subjectKey);

    if (!books.length) {
      // If no multiple books, but chapters array might be directly under subject as a single book
      // However our curriculum shape is subject -> book -> chapters, so handle gracefully
      showStatus(`No book entries found for subject "${subjectKey}".`);
      return;
    }

    // If only one book, show book selector but preselect first
    fillSelectWithArray(bookSel, books, "-- Select Book --");
    setDisabled(bookSel, false);
    if (books.length === 1) {
      bookSel.selectedIndex = 1; // pick the only book
      bookContainer.classList.remove("hidden");
      // trigger book change manually
      onBookChange();
    } else {
      bookContainer.classList.remove("hidden");
    }

    showStatus(`Loaded ${books.length} books for subject ${subjectKey}.`);
    // carry curriculum data to bookSel for convenience
    bookSel.dataset.curriculum = subjectSel.dataset.curriculum;
  } catch (err) {
    console.error("onSubjectChange error:", err);
    showStatus("Error while selecting subject: " + (err.message || err));
  }
}

function onBookChange() {
  try {
    const classSel = el("classSelect");
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

    const curriculum = JSON.parse(bookSel.dataset.curriculum || "{}");
    const chapters = getChaptersForBook(curriculum, subjectKey, bookKey);
    if (!chapters.length) {
      showStatus(`No chapters found for ${subjectKey} / ${bookKey}`);
      return;
    }

    // prepare options: display chapter_title and keep index or table_id as value (we'll use chapter_title for matching)
    clearSelect(chapterSel);
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

// ------------------- Automation (core) -------------------
export async function runAutomation(options) {
  // options may be provided or read from DOM
  try {
    // read DOM values if options not fully provided
    const classVal = options?.class || el("classSelect").value;
    const subjectVal = options?.subject || el("subjectSelect").value;
    const bookVal = options?.book || el("bookSelect").value;
    const chapterVal = options?.chapter || el("chapterSelect").value;
    const difficultyVal = options?.difficulty || "Medium";

    if (!classVal || !subjectVal || !chapterVal) {
      throw new Error("Please select class, subject and chapter before generating.");
    }

    showStatus(`Starting automation: Class ${classVal} / ${subjectVal} / ${bookVal} / ${chapterVal}`);

    // Step 1: generate via Gemini
    showStatus("Requesting Gemini to generate questions...");
    const geminiRes = await postJSON("/api/gemini", { meta: { class_name: classVal, subject: subjectVal, book: bookVal, chapter: chapterVal } });
    if (!geminiRes.ok) throw new Error(geminiRes.error || "Gemini failed.");
    const questions = geminiRes.questions;
    showStatus(`Gemini produced ${questions.length} questions.`);

    // Step 2: call manageSupabase to create table and insert
    // Try to read existing table_id from curriculum for preference
    let existingTableId = null;
    try {
      const curr = await loadCurriculumForClass(classVal);
      // locate chapter in curriculum and get table_id if exists
      const subjKeys = Object.keys(curr);
      let found = false;
      for (const sk of subjKeys) {
        if (sk.toLowerCase().includes(subjectVal.toLowerCase())) {
          const books = curr[sk];
          const bk = bookVal || Object.keys(books)[0];
          const chapters = books[bk] || [];
          for (const ch of chapters) {
            if (ch.chapter_title.trim().toLowerCase() === chapterVal.trim().toLowerCase()) {
              existingTableId = ch.table_id || null;
              found = true;
              break;
            }
          }
        }
        if (found) break;
      }
    } catch (e) {
      console.warn("Could not determine existing table_id:", e);
    }

    showStatus("Uploading questions to Supabase...");
    const manageBody = {
      meta: { class_name: classVal, subject: subjectVal, book: bookVal, chapter: chapterVal, table_id: existingTableId },
      csv: questions
    };

    const manageRes = await postJSON("/api/manageSupabase", manageBody);
    if (!manageRes.ok) throw new Error(manageRes.error || "manageSupabase failed");
    const newTableId = manageRes.new_table_id || manageRes.table;
    showStatus(`Supabase: table updated -> ${newTableId}`);

    // Step 3: auto-update curriculum
    try {
      showStatus("Updating curriculum in class repo...");
      const updateBody = { class_name: classVal, subject: subjectVal, chapter: chapterVal, new_table_id: newTableId };
      const updateRes = await postJSON("/api/updateCurriculum", updateBody);
      if (!updateRes.ok) {
        console.warn("updateCurriculum returned not ok:", updateRes);
        showStatus("Warning: updateCurriculum returned not-ok. Proceeding to quiz.");
      } else {
        showStatus(`Curriculum updated in ${updateRes.repo}`);
      }
    } catch (err) {
      console.warn("Auto-update failed:", err);
      showStatus("Warning: failed to auto-update curriculum. Proceeding to quiz.");
    }

    // Step 4: Redirect to quiz-engine
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

// ------------------- Refresh (re-run manageSupabase) -------------------
async function onRefreshClick() {
  try {
    const classVal = el("classSelect").value;
    const subjectVal = el("subjectSelect").value;
    const bookVal = el("bookSelect").value;
    const chapterVal = el("chapterSelect").value;
    if (!classVal || !subjectVal || !chapterVal) {
      alert("Select class, subject, chapter first.");
      return;
    }

    showStatus("Refreshing table (re-run manageSupabase)...");
    // Try to fetch existing curriculum table id
    let existingTableId = null;
    try {
      const curr = await loadCurriculumForClass(classVal);
      const subjKeys = Object.keys(curr);
      for (const sk of subjKeys) {
        if (sk.toLowerCase().includes(subjectVal.toLowerCase())) {
          const books = curr[sk];
          const bk = bookVal || Object.keys(books)[0];
          const chapters = books[bk] || [];
          for (const ch of chapters) {
            if (ch.chapter_title.trim().toLowerCase() === chapterVal.trim().toLowerCase()) {
              existingTableId = ch.table_id || null;
              break;
            }
          }
          break;
        }
      }
    } catch (e) {
      console.warn("Could not determine existing table_id:", e);
    }

    // We need CSV to reinsert; for refresh we have no CSV — so ask user to confirm they want to re-run generate (call runAutomation)
    if (!confirm("Refresh will re-run the whole generation flow. Proceed?")) return;

    // Call runAutomation which regenerates via Gemini and reuploads
    await runAutomation({ class: classVal, subject: subjectVal, book: bookVal, chapter: chapterVal, difficulty: "Medium" });

  } catch (err) {
    console.error("Refresh failed:", err);
    showStatus("Refresh failed: " + (err.message || err));
  }
}

// ------------------- Initialization and bindings -------------------
document.addEventListener("DOMContentLoaded", function () {
  // DOM references
  const classSel = el("classSelect");
  const subjectSel = el("subjectSelect");
  const bookSel = el("bookSelect");
  const chapterSel = el("chapterSelect");
  const generateBtn = el("generateBtn");
  const refreshBtn = el("refreshBtn");
  const bookContainer = el("bookContainer");

  // Basic safety checks
  if (!classSel || !subjectSel || !bookSel || !chapterSel || !generateBtn || !refreshBtn) {
    console.error("Required DOM elements missing. UI will not initialize.");
    appendLog("Required DOM elements missing in index.html.");
    return;
  }

  // Initial state
  setDisabled(subjectSel, true);
  setDisabled(bookSel, true);
  setDisabled(chapterSel, true);
  generateBtn.disabled = true;
  refreshBtn.disabled = true;
  if (bookContainer) bookContainer.classList.add("hidden");

  // Bind events
  classSel.addEventListener("change", onClassChange);
  subjectSel.addEventListener("change", onSubjectChange);
  bookSel.addEventListener("change", onBookChange);
  chapterSel.addEventListener("change", onChapterChange);
  generateBtn.addEventListener("click", async () => {
    // gather options from DOM and call runAutomation
    const options = {
      class: classSel.value,
      subject: subjectSel.value,
      book: bookSel.value,
      chapter: chapterSel.value,
      difficulty: "Medium"
    };
    try {
      generateBtn.disabled = true;
      await runAutomation(options);
    } catch (err) {
      // error handled in runAutomation
    } finally {
      generateBtn.disabled = false;
    }
  });

  refreshBtn.addEventListener("click", onRefreshClick);

  appendLog("TableAutomation UI initialized. Select class to begin.");
});
