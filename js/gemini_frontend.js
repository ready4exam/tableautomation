// ============================================================================
// gemini_frontend.js — FULL VERSION (Telangana Support + Bulk Progress)
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
  return parseInt(classNum) >= 11;
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
// LOAD CURRICULUM (Telangana Update)
// ---------------------------------------------------------
async function loadCurriculumForClass(classNum) {
  let repo;
  if (classNum === "9Telangana") {
    repo = `ready4exam-class-9Telangana`;
  } else {
    repo = `ready4exam-class-${classNum}`;
  }
  
  const url = `https://ready4exam.github.io/${repo}/js/curriculum.js?v=${Date.now()}`;
  const m = await import(url);
  return m.curriculum || m.default;
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

  log1(`Loading syllabus for ${classVal}...`);
  CURRENT_CURRICULUM = await loadCurriculumForClass(classVal);

  fillSelect(el("subjectSelect"), getSubjectKeys(CURRENT_CURRICULUM));
  enable(el("subjectSelect"));
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

    const createRes = await postJSON("/api/manageSupabase", { meta, csv: [] });
    log1(`Table ready: ${createRes.table_name}`);

    const gemini = await postJSON("/api/gemini", { meta });
    log1(`Gemini OK (${gemini.questions.length} questions)`);

    const sup = await postJSON("/api/manageSupabase", { meta, csv: gemini.questions });
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

    let chapters = groupVal
      ? getChapters(CURRENT_CURRICULUM, subjectVal, groupVal)
      : getAllChaptersForSubject(CURRENT_CURRICULUM, subjectVal);

    const list = getUniqueChapters(chapters);
    const total = list.length;
    let done = 0;

    // Reset Progress UI
    el("bulkProgressContainer").classList.remove("hidden");
    el("bulkStatusTbody").innerHTML = "";
    updateProgress(0, total);

    logHead(`🔥 BULK STARTED (${total} chapters)`);

    for (const ch of list) {
      const chapter = ch.chapter_title;
      const meta = buildCleanMeta(classVal, subjectVal, groupVal, chapter);
      
      // Create Row in Status Table
      const row = addStatusRow(chapter);
      logHead(`Processing: ${chapter}`);

      try {
        updateRow(row, "Creating Table...", "...");
        const createRes = await postJSON("/api/manageSupabase", { meta, csv: [] });
        
        updateRow(row, "Calling Gemini...", createRes.table_name);
        const gemini = await postJSON("/api/gemini", { meta });
        
        updateRow(row, "Inserting Rows...", createRes.table_name);
        await postJSON("/api/manageSupabase", { meta, csv: gemini.questions });

        updateRow(row, "✅ Success", createRes.table_name, "text-green-600");
        done++;
        updateProgress(done, total);

      } catch (err) {
        log1(`❌ Failed: ${err.message}`);
        updateRow(row, "❌ Failed", "Error", "text-red-600");
      }
    }

    logHead("🎉 BULK COMPLETED");
    alert("Bulk Completed");

  } catch (err) {
    log1("❌ Bulk Error: " + err.message);
  }
}

// ---------------------------------------------------------
// BULK UI HELPERS
// ---------------------------------------------------------
function updateProgress(done, total) {
  const perc = Math.round((done / total) * 100);
  el("bulkProgressBarInner").style.width = `${perc}%`;
  el("bulkProgressLabel").textContent = `${done} / ${total} chapters`;
}

function addStatusRow(chapter) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td class="border px-2 py-1">${chapter}</td>
    <td class="border px-2 py-1 status-cell">Pending</td>
    <td class="border px-2 py-1 id-cell">-</td>
  `;
  el("bulkStatusTbody").appendChild(tr);
  return tr;
}

function updateRow(row, status, tableId, colorClass = "") {
  const sCell = row.querySelector(".status-cell");
  const idCell = row.querySelector(".id-cell");
  sCell.textContent = status;
  idCell.textContent = tableId;
  if (colorClass) sCell.className = `border px-2 py-1 status-cell font-bold ${colorClass}`;
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

  log1("Ready4Exam Automation Loaded");
});
