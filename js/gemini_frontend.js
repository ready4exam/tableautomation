// ============================================================================
// gemini_frontend.js — UNIVERSAL VERSION (CBSE + State Boards + ICSE)
// Preserves all existing logic while adding dynamic repo and board support.
// ============================================================================

const API_BASE = "https://ready4exam-master-automation.vercel.app";

let CURRENT_CURRICULUM = null;

// ---------------------------------------------------------
// BASIC HELPERS
// ---------------------------------------------------------
function el(id) { return document.getElementById(id); }

function appendLog(msg) {
  const ts = new Date().toISOString().split("T").join(" ");
  el("log").value = `${ts} | ${msg}\n` + el("log").value;
}

function log1(msg) { appendLog(`• ${msg}`); }
function logHead(msg) {
  appendLog(`\n================ ${msg} ================`);
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
  // Extracts the numeric part for comparison (e.g., "9Telangana" -> 9)
  const num = parseInt(classNum.match(/\d+/));
  return num >= 11;
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
// ⭐ UNIVERSAL LOAD CURRICULUM (Updated for Multi-Repo)
// ---------------------------------------------------------
async function loadCurriculumForClass(classNum) {
  // Dynamically targets ready4exam-class-9 OR ready4exam-class-9Telangana
  const repo = `ready4exam-class-${classNum}`;
  
  // Use raw.githubusercontent to bypass potential module import caching issues on GitHub Pages
  const url = `https://raw.githubusercontent.com/ready4exam/${repo}/main/js/curriculum.js?v=${Date.now()}`;
  
  log1(`Connecting to repo: ${repo}...`);

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Repo ${repo} not found or curriculum.js missing.`);
    
    const text = await response.text();
    
    // Universal Parsing: Cleans the file text to extract the JS object
    // This handles both "export const curriculum = {..." and "export default curriculum;"
    const cleanJS = text
      .replace(/export const curriculum = /, "")
      .replace(/export default curriculum;/, "")
      .trim()
      .replace(/;$/, "");
    
    // Safely evaluate the object
    const data = new Function(`return ${cleanJS}`)();
    return data;
  } catch (err) {
    log1(`❌ Load Error: ${err.message}`);
    // Fallback to legacy import if fetch fails (requires proper CORS)
    const fallbackUrl = `https://ready4exam.github.io/${repo}/js/curriculum.js?v=${Date.now()}`;
    const m = await import(fallbackUrl);
    return m.curriculum || m.default;
  }
}

// ---------------------------------------------------------
// DROPDOWN HANDLERS
// ---------------------------------------------------------
function getSubjectKeys(c) { return Object.keys(c).sort(); }

function getGroupKeys(subjectNode) {
  return Array.isArray(subjectNode) ? [] : Object.keys(subjectNode);
}

function getChapters(c, subject, groupOrBook) {
  const node = c[subject];
  if (!node) return [];
  return Array.isArray(node) ? node : node[groupOrBook] || [];
}

function getAllChaptersForSubject(c, subject) {
  const node = c[subject];
  if (!node) return [];
  if (Array.isArray(node)) return node;

  let all = [];
  for (const arr of Object.values(node)) if (Array.isArray(arr)) all.push(...arr);
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

async function onClassChange() {
  const classVal = el("classSelect").value;
  clearSelects();

  if (!classVal) return;

  try {
    CURRENT_CURRICULUM = await loadCurriculumForClass(classVal);
    log1(`✅ Syllabus loaded for ${classVal}`);
    fillSelect(el("subjectSelect"), getSubjectKeys(CURRENT_CURRICULUM));
    enable(el("subjectSelect"));
  } catch (err) {
    log1(`❌ Failed to load ${classVal}: ${err.message}`);
  }
}

function onSubjectChange() {
  const subjectVal = el("subjectSelect").value;

  clearSelect(el("bookSelect"));
  clearSelect(el("chapterSelect"));

  if (!subjectVal) return;

  const subjectNode = CURRENT_CURRICULUM[subjectVal];
  const groupsOrBooks = getGroupKeys(subjectNode);

  if (groupsOrBooks.length) {
    el("bookContainer").classList.remove("hidden");
    fillSelect(el("bookSelect"), groupsOrBooks);
    enable(el("bookSelect"));
  } else {
    el("bookContainer").classList.add("hidden");
    const chapters = getChapters(CURRENT_CURRICULUM, subjectVal, "");
    fillSelect(el("chapterSelect"), chapters.map(c => c.chapter_title));
    enable(el("chapterSelect"));
  }
}

function onBookChange() {
  const subjectVal = el("subjectSelect").value;
  const groupVal = el("bookSelect").value;

  clearSelect(el("chapterSelect"));
  if (!groupVal) return;

  const chapters = getChapters(CURRENT_CURRICULUM, subjectVal, groupVal);
  fillSelect(el("chapterSelect"), chapters.map(c => c.chapter_title));
  enable(el("chapterSelect"));
}

function onChapterChange() {
  el("generateBtn").disabled = !el("chapterSelect").value;
  el("bulkGenerateBtn").disabled = false;
}

function clearSelects() {
  ["subjectSelect", "bookSelect", "chapterSelect"].forEach(id => {
    el(id).innerHTML = "";
    el(id).disabled = true;
  });
}

function fillSelect(sel, items) {
  sel.innerHTML = `<option value="">-- Select --</option>`;
  items.forEach(v => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    sel.appendChild(o);
  });
}

function enable(sel) { sel.disabled = false; }
function clearSelect(sel) {
  if (!sel) return;
  while (sel.options.length > 1) {
    sel.remove(1);
  }
}

// ---------------------------------------------------------
// SINGLE AUTOMATION
// ---------------------------------------------------------
export async function runAutomation() {
  try {
    const classVal = el("classSelect").value;
    const subjectVal = el("subjectSelect").value;
    const bookVal = el("bookSelect").value;
    const chapterVal = el("chapterSelect").value;

    const meta = buildCleanMeta(classVal, subjectVal, bookVal, chapterVal);

    logHead(`🚀 Automation Started: ${chapterVal}`);

    // CREATE TABLE FIRST
    const createRes = await postJSON("/api/manageSupabase", { meta, csv: [] });
    log1(`Table ready: ${createRes.table_name}`);

    // THEN call Gemini
    const gemini = await postJSON("/api/gemini", { meta });
    log1(`Gemini OK (${gemini.questions.length} questions)`);

    // Insert rows
    const sup = await postJSON("/api/manageSupabase", { meta, csv: gemini.questions });
    log1(`Inserted: ${sup.inserted}`);

    alert("✔ Chapter Completed");
  } catch (err) {
    log1("❌ " + err.message);
    alert(err.message);
  }
}

// ---------------------------------------------------------
// BULK AUTOMATION (UNIVERSAL BULLETPROOF)
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

    logHead(`🔥 BULK STARTED (${total} chapters)`);

    for (const ch of list) {
      const chapter = ch.chapter_title;
      const meta = buildCleanMeta(classVal, subjectVal, groupVal, chapter);

      logHead(`Processing: ${chapter}`);

      try {
        // STEP 1 — Create table FIRST
        const createRes = await postJSON("/api/manageSupabase", { meta, csv: [] });
        log1(`Table ready: ${createRes.table_name}`);

        // STEP 2 — Call Gemini
        const gemini = await postJSON("/api/gemini", { meta });
        log1(`Gemini OK (${gemini.questions.length})`);

        // STEP 3 — Insert into table
        const sup = await postJSON("/api/manageSupabase", {
          meta,
          csv: gemini.questions
        });

        done++;
        log1(`✔ Completed ${done}/${total}`);

      } catch (err) {
        log1(`❌ Failed: ${err.message}`);
      }
    }

    logHead("🎉 BULK COMPLETED");
    alert("Bulk Completed");

  } catch (err) {
    log1("❌ Bulk Error: " + err.message);
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

  log1("Ready4Exam Universal Automation Loaded");
});
