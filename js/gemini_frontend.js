// ============================================================================
// gemini_frontend.js — Enhanced Logging (Option A)
// ============================================================================

const API_BASE = "https://ready4exam-master-automation.vercel.app";

let CURRENT_CURRICULUM = null;

// ---------------------------------------------------------
// BASIC HELPERS
// ---------------------------------------------------------
function el(id) { return document.getElementById(id); }

/* -------------------------------------------------------
   CLEAN, PROFESSIONAL LOGGING — Option A (Replaces old)
--------------------------------------------------------- */
function appendLog(msg) {
  const box = el("log");
  box.value = msg + "\n" + box.value;
}

function logSection(title) {
  appendLog(`\n================ ${title} ================`);
}

function logLine(text) {
  appendLog(`• ${text}`);
}

function showStatus(msg) {
  appendLog(`→ ${msg}`);
}

function clearSelect(sel) { sel.innerHTML = ""; }

function setDisabled(sel, val = true) {
  sel.disabled = val;
  val ? sel.classList.add("opacity-50") : sel.classList.remove("opacity-50");
}

function fillSelect(sel, items, placeholder = "-- Select --") {
  clearSelect(sel);
  sel.innerHTML = `<option value="">${placeholder}</option>`;
  items.forEach(v => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    sel.appendChild(o);
  });
}

async function postJSON(path, data) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Request failed");
  return json;
}

// ---------------------------------------------------------
// CLASS / BOOK LOGIC
// ---------------------------------------------------------
function classRequiresBook(classNum) {
  return Number(classNum) >= 11;  
}

function buildCleanMeta(classVal, subjectVal, groupOrBookVal, chapterVal) {
  return {
    class_name: classVal || "",
    subject: subjectVal || "",
    book: groupOrBookVal || "",
    chapter: chapterVal || ""
  };
}

// ---------------------------------------------------------
// LOAD CURRICULUM
// ---------------------------------------------------------
async function loadCurriculumForClass(classNum) {
  const repo = `ready4exam-class-${classNum}`;
  const url = `https://ready4exam.github.io/${repo}/js/curriculum.js?v=${Date.now()}`;

  const m = await import(url);
  return m.curriculum || m.default;
}

// ---------------------------------------------------------
// CURRICULUM HELPERS
// ---------------------------------------------------------
function getSubjectKeys(c) { return Object.keys(c).sort(); }

function getGroupKeys(subjectNode) {
  return Array.isArray(subjectNode) ? [] : Object.keys(subjectNode);
}

function getChapters(c, subject, groupOrBook) {
  const node = c[subject];
  if (!node) return [];
  if (Array.isArray(node)) return node;
  return node[groupOrBook] || [];
}

function getAllChaptersForSubject(c, subject) {
  const node = c[subject];
  if (!node) return [];
  if (Array.isArray(node)) return node;

  let all = [];
  for (const arr of Object.values(node)) {
    if (Array.isArray(arr)) all.push(...arr);
  }
  return all;
}

function getUniqueChapters(list) {
  const out = [];
  const seen = new Set();
  for (const ch of list) {
    if (!ch?.chapter_title) continue;
    if (seen.has(ch.chapter_title)) continue;
    seen.add(ch.chapter_title);
    out.push(ch);
  }
  return out;
}

// ---------------------------------------------------------
// DROPDOWN HANDLERS
// ---------------------------------------------------------
async function onClassChange() {
  const classVal = el("classSelect").value;

  clearSelect(el("subjectSelect"));
  clearSelect(el("bookSelect"));
  clearSelect(el("chapterSelect"));
  setDisabled(el("subjectSelect"));
  setDisabled(el("bookSelect"));
  setDisabled(el("chapterSelect"));

  if (!classVal) return;

  logSection(`Loading Curriculum for Class ${classVal}`);
  CURRENT_CURRICULUM = await loadCurriculumForClass(classVal);
  logLine("✔ Curriculum loaded");

  fillSelect(el("subjectSelect"), getSubjectKeys(CURRENT_CURRICULUM), "-- Select Subject --");
  setDisabled(el("subjectSelect"), false);
}

function onSubjectChange() {
  const classVal = el("classSelect").value;
  const subjectVal = el("subjectSelect").value;
  const subjectNode = CURRENT_CURRICULUM[subjectVal];

  clearSelect(el("bookSelect"));
  clearSelect(el("chapterSelect"));

  if (!subjectVal) return;

  const groupsOrBooks = getGroupKeys(subjectNode);

  if (groupsOrBooks.length) {
    el("bookContainer").classList.remove("hidden");
    fillSelect(
      el("bookSelect"),
      groupsOrBooks,
      classRequiresBook(classVal) ? "-- Select Book --" : "-- Select Subdivision --"
    );
    setDisabled(el("bookSelect"), false);
    return;
  }

  el("bookContainer").classList.add("hidden");
  const chapters = getChapters(CURRENT_CURRICULUM, subjectVal, "");
  fillSelect(el("chapterSelect"), chapters.map(c => c.chapter_title));
  setDisabled(el("chapterSelect"), false);
}

function onBookChange() {
  const subjectVal = el("subjectSelect").value;
  const groupVal = el("bookSelect").value;

  clearSelect(el("chapterSelect"));
  if (!groupVal) return;

  const chapters = getChapters(CURRENT_CURRICULUM, subjectVal, groupVal);
  fillSelect(el("chapterSelect"), chapters.map(c => c.chapter_title));
  setDisabled(el("chapterSelect"), false);
}

function onChapterChange() {
  el("generateBtn").disabled = !el("chapterSelect").value;
  el("refreshBtn").disabled = !el("chapterSelect").value;
}

// ---------------------------------------------------------
// SINGLE AUTOMATION
// ---------------------------------------------------------
export async function runAutomation() {
  try {
    const classVal = el("classSelect").value;
    const subjectVal = el("subjectSelect").value;
    const groupVal = el("bookSelect").value;
    const chapterVal = el("chapterSelect").value;

    logSection(`🚀 Automation Started: ${chapterVal}`);

    const meta = buildCleanMeta(classVal, subjectVal, groupVal, chapterVal);
    logLine(`Class: ${classVal}, Subject: ${subjectVal}, Book: ${groupVal}`);
    logLine(`Chapter: ${chapterVal}`);

    // 1) Gemini
    logLine("→ Generating questions (Gemini)...");
    const gemini = await postJSON("/api/gemini", { meta });
    logLine(`✔ Gemini returned ${gemini.questions.length} questions`);

    // 2) Supabase
    logLine("→ Updating Supabase (table + RLS + inserts + usage_logs)...");
    const sup = await postJSON("/api/manageSupabase", { meta, csv: gemini.questions });
    logLine(`✔ Table updated: ${sup.table_name}`);
    logLine(`✔ Inserted: ${sup.inserted} rows`);

    logLine("✔ curriculum.js updated");

    showStatus(`✔ Completed: ${sup.table_name}`);
    alert("✔ Chapter Completed");
  } catch (err) {
    logLine(`❌ ERROR: ${err.message}`);
    alert(err.message);
  }
}

// ---------------------------------------------------------
// BULK AUTOMATION
// ---------------------------------------------------------
export async function runBulkAutomation() {
  try {
    const classVal = el("classSelect").value;
    const subjectVal = el("subjectSelect").value;
    const groupVal = el("bookSelect").value;

    let chapters = groupVal
      ? getChapters(CURRENT_CURRICULUM, subjectVal, groupVal)
      : getAllChaptersForSubject(CURRENT_CURRICULUM, subjectVal);

    const list = getUniqueChapters(chapters);
    const total = list.length;
    let done = 0;

    logSection(`🔥 BULK STARTED (${total} chapters)`);

    for (const ch of list) {
      const chapter = ch.chapter_title;
      logLine(`→ Processing: ${chapter}`);

      try {
        const meta = buildCleanMeta(classVal, subjectVal, groupVal, chapter);

        const gemini = await postJSON("/api/gemini", { meta });
        logLine(`   ✔ Gemini OK (${gemini.questions.length} questions)`);

        const sup = await postJSON("/api/manageSupabase", { meta, csv: gemini.questions });
        logLine(`   ✔ Supabase OK: ${sup.table_name}`);

        done++;
        logLine(`✔ Completed ${done}/${total}`);
      } catch (err) {
        logLine(`❌ Failed ${chapter}: ${err.message}`);
      }
    }

    logSection("🎉 BULK COMPLETED");
    alert("Bulk Completed!");
  } catch (err) {
    logLine(`❌ BULK ERROR: ${err.message}`);
  }
}

// ---------------------------------------------------------
// INIT
// ---------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  el("classSelect").addEventListener("change", onClassChange);
  el("subjectSelect").addEventListener("change", onSubjectChange);
  el("bookSelect").addEventListener("change", onBookChange);
  el("chapterSelect").addEventListener("change", onChapterChange);

  el("generateBtn").addEventListener("click", runAutomation);
  el("bulkGenerateBtn").addEventListener("click", runBulkAutomation);

  logSection("Ready4Exam Automation Loaded");
});
