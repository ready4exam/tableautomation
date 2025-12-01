// ======================================================================================================
// gemini_frontend.js (FINAL PRODUCTION EXPANDED VERSION — with correct book-selection behaviour)
// ======================================================================================================
//
// CORE BEHAVIOUR
// --------------
// ✔ Class-12 is the master curriculum source.
// ✔ Class-11 first tries its own repo, then falls back to Class-11.
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
// SECTION 1 — CURRICULUM LOADER ENGINE  (UPDATED PATH ONLY — NO OTHER CHANGE)
// ======================================================================================================
//   Class 5 – 10  = ready4exam-class-{N}/js/curriculum.js
//   Class 11      = ready4exam-11/js/curriculum.js first, then fallback → ready4exam-class-11/js/curriculum.js
//   Class 12      = ready4exam-class-12/js/curriculum.js
// ======================================================================================================

async function loadCurriculumForClass(classNum) {

  classNum = String(classNum).trim();
  let repoList = [];

  if (["5","6","7","8","9","10"].includes(classNum)) {
    repoList = [`ready4exam-class-${classNum}`];

  } else if (classNum === "11") {
    repoList = ["ready4exam-class-11"];

  } else if (classNum === "12") {
    repoList = ["ready4exam-class-12"];

  } else {
    throw new Error(`❌ Invalid class selected: ${classNum}`);
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

  throw new Error("❌ curriculum.js could not be loaded from any repository.");
}


// ======================================================================================================
// SECTION 2 — Utility Helpers
// ======================================================================================================

function el(id) { return document.getElementById(id); }
function appendLog(text){const textarea=el("log");const ts=new Date().toISOString();if(textarea){textarea.value=`${ts}  ${text}\n`+textarea.value;}}
function showStatus(text){appendLog(text);}
async function postJSON(path,payload){const res=await fetch(`${API_BASE}${path}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||data.message||"Request failed");return data;}
function clearSelect(sel){sel.innerHTML="";}
function setDisabled(sel,disabled=true){sel.disabled=disabled;if(disabled)sel.classList.add("opacity-50");else sel.classList.remove("opacity-50");}
function fillSelect(sel,arr,placeholder="-- Select --"){clearSelect(sel);const first=document.createElement("option");first.value="";first.text=placeholder;sel.appendChild(first);for(const item of arr){const o=document.createElement("option");o.value=item;o.text=item;sel.appendChild(o);}}


// ======================================================================================================
// SECTION 3 — Curriculum Access Helpers
// ======================================================================================================

function getSubjectKeys(curriculum){return Object.keys(curriculum||{}).sort();}
function getBooksForSubject(curriculum,subjectKey){const s=curriculum?.[subjectKey];if(!s||Array.isArray(s))return[];return Object.keys(s||{}).sort();}
function getChaptersForBook(curriculum,subjectKey,bookKey){const s=curriculum?.[subjectKey];if(!s)return[];if(Array.isArray(s))return s;const c=s[bookKey];return Array.isArray(c)?c:[];}
function getExistingTableId(classVal,subjectVal,bookVal,chapterVal){
  let chapters=[]; const s=CURRENT_CURRICULUM?.[subjectVal];
  if(!s)return null;
  chapters=Array.isArray(s)?s:(CURRENT_CURRICULUM?.[subjectVal]?.[bookVal]||[]);
  const ch=chapters.find(c=>c.chapter_title===chapterVal);
  return ch?.table_id||null;
}


// ======================================================================================================
// SECTION 4 — Dropdown Event Handlers
// ======================================================================================================

async function onClassChange(){
  try{
    const classSel=el("classSelect"),subjectSel=el("subjectSelect"),bookSel=el("bookSelect"),chapterSel=el("chapterSelect"),generateBtn=el("generateBtn"),refreshBtn=el("refreshBtn"),bookContainer=el("bookContainer");
    const classNum=classSel.value;
    clearSelect(subjectSel);clearSelect(bookSel);clearSelect(chapterSel);
    setDisabled(subjectSel);setDisabled(bookSel);setDisabled(chapterSel);
    generateBtn.disabled=true;refreshBtn.disabled=true;
    CURRENT_REQUIRES_BOOK=false;if(bookContainer)bookContainer.classList.add("hidden");
    if(!classNum){showStatus("Please select a class.");return;}

    showStatus(`Loading curriculum for Class ${classNum}...`);
    CURRENT_CURRICULUM=await loadCurriculumForClass(classNum);

    const subjects=getSubjectKeys(CURRENT_CURRICULUM);
    if(!subjects.length)return showStatus("No subjects found.");

    fillSelect(subjectSel,subjects,"-- Select Subject --");
    setDisabled(subjectSel,false);
    showStatus(`Loaded ${subjects.length} subjects for Class ${classNum}.`);
  }catch(e){alert(e.message);showStatus("❌ "+e.message);}
}

function onSubjectChange(){try{
  const subjectSel=el("subjectSelect"),bookSel=el("bookSelect"),chapterSel=el("chapterSelect"),generateBtn=el("generateBtn"),refreshBtn=el("refreshBtn"),bookContainer=el("bookContainer");
  const subjectKey=subjectSel.value;
  clearSelect(bookSel);clearSelect(chapterSel);setDisabled(bookSel);setDisabled(chapterSel);generateBtn.disabled=true;refreshBtn.disabled=true;

  if(!subjectKey){showStatus("Select a subject.");if(bookContainer)bookContainer.classList.add("hidden");CURRENT_REQUIRES_BOOK=false;return;}

  const subjNode=CURRENT_CURRICULUM?.[subjectKey];

  if(Array.isArray(subjNode)){
    CURRENT_REQUIRES_BOOK=false;if(bookContainer)bookContainer.classList.add("hidden");
    const chapters=subjNode||[];if(!chapters.length)return showStatus("No chapters found.");
    const empty=document.createElement("option");empty.value="";empty.text="-- Select Chapter --";chapterSel.appendChild(empty);
    for(const ch of chapters){const o=document.createElement("option");o.value=ch.chapter_title;o.text=ch.chapter_title+(ch.table_id?` (${ch.table_id})`:"");chapterSel.appendChild(o);}
    setDisabled(chapterSel,false);return showStatus(`Loaded ${chapters.length} chapters.`);
  }

  CURRENT_REQUIRES_BOOK=true;if(bookContainer)bookContainer.classList.remove("hidden");
  const books=getBooksForSubject(CURRENT_CURRICULUM,subjectKey);if(!books.length)return showStatus("No books found.");
  fillSelect(bookSel,books,"-- Select Book --");setDisabled(bookSel,false);
  showStatus(`Loaded ${books.length} books.`);
}catch(err){showStatus("❌ "+err.message);}}

function onBookChange(){try{
  const subjectSel=el("subjectSelect"),bookSel=el("bookSelect"),chapterSel=el("chapterSelect"),generateBtn=el("generateBtn"),refreshBtn=el("refreshBtn");
  clearSelect(chapterSel);setDisabled(chapterSel);generateBtn.disabled=true;refreshBtn.disabled=true;
  if(!CURRENT_REQUIRES_BOOK)return;

  const subjectKey=subjectSel.value,bookKey=bookSel.value;
  if(!subjectKey||!bookKey)return showStatus("Select a book.");

  const chapters=getChaptersForBook(CURRENT_CURRICULUM,subjectKey,bookKey);
  if(!chapters.length)return showStatus("No chapters found.");
  const empty=document.createElement("option");empty.value="";empty.text="-- Select Chapter --";chapterSel.appendChild(empty);
  for(const ch of chapters){const o=document.createElement("option");o.value=ch.chapter_title;o.text=ch.chapter_title+(ch.table_id?` (${ch.table_id})`:"");chapterSel.appendChild(o);}
  setDisabled(chapterSel,false);showStatus(`Loaded ${chapters.length} chapters.`);
}catch(err){showStatus("❌ "+err.message);}}

function onChapterChange(){const c=el("chapterSelect");el("generateBtn").disabled=!c.value.trim();el("refreshBtn").disabled=!c.value.trim();}


// ======================================================================================================
// SECTION 5 — CORE AUTOMATION (UNCHANGED)
// ======================================================================================================

export async function runAutomation(options){
  try{
    const classVal=options?.class||el("classSelect").value,subjectVal=options?.subject||el("subjectSelect").value,bookVal=options?.book||el("bookSelect").value,chapterVal=options?.chapter||el("chapterSelect").value;
    if(!classVal||!subjectVal||(!bookVal&&CURRENT_REQUIRES_BOOK)||!chapterVal)throw new Error("Complete Class → Subject "+(CURRENT_REQUIRES_BOOK?"→ Book ":"→ ")+"→ Chapter");

    const existingTable=getExistingTableId(classVal,subjectVal,bookVal,chapterVal);
    showStatus(`Starting automation for: ${chapterVal} ${existingTable?'(existing:'+existingTable+')':'(new)'}`);

    showStatus("Requesting Gemini...");
    const geminiRes=await postJSON("/api/gemini",{meta:{class_name:classVal,subject:subjectVal,book:CURRENT_REQUIRES_BOOK?bookVal:null,chapter:chapterVal}});
    const questions=geminiRes.questions||[];showStatus(`Gemini produced ${questions.length} questions.`);

    showStatus("Sending questions to Supabase...");
    const manageRes=await postJSON("/api/manageSupabase",{meta:{class_name:classVal,subject:subjectVal,book:CURRENT_REQUIRES_BOOK?bookVal:null,chapter:chapterVal},csv:questions});
    const newTableId=manageRes.new_table_id||manageRes.table;
    showStatus(`Supabase table → ${newTableId}`);if(manageRes.message)showStatus(manageRes.message);

    alert("✔ Automation completed.");
    el("chapterSelect").value="";el("generateBtn").disabled=true;el("refreshBtn").disabled=true;

  }catch(err){alert("Failed: "+err.message);showStatus("Failed: "+err.message);}
}

async function onRefreshClick(){await runAutomation({});}


// ======================================================================================================
// SECTION 7 — Initialization
// ======================================================================================================

document.addEventListener("DOMContentLoaded",()=>{
  const cs=el("classSelect"),ss=el("subjectSelect"),bs=el("bookSelect"),chs=el("chapterSelect"),g=el("generateBtn"),r=el("refreshBtn"),bc=el("bookContainer");
  if(!cs||!ss||!bs||!chs)return;
  setDisabled(ss);setDisabled(bs);setDisabled(chs);g.disabled=true;r.disabled=true;if(bc)bc.classList.add("hidden");
  cs.addEventListener("change",onClassChange);
  ss.addEventListener("change",onSubjectChange);
  bs.addEventListener("change",onBookChange);
  chs.addEventListener("change",onChapterChange);
  g.addEventListener("click",()=>runAutomation({}));
  r.addEventListener("click",onRefreshClick);
  appendLog("Ready4Exam TableAutomation Ready");
});
