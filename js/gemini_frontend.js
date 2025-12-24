// ============================================================================
// gemini_frontend.js — UPDATED (Routes 9_telangana to separate DB file)
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
// REPO & ENDPOINT MAPPING
// ---------------------------------------------------------
function getRepoName(classVal) {
  if (classVal === "9_telangana") return "ready4exam-class-9Telangana";
  return `ready4exam-class-${classVal}`;
}

// 1. WHICH AI ENGINE? (NCERT vs SCERT)
function getGenAiEndpoint(classVal) {
  if (classVal === "9_telangana") return "/api/tel_gemini";
  return "/api/gemini";
}

// 2. WHICH DB MANAGER? (Standard vs TG)
function getDbManagerEndpoint(classVal) {
  if (classVal === "9_telangana") return "/api/manageSupabase_tg";
  return "/api/manageSupabase";
}

// ---------------------------------------------------------
// CLASS / BOOK LOGIC
// ---------------------------------------------------------
function buildCleanMeta(classVal, subjectVal, groupOrBookVal, chapterVal) {
  return {
    class_name: classVal || "",
    subject: subjectVal || "",
    book: groupOrBookVal || "",
    chapter: chapterVal || ""
  };
}

async function loadCurriculumForClass(classNum) {
  const repo = getRepoName(classNum);
  const url = `https://ready4exam.github.io/${repo}/js/curriculum.js?v=${Date.now()}`;
  try {
    const m = await import(url);
    return m.curriculum || m.default;
  } catch (err) {
    appendLog(`❌ Error loading curriculum for ${repo}: ${err.message}`);
    throw err;
  }
}

// ---------------------------------------------------------
// DROPDOWN HANDLERS (Standard logic)
// ---------------------------------------------------------
function getSubjectKeys(c) { return Object.keys(c).sort(); }
function getGroupKeys(subjectNode) { return Array.isArray(subjectNode) ? [] : Object.keys(subjectNode); }
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
    fillSelect(el("subjectSelect"), getSubjectKeys(CURRENT_CURRICULUM));
    enable(el("subjectSelect"));
  } catch (e) {
    alert("Could not load curriculum.");
  }
}

function onSubjectChange() {
  const classVal = el("classSelect").value;
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
  while (sel.options.length > 1) { sel.remove(1); }
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
    
    // ⭐ DYNAMIC ENDPOINTS
    const aiApi = getGenAiEndpoint(classVal);
    const dbApi = getDbManagerEndpoint(classVal);

    logHead(`🚀 Automation Started: ${chapterVal}`);

    // 1. Create Table (using correct DB API)
    const createRes = await postJSON(dbApi, { meta, csv: [] });
    log1(`Table ready: ${createRes.table_name}`);

    // 2. Call AI (using correct AI API)
    log1(`Requesting AI... (${aiApi})`);
    const gemini = await postJSON(aiApi, { meta });
    log1(`AI Success: ${gemini.questions.length} questions`);

    // 3. Insert Data (using correct DB API)
    const sup = await postJSON(dbApi, { meta, csv: gemini.questions });
    log1(`Inserted: ${sup.inserted}`);

    alert("✔ Chapter Completed");
  } catch (err) {
    log1("❌ " + err.message);
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

    const aiApi = getGenAiEndpoint(classVal);
    const dbApi = getDbManagerEndpoint(classVal);

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
        // STEP 1 — Create table
        const createRes = await postJSON(dbApi, { meta, csv: [] });
        log1(`Table ready: ${createRes.table_name}`);

        // STEP 2 — Call AI
        const gemini = await postJSON(aiApi, { meta });
        log1(`AI OK (${gemini.questions.length})`);

        // STEP 3 — Insert
        const sup = await postJSON(dbApi, { meta, csv: gemini.questions });

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
  log1("Ready4Exam Automation Loaded (TS Support Enabled)");
});
