// ============================================================================
// gemini_frontend.js — CONSOLIDATED & CORRECTED
// ============================================================================

const API_BASE = "https://ready4exam-master-automation.vercel.app";
let CURRENT_CURRICULUM = null;


// ---------------------------------------------------------
// PYQ EXTRACTION AUTOMATION
// ---------------------------------------------------------
export async function handlePYQExtraction() {
  try {
    const classVal = el("classSelect").value;
    const subjectVal = el("subjectSelect").value;
    const bookVal = el("bookSelect").value;
    const chapterVal = el("chapterSelect").value;

    if (!chapterVal) return alert("Please select a chapter.");

    logHead(`📄 PYQ Extraction Started: ${chapterVal} (Grade: ${classVal})`);
    el("pyqLoadingSpinner").classList.remove("hidden");
    el("extractPyqBtn").disabled = true;

    const payload = {
      grade: classVal,
      subject: subjectVal,
      book: bookVal,
      chapter: chapterVal
    };

    const res = await fetch("https://ready4exam-master-automation.vercel.app/api/extract_pyq", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Failed to extract PYQ");
    }

    log1(`✅ PYQ Extracted Successfully: ${data.message || "Done"}`);
    alert("✔ PYQ Extraction Completed");

  } catch (err) {
    console.error("PYQ Extraction Error:", err);
    log1("❌ " + err.message);
    alert(err.message);
  } finally {
    el("pyqLoadingSpinner").classList.add("hidden");
    el("extractPyqBtn").disabled = false;
  }
}

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

    // IMPORTANT:
    // text/plain prevents browser preflight (no OPTIONS request)
    headers: {
      "Content-Type": "text/plain"
    },

    // still sending JSON — backend will parse manually
    body: JSON.stringify(data)
  });

  const text = await res.text();

  let json = {};
  try {
    json = JSON.parse(text);
  } catch (e) {
    // non-json responses (like 500 HTML) still readable
  }

  if (!res.ok) {
    throw new Error(json.error || text || "Request failed");
  }

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

// 3. WHICH SUMMARY ENGINE?
function getSummaryAiEndpoint(classVal) {
  return "/api/generate_ncert_summary";
}

// 4. WHICH SUMMARY STORAGE?
function getSummaryStorageEndpoint(classVal) {
  return "/api/store_ncert_summary";
}

// ---------------------------------------------------------
// CLASS / BOOK / DISCIPLINE LOGIC
// ---------------------------------------------------------
function createSlug(text) {
  if (!text) return "";
  return text.toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getDiscipline(subjectVal, bookVal) {
  // If book is present (e.g. Social Science -> History), use book.
  // Otherwise use subject (e.g. Science).
  return bookVal || subjectVal || "";
}

function buildCleanMeta(classVal, subjectVal, groupOrBookVal, chapterVal) {
  return {
    class_name: classVal || "",
    subject: subjectVal || "",
    book: groupOrBookVal || "",
    chapter: chapterVal || ""
  };
}

function buildSummaryMeta(classVal, subjectVal, bookVal, chapterVal) {
  const safeChapter = createSlug(chapterVal);
  const discipline = getDiscipline(subjectVal, bookVal);

  return {
    classId: classVal,
    subject: subjectVal,
    topicSlug: safeChapter,
    discipline: discipline,
    // inclusive of original fields just in case
    class_name: classVal,
    book: bookVal,
    chapter: chapterVal
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
// DROPDOWN HANDLERS
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
  const hasChapter = !!el("chapterSelect").value;
  el("generateBtn").disabled = !hasChapter;
  el("generateSummaryBtn").disabled = !hasChapter;
  el("bulkGenerateBtn").disabled = false;
  el("bulkGenerateSummaryBtn").disabled = false;
  el("extractPyqBtn").disabled = !hasChapter;
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
// SINGLE AUTOMATION (SUPABASE)
// ---------------------------------------------------------
export async function runAutomation() {
  try {
    const classVal = el("classSelect").value;
    const subjectVal = el("subjectSelect").value;
    const bookVal = el("bookSelect").value;
    const chapterVal = el("chapterSelect").value;

    const meta = buildCleanMeta(classVal, subjectVal, bookVal, chapterVal);
    const aiApi = getGenAiEndpoint(classVal);
    const dbApi = getDbManagerEndpoint(classVal);

    logHead(`🚀 Automation Started: ${chapterVal}`);
    const createRes = await postJSON(dbApi, { meta, csv: [] });
    log1(`Table ready: ${createRes.table_name}`);

    log1(`Requesting AI... (${aiApi})`);
    const gemini = await postJSON(aiApi, { meta });
    log1(`AI Success: ${gemini.questions.length} questions`);

    const sup = await postJSON(dbApi, { meta, csv: gemini.questions });
    log1(`Inserted: ${sup.inserted}`);
    alert("✔ Chapter Completed");
  } catch (err) {
    log1("❌ " + err.message);
    alert(err.message);
  }
}

// ---------------------------------------------------------
// BULK AUTOMATION (SUPABASE)
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
        await postJSON(dbApi, { meta, csv: [] });
        const gemini = await postJSON(aiApi, { meta });
        await postJSON(dbApi, { meta, csv: gemini.questions });
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
// SUMMARY AUTOMATION (FIRESTORE)
// ---------------------------------------------------------
function updateSummaryProgress(done, total) {
  const container = el("summaryProgressContainer");
  const bar = el("summaryProgressBarInner");
  const label = el("summaryProgressLabel");

  if (total > 0) {
    container.classList.remove("hidden");
    const pct = Math.round((done / total) * 100);
    bar.style.width = `${pct}%`;
    label.textContent = `${done} / ${total}`;
  } else {
    container.classList.add("hidden");
  }
}

function updateSummaryStatus(chapter, status, docId = "-") {
  const container = el("summaryStatusContainer");
  const tbody = el("summaryStatusTbody");
  container.classList.remove("hidden");

  const row = document.createElement("tr");
  const color = status.includes("❌") ? "text-red-600" : "text-green-600";

  row.innerHTML = `
    <td class="border px-2 py-1">${chapter}</td>
    <td class="border px-2 py-1 ${color}">${status}</td>
    <td class="border px-2 py-1 font-mono text-xs text-gray-500">${docId}</td>
  `;
  tbody.prepend(row);
}

export async function runSummaryAutomation() {
  try {
    const classVal = el("classSelect").value;
    const subjectVal = el("subjectSelect").value;
    const bookVal = el("bookSelect").value;
    const chapterVal = el("chapterSelect").value;

    if (!chapterVal) return alert("Please select a chapter.");

    const meta = buildSummaryMeta(classVal, subjectVal, bookVal, chapterVal);
    const aiApi = getSummaryAiEndpoint(classVal);
    const dbApi = getSummaryStorageEndpoint(classVal);

    logHead(`📝 Adaptive Summary Generation: ${chapterVal}`);
    log1(`Discipline: ${meta.discipline}`);

    log1(`Requesting Summary AI...`);
    const summaryData = await postJSON(aiApi, { meta });
    log1(`AI Success (${meta.discipline}). Storing to Firestore...`);

    const storeRes = await postJSON(dbApi, { meta, data: summaryData });
    const docId = storeRes.id || `${meta.classId}_${meta.subject}_${meta.topicSlug}`;

    log1(`✅ Stored Document: ${docId}`);
    updateSummaryStatus(chapterVal, "Success", docId);
    alert(`✔ ${meta.discipline} Summary Stored!`);
  } catch (err) {
    log1("❌ " + err.message);
    updateSummaryStatus(el("chapterSelect").value, "❌ Failed");
    alert(err.message);
  }
}

export async function runBulkSummaryAutomation() {
  try {
    const classVal = el("classSelect").value;
    const subjectVal = el("subjectSelect").value;
    const groupVal = el("bookSelect").value;

    const aiApi = getSummaryAiEndpoint(classVal);
    const dbApi = getSummaryStorageEndpoint(classVal);

    let chapters = groupVal
      ? getChapters(CURRENT_CURRICULUM, subjectVal, groupVal)
      : getAllChaptersForSubject(CURRENT_CURRICULUM, subjectVal);

    const list = getUniqueChapters(chapters);
    const total = list.length;
    let done = 0;

    el("summaryStatusTbody").innerHTML = "";
    updateSummaryProgress(0, total);
    logHead(`🔥 BULK SUMMARY STARTED (${total} chapters)`);

    for (const ch of list) {
      const chapter = ch.chapter_title;
      const meta = buildSummaryMeta(classVal, subjectVal, groupVal, chapter);
      logHead(`Processing Summary: ${chapter}`);
      try {
        const summaryData = await postJSON(aiApi, { meta });
        const storeRes = await postJSON(dbApi, { meta, data: summaryData });
        const docId = storeRes.id || `${meta.classId}_${meta.subject}_${meta.topicSlug}`;
        done++;
        updateSummaryProgress(done, total);
        updateSummaryStatus(chapter, "Success", docId);
        log1(`✔ Stored ${docId}`);
      } catch (err) {
        log1(`❌ Failed: ${err.message}`);
        updateSummaryStatus(chapter, "❌ " + err.message);
      }
    }
    logHead("🎉 BULK SUMMARY COMPLETED");
    alert("Bulk Summary Completed");
  } catch (err) {
    log1("❌ Bulk Error: " + err.message);
  }
}
document.addEventListener("DOMContentLoaded", () => {
  el("classSelect").addEventListener("change", onClassChange);
  el("subjectSelect").addEventListener("change", onSubjectChange);
  el("bookSelect").addEventListener("change", onBookChange);
  el("chapterSelect").addEventListener("change", onChapterChange);
  el("generateBtn").addEventListener("click", runAutomation);
  el("bulkGenerateBtn").addEventListener("click", runBulkAutomation);
  el("generateSummaryBtn").addEventListener("click", runSummaryAutomation);
  el("bulkGenerateSummaryBtn").addEventListener("click", runBulkSummaryAutomation);
  el("extractPyqBtn").addEventListener("click", handlePYQExtraction);
  log1("Ready4Exam Automation Loaded (TS/Adaptive Summary Enabled)");
});
