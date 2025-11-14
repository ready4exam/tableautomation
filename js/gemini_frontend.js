// gemini_frontend.js
// -------------------------------------------------------
// Phase-3 Stable Automation Tool (Class 5–12)
// -------------------------------------------------------

// -------------------------------------------------------
// CONFIG
// -------------------------------------------------------
const BACKEND = "https://ready4exam-master-automation.vercel.app";

//--------------------------------------------------------
// LOGGING
//--------------------------------------------------------
function log(msg) {
  const box = document.getElementById("log");
  box.value += msg + "\n";
  box.scrollTop = box.scrollHeight;
}

// -------------------------------------------------------
// CURRICULUM LOADER
// -------------------------------------------------------
function getCurriculumURL(className) {
  const num = className.replace("class", ""); 
  return `https://ready4exam.github.io/ready4exam-${num}/js/curriculum.js`;
}

async function loadCurriculum(className) {
  log(`=== Loading Class ${className} Curriculum ===`);

  try {
    const url = getCurriculumURL(className);
    log(`📘 Loading from: ${url}`);

    const module = await import(url + "?v=" + Date.now());
    const curriculum = module.curriculum;

    log("✅ Curriculum loaded.");

    return curriculum;
  } catch (err) {
    console.error(err);
    log("❌ Failed loading curriculum.js");
    throw err;
  }
}

// -------------------------------------------------------
// TABLE NAME BUILDER
// -------------------------------------------------------
function buildTableName(chapterTitle) {
  const slug = chapterTitle
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .split(/\s+/);

  if (slug.length === 1) return `${slug[0]}_quiz`;

  const first = slug[0];
  const last = slug[slug.length - 1];

  return `${first}_${last}_quiz`;
}

// -------------------------------------------------------
// UI ELEMENTS
// -------------------------------------------------------
const classSelect = document.getElementById("classSelect");
const subjectSelect = document.getElementById("subjectSelect");
const bookSelect = document.getElementById("bookSelect");
const chapterSelect = document.getElementById("chapterSelect");
const generateBtn = document.getElementById("generateBtn");
const refreshBtn = document.getElementById("refreshBtn");

let CURR = null;

// -------------------------------------------------------
// CLASS → SUBJECTS
// -------------------------------------------------------
classSelect.onchange = async () => {
  const cls = classSelect.value;
  if (!cls) return;

  CURR = await loadCurriculum(cls);

  subjectSelect.innerHTML =
    `<option value="">-- Select Subject --</option>` +
    Object.keys(CURR)
      .map((s) => `<option value="${s}">${s}</option>`)
      .join("");

  subjectSelect.disabled = false;
  bookSelect.innerHTML = "";
  chapterSelect.innerHTML = "";
};

// -------------------------------------------------------
// SUBJECT → BOOKS
// -------------------------------------------------------
subjectSelect.onchange = () => {
  const subj = subjectSelect.value;
  if (!subj) return;

  const books = Object.keys(CURR[subj]);

  if (books.length === 1) {
    bookSelect.innerHTML = `<option>${books[0]}</option>`;
    document.getElementById("bookContainer").classList.add("hidden");
    loadChapters(subj, books[0]);
  } else {
    document.getElementById("bookContainer").classList.remove("hidden");

    bookSelect.innerHTML =
      `<option>-- Select Book --</option>` +
      books.map((b) => `<option>${b}</option>`).join("");
  }
};

// -------------------------------------------------------
// BOOK → CHAPTERS
// -------------------------------------------------------
bookSelect.onchange = () => {
  loadChapters(subjectSelect.value, bookSelect.value);
};

function loadChapters(subj, book) {
  const chapters = CURR[subj][book];

  chapterSelect.innerHTML =
    `<option value="">-- Select Chapter --</option>` +
    chapters
      .map((c) => `<option>${c.chapter_title}</option>`)
      .join("");

  chapterSelect.disabled = false;

  generateBtn.disabled = false;
  refreshBtn.disabled = false;
}

// -------------------------------------------------------
// GENERATE & UPLOAD
// -------------------------------------------------------
generateBtn.onclick = async () => {
  const cls = classSelect.value;
  const subj = subjectSelect.value;
  const book = bookSelect.value;
  const chapter = chapterSelect.value;

  log(`⚙️ Generating questions for ${chapter}...`);

  const meta = {
    class_name: cls,
    subject: subj,
    book,
    chapter
  };

  // 1️⃣ CALL GEMINI
  const genRes = await fetch(`${BACKEND}/api/gemini`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ meta })
  });

  const gen = await genRes.json();

  if (!gen.ok) {
    log("❌ Gemini error: " + gen.error);
    return;
  }

  log(`✅ Gemini created ${gen.questions.length} questions`);

  const table = buildTableName(chapter);

  // 2️⃣ UPLOAD TO SUPABASE
  log("📤 Uploading to Supabase...");

  const upRes = await fetch(`${BACKEND}/api/manageSupabase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      meta,
      csv: gen.questions
    })
  });

  const up = await upRes.json();

  if (!up.ok) {
    log("❌ Upload failed: " + up.error);
    return;
  }

  log(`✅ Uploaded ${gen.questions.length} rows to ${table}`);

  log("🎉 Automation completed successfully!");

  // 3️⃣ START QUIZ
  location.href = `quiz-engine.html?table=${table}&difficulty=medium`;
};
