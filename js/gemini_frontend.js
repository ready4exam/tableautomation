// ======================================================================================================
// gemini_frontend.js (FINAL PRODUCTION + BULK GENERATION + PROGRESS + RETRIES)
// ======================================================================================================
//
// CORE BEHAVIOUR (UNCHANGED)
// --------------------------
// ✔ Class-12 is the master curriculum source.
// ✔ All classes load their own repo: ready4exam-class-{X}/js/curriculum.js
// ✔ For subjects that have BOOKS (nested structure), book selection is shown and required.
// ✔ For subjects without books (flat subject → chapters array), book selection is hidden and NOT required.
// ✔ Single chapter automation: /api/gemini → /api/manageSupabase → curriculum.js table_id updated.
//
// NEW BULK FEATURES
// -----------------
// ✔ "Bulk Generate" button on UI
// ✔ Loops through ALL chapters of selected subject (and book, if required)
// ✔ For each chapter:
//      - Calls /api/gemini
//      - Sends to /api/manageSupabase
//      - Logs actions
//      - Relies on existing backend logic to update curriculum.js table_id
// ✔ Progress bar for bulk run
// ✔ Per-chapter status table
// ✔ Automatic retry (up to 3 tries per chapter)
// ✔ Limited parallel processing (default: 3 chapters at a time)
// ✔ End-of-run summary popup + log
//
// REQUIRED EXTRA HTML IDS
// -----------------------
// - Button with id="bulkGenerateBtn"               (Bulk Generate)
// - Container with id="bulkProgressContainer"      (wraps progress bar; can be simple div)
// - Div span with id="bulkProgressLabel"           (text like "3/10")
// - Div (inner bar) with id="bulkProgressBarInner" (width updated %)
// - <tbody> with id="bulkStatusTbody"              (for chapter status rows)
//
// ======================================================================================================

const API_BASE = "https://ready4exam-master-automation.vercel.app";

let CURRENT_CURRICULUM = null;
let CURRENT_REQUIRES_BOOK = false;

// BULK CONFIG
const BULK_MAX_PARALLEL = 3; // how many chapters to process at once
let BULK_STATE = null;       // will hold progress info


// ======================================================================================================
// SECTION 1 — CURRICULUM LOADER
// ======================================================================================================

async function loadCurriculumForClass(classNum) {

  classNum = String(classNum).trim();

  if (!["5","6","7","8","9","10","11","12"].includes(classNum)) {
    throw new Error(`❌ Invalid class selected: ${classNum}`);
  }

  const repo = `ready4exam-class-${classNum}`;
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
    console.warn(`⚠ Failed to load curriculum from ${url}`);
  }

  throw new Error("❌ curriculum.js could not be loaded.");
}


// ======================================================================================================
// SECTION 2 — Utility Helpers
// ======================================================================================================

function el(id) { return document.getElementById(id); }

function appendLog(text){
  const textarea = el("log");
  const ts = new Date().toISOString();
  if (textarea){
    textarea.value = `${ts}  ${text}\n` + textarea.value;
  }
}

function showStatus(text){ appendLog(text); }

async function postJSON(path,payload){
  const res = await fetch(`${API_BASE}${path}`,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error || data.message || "Request failed");
  return data;
}

function clearSelect(sel){ sel.innerHTML = ""; }

function setDisabled(sel,disabled=true){
  sel.disabled = disabled;
  if(disabled) sel.classList.add("opacity-50");
  else sel.classList.remove("opacity-50");
}

function fillSelect(sel,arr,placeholder="-- Select --"){
  clearSelect(sel);
  const first=document.createElement("option");
  first.value="";
  first.text=placeholder;
  sel.appendChild(first);
  for(const item of arr){
    const o=document.createElement("option");
    o.value=item;
    o.text=item;
    sel.appendChild(o);
  }
}


// ======================================================================================================
// SECTION 3 — Curriculum Access Helpers
// ======================================================================================================

function getSubjectKeys(curriculum){ return Object.keys(curriculum||{}).sort(); }

function getBooksForSubject(curriculum,subjectKey){
  const s = curriculum?.[subjectKey];
  if(!s || Array.isArray(s)) return [];
  return Object.keys(s||{}).sort();
}

function getChaptersForBook(curriculum,subjectKey,bookKey){
  const s = curriculum?.[subjectKey];
  if(!s) return [];
  if(Array.isArray(s)) return s;
  const c = s[bookKey];
  return Array.isArray(c) ? c : [];
}

function getExistingTableId(classVal,subjectVal,bookVal,chapterVal){
  let chapters = [];
  const s = CURRENT_CURRICULUM?.[subjectVal];
  if(!s) return null;
  chapters = Array.isArray(s)
    ? s
    : (CURRENT_CURRICULUM?.[subjectVal]?.[bookVal] || []);
  const ch = chapters.find(c=>c.chapter_title === chapterVal);
  return ch?.table_id || null;
}


// ======================================================================================================
// SECTION 4 — Dropdown Event Handlers
// ======================================================================================================

async function onClassChange(){
  try{
    const classSel = el("classSelect"),
          subjectSel = el("subjectSelect"),
          bookSel = el("bookSelect"),
          chapterSel = el("chapterSelect"),
          generateBtn = el("generateBtn"),
          refreshBtn = el("refreshBtn"),
          bookContainer = el("bookContainer");

    const classNum = classSel.value;

    clearSelect(subjectSel);
    clearSelect(bookSel);
    clearSelect(chapterSel);
    setDisabled(subjectSel);
    setDisabled(bookSel);
    setDisabled(chapterSel);

    generateBtn.disabled = true;
    refreshBtn.disabled = true;

    CURRENT_REQUIRES_BOOK=false;
    if(bookContainer) bookContainer.classList.add("hidden");

    if(!classNum){
      showStatus("Please select a class.");
      return;
    }

    showStatus(`Loading curriculum for Class ${classNum}...`);
    CURRENT_CURRICULUM = await loadCurriculumForClass(classNum);

    const subjects = getSubjectKeys(CURRENT_CURRICULUM);
    if(!subjects.length) return showStatus("No subjects found.");

    fillSelect(subjectSel,subjects,"-- Select Subject --");
    setDisabled(subjectSel,false);
    showStatus(`Loaded ${subjects.length} subjects for Class ${classNum}.`);
  }catch(e){
    alert(e.message);
    showStatus("❌ "+e.message);
  }
}

function onSubjectChange(){
  try{
    const subjectSel=el("subjectSelect"),
          bookSel=el("bookSelect"),
          chapterSel=el("chapterSelect"),
          generateBtn=el("generateBtn"),
          refreshBtn=el("refreshBtn"),
          bookContainer=el("bookContainer");

    const subjectKey = subjectSel.value;

    clearSelect(bookSel);
    clearSelect(chapterSel);
    setDisabled(bookSel);
    setDisabled(chapterSel);
    generateBtn.disabled = true;
    refreshBtn.disabled = true;

    if(!subjectKey){
      showStatus("Select a subject.");
      if(bookContainer) bookContainer.classList.add("hidden");
      CURRENT_REQUIRES_BOOK=false;
      return;
    }

    const subjNode = CURRENT_CURRICULUM?.[subjectKey];

    if(Array.isArray(subjNode)){
      CURRENT_REQUIRES_BOOK=false;
      if(bookContainer) bookContainer.classList.add("hidden");

      const chapters = subjNode || [];
      if(!chapters.length) return showStatus("No chapters found.");

      const empty = document.createElement("option");
      empty.value="";
      empty.text="-- Select Chapter --";
      chapterSel.appendChild(empty);

      for(const ch of chapters){
        const o=document.createElement("option");
        o.value = ch.chapter_title;
        o.text = ch.chapter_title+(ch.table_id?` (${ch.table_id})`:"");
        chapterSel.appendChild(o);
      }
      setDisabled(chapterSel,false);
      return showStatus(`Loaded ${chapters.length} chapters.`);
    }

    CURRENT_REQUIRES_BOOK=true;
    if(bookContainer) bookContainer.classList.remove("hidden");

    const books = getBooksForSubject(CURRENT_CURRICULUM,subjectKey);
    if(!books.length) return showStatus("No books found.");

    fillSelect(bookSel,books,"-- Select Book --");
    setDisabled(bookSel,false);
    showStatus(`Loaded ${books.length} books.`);
  }catch(err){
    showStatus("❌ "+err.message);
  }
}

function onBookChange(){
  try{
    const subjectSel=el("subjectSelect"),
          bookSel=el("bookSelect"),
          chapterSel=el("chapterSelect"),
          generateBtn=el("generateBtn"),
          refreshBtn=el("refreshBtn");

    clearSelect(chapterSel);
    setDisabled(chapterSel);

    generateBtn.disabled = true;
    refreshBtn.disabled = true;

    if(!CURRENT_REQUIRES_BOOK) return;

    const subjectKey = subjectSel.value,
          bookKey = bookSel.value;

    if(!subjectKey || !bookKey) return showStatus("Select a book.");

    const chapters = getChaptersForBook(CURRENT_CURRICULUM,subjectKey,bookKey);

    if(!chapters.length) return showStatus("No chapters found.");

    const empty=document.createElement("option");
    empty.value="";
    empty.text="-- Select Chapter --";
    chapterSel.appendChild(empty);

    for(const ch of chapters){
      const o=document.createElement("option");
      o.value = ch.chapter_title;
      o.text = ch.chapter_title+(ch.table_id?` (${ch.table_id})`:"");
      chapterSel.appendChild(o);
    }

    setDisabled(chapterSel,false);
    showStatus(`Loaded ${chapters.length} chapters.`);
  }catch(err){
    showStatus("❌ "+err.message);
  }
}

function onChapterChange(){
  const c = el("chapterSelect");
  el("generateBtn").disabled = !c.value.trim();
  el("refreshBtn").disabled = !c.value.trim();
}


// ======================================================================================================
// SECTION 5 — CORE AUTOMATION (EXISTING SINGLE CHAPTER FLOW — UNCHANGED)
// ======================================================================================================

export async function runAutomation(options){
  try{
    const classVal = options?.class || el("classSelect").value,
          subjectVal = options?.subject || el("subjectSelect").value,
          bookVal = options?.book || el("bookSelect").value,
          chapterVal = options?.chapter || el("chapterSelect").value;

    if(!classVal||!subjectVal||(!bookVal&&CURRENT_REQUIRES_BOOK)||!chapterVal)
      throw new Error("Complete Class → Subject "+(CURRENT_REQUIRES_BOOK?"→ Book ":"→ ")+"→ Chapter");

    const existingTable = getExistingTableId(classVal,subjectVal,bookVal,chapterVal);
    showStatus(`Starting automation for: ${chapterVal} ${existingTable?'(existing:'+existingTable+')':'(new)'}`);

    showStatus("Requesting Gemini...");
    const geminiRes = await postJSON("/api/gemini",{
      meta:{
        class_name: classVal,
        subject: subjectVal,
        book: CURRENT_REQUIRES_BOOK ? bookVal : null,
        chapter: chapterVal
      }
    });

    const questions = geminiRes.questions || [];
    showStatus(`Gemini produced ${questions.length} questions.`);

    showStatus("Sending questions to Supabase...");
    const manageRes = await postJSON("/api/manageSupabase",{
      meta:{
        class_name: classVal,
        subject: subjectVal,
        book: CURRENT_REQUIRES_BOOK ? bookVal : null,
        chapter: chapterVal
      },
      csv: questions
    });

    const newTableId = manageRes.new_table_id || manageRes.table;
    showStatus(`Supabase table → ${newTableId}`);

    if(manageRes.message) showStatus(manageRes.message);

    alert("✔ Automation completed.");

    el("chapterSelect").value="";
    el("generateBtn").disabled=true;
    el("refreshBtn").disabled=true;

  }catch(err){
    alert("Failed: "+err.message);
    showStatus("Failed: "+err.message);
  }
}

async function onRefreshClick(){
  await runAutomation({});
}


// ======================================================================================================
// SECTION 6 — BULK GENERATION SUPPORT (A,B,C,D,H)
// ======================================================================================================
//
// - Progress bar
// - Per-chapter status table
// - Limited parallelism
// - Retry logic
// - Final summary
// ======================================================================================================


// ------ Bulk UI helpers ------

function initBulkUI(chapters){
  BULK_STATE = {
    total: chapters.length,
    done: 0,
    failed: 0,
    totalQuestions: 0,
    startedAt: Date.now(),
    chapters: {} // by title: { status, attempts, tableId, error }
  };

  const progressContainer = el("bulkProgressContainer");
  const progressBarInner = el("bulkProgressBarInner");
  const progressLabel = el("bulkProgressLabel");
  const tbody = el("bulkStatusTbody");

  if(progressContainer) progressContainer.classList.remove("hidden");
  if(progressBarInner) progressBarInner.style.width = "0%";
  if(progressLabel) progressLabel.textContent = `0 / ${chapters.length}`;
  if(tbody) tbody.innerHTML = "";

  for(const ch of chapters){
    BULK_STATE.chapters[ch.chapter_title] = {
      status: "Pending",
      attempts: 0,
      tableId: "",
      error: ""
    };
    ensureChapterRow(ch.chapter_title);
    updateChapterRow(ch.chapter_title);
  }
}

function updateBulkProgress(){
  if(!BULK_STATE) return;
  const { total, done, failed } = BULK_STATE;
  const processed = done + failed;
  const pct = total > 0 ? Math.round((processed / total)*100) : 0;

  const progressBarInner = el("bulkProgressBarInner");
  const progressLabel = el("bulkProgressLabel");
  if(progressBarInner) progressBarInner.style.width = `${pct}%`;
  if(progressLabel) progressLabel.textContent = `${processed} / ${total} (${pct}%)`;
}

function ensureChapterRow(chapterTitle){
  const tbody = el("bulkStatusTbody");
  if(!tbody) return;

  let row = tbody.querySelector(`tr[data-chapter="${chapterTitle}"]`);
  if(row) return;

  row = document.createElement("tr");
  row.setAttribute("data-chapter", chapterTitle);

  const tdChapter = document.createElement("td");
  const tdStatus = document.createElement("td");
  const tdTable = document.createElement("td");

  tdChapter.className = "border px-2 py-1 text-sm";
  tdStatus.className = "border px-2 py-1 text-sm";
  tdTable.className = "border px-2 py-1 text-sm";

  tdChapter.textContent = chapterTitle;
  tdStatus.textContent = "Pending";
  tdTable.textContent = "";

  row.appendChild(tdChapter);
  row.appendChild(tdStatus);
  row.appendChild(tdTable);

  tbody.appendChild(row);
}

function updateChapterRow(chapterTitle){
  const tbody = el("bulkStatusTbody");
  if(!tbody || !BULK_STATE) return;

  const info = BULK_STATE.chapters[chapterTitle];
  if(!info) return;

  const row = tbody.querySelector(`tr[data-chapter="${chapterTitle}"]`);
  if(!row) return;

  const tds = row.querySelectorAll("td");
  if(tds.length < 3) return;

  tds[0].textContent = chapterTitle;
  tds[1].textContent = `${info.status}${info.attempts>1 ? ` (attempts: ${info.attempts})`:""}`;
  tds[2].textContent = info.tableId || "";

  // Optional: color-coding
  row.classList.remove("bg-red-100","bg-green-100","bg-yellow-100");
  if(info.status === "Completed") row.classList.add("bg-green-100");
  else if(info.status === "Failed") row.classList.add("bg-red-100");
  else if(info.status === "In Progress") row.classList.add("bg-yellow-100");
}

function showBulkSummary(){
  if(!BULK_STATE) return;
  const { total, done, failed, totalQuestions, startedAt } = BULK_STATE;
  const durationMs = Date.now() - startedAt;
  const seconds = Math.round(durationMs / 1000);
  const mins = Math.floor(seconds / 60);
  const secR = seconds % 60;

  const summaryText =
    `Bulk Generation Summary:\n\n`+
    `Chapters: ${total}\n`+
    `Successfully Generated: ${done}\n`+
    `Failed: ${failed}\n`+
    `Total Questions (approx.): ${totalQuestions}\n`+
    `Total Time: ${mins}m ${secR}s`;

  showStatus(summaryText.replace(/\n/g," | "));
  alert(summaryText);
}


// ------ Core bulk worker (per chapter with retry) ------

async function processChapterBulk(classVal, subjectVal, bookVal, chapterObj, idx, total){
  const chapterTitle = chapterObj.chapter_title;

  BULK_STATE.chapters[chapterTitle].status = "In Progress";
  BULK_STATE.chapters[chapterTitle].attempts += 1;
  updateChapterRow(chapterTitle);
  updateBulkProgress();

  const maxAttempts = 3;
  let attempt = BULK_STATE.chapters[chapterTitle].attempts;

  while(attempt <= maxAttempts){
    try{
      showStatus(`📘 (${idx+1}/${total}) [Attempt ${attempt}] Generating → ${chapterTitle}`);

      // 1️⃣ Call /api/gemini
      const geminiRes = await postJSON("/api/gemini",{
        meta:{
          class_name: classVal,
          subject: subjectVal,
          book: CURRENT_REQUIRES_BOOK ? bookVal : null,
          chapter: chapterTitle
        }
      });

      const questions = geminiRes.questions || [];
      BULK_STATE.totalQuestions += questions.length;

      showStatus(`✔ Gemini generated ${questions.length} questions for ${chapterTitle}`);

      // 2️⃣ Call /api/manageSupabase
      const manageRes = await postJSON("/api/manageSupabase",{
        meta:{
          class_name: classVal,
          subject: subjectVal,
          book: CURRENT_REQUIRES_BOOK ? bookVal : null,
          chapter: chapterTitle
        },
        csv: questions
      });

      const newTableId = manageRes.new_table_id || manageRes.table;
      showStatus(`📦 Supabase updated → ${chapterTitle} → Table: ${newTableId}`);
      if(manageRes.message){
        showStatus(`📝 Curriculum updated: ${manageRes.message}`);
      }

      BULK_STATE.chapters[chapterTitle].status = "Completed";
      BULK_STATE.chapters[chapterTitle].tableId = newTableId;
      BULK_STATE.chapters[chapterTitle].error = "";
      BULK_STATE.done += 1;

      updateChapterRow(chapterTitle);
      updateBulkProgress();
      showStatus(`🏁 Completed chapter: ${chapterTitle}`);

      break; // success → exit retry loop

    }catch(err){
      console.error(err);
      BULK_STATE.chapters[chapterTitle].error = err.message || String(err);
      showStatus(`❌ Error for ${chapterTitle} on attempt ${attempt}: ${err.message || err}`);

      attempt += 1;
      BULK_STATE.chapters[chapterTitle].attempts = attempt;
      updateChapterRow(chapterTitle);

      if(attempt > maxAttempts){
        BULK_STATE.chapters[chapterTitle].status = "Failed";
        BULK_STATE.failed += 1;
        updateChapterRow(chapterTitle);
        updateBulkProgress();
        showStatus(`🚫 Giving up on chapter: ${chapterTitle} after ${maxAttempts} attempts.`);
        break;
      }else{
        showStatus(`🔁 Retrying chapter: ${chapterTitle} (attempt ${attempt} of ${maxAttempts})`);
      }
    }
  }
}


// ------ Public Bulk Automation Entry Point ------

export async function runBulkAutomation(){
  try{
    const classVal   = el("classSelect").value;
    const subjectVal = el("subjectSelect").value;
    const bookVal    = CURRENT_REQUIRES_BOOK ? el("bookSelect").value : null;

    if(!classVal || !subjectVal || (CURRENT_REQUIRES_BOOK && !bookVal)){
      alert("Please select Class → Subject "+(CURRENT_REQUIRES_BOOK?"→ Book":""));
      return;
    }

    // gather chapters for this subject/book
    let chapters = [];
    if(!CURRENT_REQUIRES_BOOK){
      chapters = CURRENT_CURRICULUM?.[subjectVal] || [];
    } else {
      chapters = CURRENT_CURRICULUM?.[subjectVal]?.[bookVal] || [];
    }

    if(!chapters.length){
      alert("No chapters found for bulk generation.");
      return;
    }

    showStatus(`🚀 BULK GENERATION STARTED for Subject: ${subjectVal} (${chapters.length} chapters)`);

    // initialise bulk UI state
    initBulkUI(chapters);
    updateBulkProgress();

    // simple promise pool for limited parallelism
    let currentIndex = 0;
    const total = chapters.length;
    const workers = [];
    const workerCount = Math.min(BULK_MAX_PARALLEL, total);

    for(let w = 0; w < workerCount; w++){
      workers.push((async ()=>{
        while(true){
          let idx;
          // claim an index
          if(currentIndex >= total) break;
          idx = currentIndex;
          currentIndex += 1;

          const chapterObj = chapters[idx];
          await processChapterBulk(classVal, subjectVal, bookVal, chapterObj, idx, total);
        }
      })());
    }

    await Promise.all(workers);

    showStatus("🎉 BULK GENERATION FINISHED FOR ALL CHAPTERS!");
    showBulkSummary();

  }catch(err){
    alert("Bulk failed: "+err.message);
    showStatus("❌ BULK ERROR: "+err.message);
  }
}


// ======================================================================================================
// SECTION 7 — Initialization
// ======================================================================================================

document.addEventListener("DOMContentLoaded",()=>{
  const cs  = el("classSelect"),
        ss  = el("subjectSelect"),
        bs  = el("bookSelect"),
        chs = el("chapterSelect"),
        g   = el("generateBtn"),
        r   = el("refreshBtn"),
        bc  = el("bookContainer"),
        bulkBtn = el("bulkGenerateBtn");

  if(!cs||!ss||!bs||!chs) return;

  setDisabled(ss);
  setDisabled(bs);
  setDisabled(chs);

  g.disabled = true;
  r.disabled = true;

  if(bc) bc.classList.add("hidden");

  cs.addEventListener("change",onClassChange);
  ss.addEventListener("change",onSubjectChange);
  bs.addEventListener("change",onBookChange);
  chs.addEventListener("change",onChapterChange);

  g.addEventListener("click",()=>runAutomation({}));
  r.addEventListener("click",onRefreshClick);

  if(bulkBtn){
    bulkBtn.addEventListener("click", runBulkAutomation);
  }

  appendLog("Ready4Exam TableAutomation Ready");
});
