// ============================================================================
// gemini_frontend.js — FINAL FIXED VERSION (Meta Safe + Bulk Safe)
// ============================================================================

const API_BASE = "https://ready4exam-master-automation.vercel.app";

let CURRENT_CURRICULUM = null;
let CURRENT_REQUIRES_BOOK = false;

// ---------------------------------------------------------
// BASIC HELPERS
// ---------------------------------------------------------
function el(id) { return document.getElementById(id); }

function appendLog(msg) {
  const ts = new Date().toISOString();
  el("log").value = `${ts} - ${msg}\n` + el("log").value;
}

function showStatus(msg) { appendLog(msg); }

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
// ALWAYS SAFE META (fix = ensures usage_logs always updates)
// ---------------------------------------------------------
function buildCleanMeta(classVal, subjectVal, bookVal, chapterVal) {
  return {
    class_name: classVal || "",
    subject: subjectVal || "",
    book: CURRENT_REQUIRES_BOOK ? (bookVal || "") : "",
    chapter: chapterVal || ""
  };
}

// ---------------------------------------------------------
// Curriculum Loader
// ---------------------------------------------------------
async function loadCurriculumForClass(classNum) {
  const repo = `ready4exam-class-${classNum}`;
  const url = `https://ready4exam.github.io/${repo}/js/curriculum.js?v=${Date.now()}`;

  try {
    const m = await import(url);
    return m.curriculum || m.default;
  } catch (err) {
    throw new Error("❌ Cannot load curriculum");
  }
}

// ---------------------------------------------------------
// Curriculum Helpers
// ---------------------------------------------------------
function getUniqueChapters(list) {
  const seen = new Set();
  return list.filter(c => {
    if (!c?.chapter_title) return false;
    if (seen.has(c.chapter_title)) return false;
    seen.add(c.chapter_title);
    return true;
  });
}

function getSubjectKeys(c) { return Object.keys(c).sort(); }
function getBooksForSubject(c, s) {
  if (!c[s] || Array.isArray(c[s])) return [];
  return Object.keys(c[s]).sort();
}
function getChapters(c, subject, book) {
  if (!c[subject]) return [];
  if (Array.isArray(c[subject])) return c[subject];
  return c[subject][book] || [];
}

// ---------------------------------------------------------
// DROPDOWN EVENTS
// ---------------------------------------------------------
async function onClassChange() {
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

  if (!classVal) return;

  CURRENT_CURRICULUM = await loadCurriculumForClass(classVal);

  const subjects = getSubjectKeys(CURRENT_CURRICULUM);
  fillSelect(subjectSel, subjects, "-- Select Subject --");
  setDisabled(subjectSel, false);

  el("bulkGenerateBtn").disabled = false;
}

function onSubjectChange() {
  const subjectVal = el("subjectSelect").value;
  const bookContainer = el("bookContainer");
  const chapterSel = el("chapterSelect");
  const bookSel = el("bookSelect");

  clearSelect(bookSel);
  clearSelect(chapterSel);

  if (!subjectVal) return;

  const isSimple = Array.isArray(CURRENT_CURRICULUM[subjectVal]);
  CURRENT_REQUIRES_BOOK = !isSimple;

  if (isSimple) {
    bookContainer.classList.add("hidden");
    const ch = CURRENT_CURRICULUM[subjectVal];
    fillSelect(chapterSel, ch.map(c => c.chapter_title), "-- Select Chapter --");
    setDisabled(chapterSel, false);
  } else {
    bookContainer.classList.remove("hidden");
    const books = getBooksForSubject(CURRENT_CURRICULUM, subjectVal);
    fillSelect(bookSel, books, "-- Select Book --");
    setDisabled(bookSel, false);
  }

  el("bulkGenerateBtn").disabled = false;
}

function onBookChange() {
  const subjectVal = el("subjectSelect").value;
  const bookVal = el("bookSelect").value;
  const chapterSel = el("chapterSelect");

  clearSelect(chapterSel);
  if (!bookVal) return;

  const chapters = getChapters(CURRENT_CURRICULUM, subjectVal, bookVal);
  fillSelect(chapterSel, chapters.map(c => c.chapter_title), "-- Select Chapter --");
  setDisabled(chapterSel, false);

  el("bulkGenerateBtn").disabled = false;
}

function onChapterChange() {
  el("generateBtn").disabled = !el("chapterSelect").value;
  el("refreshBtn").disabled = !el("chapterSelect").value;
}

// ---------------------------------------------------------
// SINGLE AUTOMATION (SAFE META)
// ---------------------------------------------------------
export async function runAutomation() {
  try {
    const classVal = el("classSelect").value;
    const subjectVal = el("subjectSelect").value;
    const bookVal = el("bookSelect").value;
    const chapterVal = el("chapterSelect").value;

    const meta = buildCleanMeta(classVal, subjectVal, bookVal, chapterVal);

    showStatus(`🚀 Generating: ${chapterVal}`);

    const gemini = await postJSON("/api/gemini", { meta });
    const questions = gemini.questions || [];

    const sup = await postJSON("/api/manageSupabase", {
      meta,
      csv: questions
    });

    showStatus(`📦 Updated → ${sup.new_table_id}`);
    alert("✔ Completed");
  } catch (err) {
    showStatus("❌ " + err.message);
    alert(err.message);
  }
}

// ---------------------------------------------------------
// BULK AUTOMATION (META SAFE + UNIQUE CHAPTERS)
// ---------------------------------------------------------
export async function runBulkAutomation() {
  try {
    const classVal = el("classSelect").value;
    const subjectVal = el("subjectSelect").value;
    const bookVal = el("bookSelect").value;

    let ch = CURRENT_REQUIRES_BOOK
      ? getChapters(CURRENT_CURRICULUM, subjectVal, bookVal)
      : CURRENT_CURRICULUM[subjectVal];

    ch = getUniqueChapters(ch);
    if (!ch.length) return alert("No chapters found.");

    const tbody = el("bulkStatusTbody");
    tbody.innerHTML = "";

    const bar = el("bulkProgressBarInner");
    const label = el("bulkProgressLabel");
    const container = el("bulkProgressContainer");

    container.classList.remove("hidden");

    let done = 0;
    const total = ch.length;

    const updateBar = () => {
      bar.style.width = `${Math.floor((done / total) * 100)}%`;
      label.textContent = `${done} / ${total}`;
    };

    updateBar();

    for (let i = 0; i < ch.length; i++) {
      const ct = ch[i].chapter_title;
      const row = document.createElement("tr");

      row.innerHTML = `
        <td class="border px-2 py-1">${ct}</td>
        <td class="border px-2 py-1" id="st-${i}">⏳ Generating…</td>
        <td class="border px-2 py-1" id="tb-${i}">—</td>
      `;

      tbody.appendChild(row);

      const st = el(`st-${i}`);
      const tb = el(`tb-${i}`);

      try {
        const meta = buildCleanMeta(classVal, subjectVal, bookVal, ct);

        const gemini = await postJSON("/api/gemini", { meta });
        const questions = gemini.questions || [];

        st.textContent = `✔ ${questions.length} questions`;

        const sup = await postJSON("/api/manageSupabase", {
          meta,
          csv: questions
        });

        tb.textContent = sup.new_table_id;
        st.textContent = "🎉 Completed";
      } catch (err) {
        st.textContent = "❌ Failed";
      }

      done++;
      updateBar();
    }

    alert("🎉 Bulk Completed");

  } catch (err) {
    showStatus("❌ Bulk Error: " + err.message);
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

  showStatus("Ready4Exam Automation Ready");
});
