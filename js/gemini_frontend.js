// gemini_frontend.js — FINAL CLEAN VERSION with optimized tableName builder

// Backend root
const BACKEND_API = "https://ready4exam-master-automation.vercel.app";

// Helpers
const $ = (id) => document.getElementById(id);
const log = (m) => ($("log").value += m + "\n");

// UI elements
const classSelect = $("classSelect");
const subjectSelect = $("subjectSelect");
const bookSelect = $("bookSelect");
const chapterSelect = $("chapterSelect");
const bookContainer = $("bookContainer");
const generateBtn = $("generateBtn");

let curriculum = null;

// =======================================================
// 1. LOAD CURRICULUM (Repo → Backend Fallback)
// =======================================================
async function loadCurriculum(cls) {
  const repoUrl = `https://ready4exam.github.io/ready4exam-${cls}/js/curriculum.js`;
  const backendUrl = `${BACKEND_API}/static_curriculum/class${cls}/curriculum.json`;

  try {
    log(`📘 Trying curriculum from: ${repoUrl}`);
    const module = await import(repoUrl);
    const raw = module.curriculum ?? module.default ?? module;
    log("✅ Loaded curriculum from class repo.");
    return normalize(raw);
  } catch {
    log("⚠️ Repo curriculum missing → fallback to backend JSON...");
  }

  const res = await fetch(backendUrl);
  if (!res.ok) throw new Error(`Backend curriculum missing for class ${cls}.`);
  log("✅ Loaded curriculum from backend static JSON.");
  return normalize(await res.json());
}

// =======================================================
// 2. NORMALIZE CURRICULUM
// =======================================================
function normalize(raw) {
  if (!raw) return {};

  if (Array.isArray(raw)) {
    const out = {};
    raw.forEach((s) => {
      out[s.subject] = {};
      s.books.forEach((b) => {
        out[s.subject][b.bookName] = b.chapters.map((c) =>
          typeof c === "string" ? { chapter_title: c } : c
        );
      });
    });
    return out;
  }

  if (typeof raw === "object") {
    const out = {};
    Object.keys(raw).forEach((subj) => {
      out[subj] = {};
      Object.keys(raw[subj]).forEach((book) => {
        out[subj][book] = raw[subj][book].map((c) =>
          typeof c === "string" ? { chapter_title: c } : c
        );
      });
    });
    return out;
  }

  return {};
}

// =======================================================
// 3. POPULATE UI
// =======================================================
function populateSubjects() {
  subjectSelect.innerHTML =
    `<option value="">-- Select Subject --</option>` +
    Object.keys(curriculum).map((s) => `<option>${s}</option>`).join("");

  subjectSelect.disabled = false;
  bookContainer.classList.add("hidden");
  chapterSelect.disabled = true;
  generateBtn.disabled = true;
}

function populateBooks(subj) {
  const books = Object.keys(curriculum[subj] || {});

  if (Number(classSelect.value) >= 11 || books.length > 1) {
    bookContainer.classList.remove("hidden");
    bookSelect.innerHTML =
      `<option value="">-- Select Book --</option>` +
      books.map((b) => `<option>${b}</option>`).join("");
  } else {
    bookContainer.classList.add("hidden");
    populateChapters(subj, books[0]);
  }
}

function populateChapters(subj, book) {
  const chapters = curriculum[subj][book];
  chapterSelect.innerHTML =
    `<option value="">-- Select Chapter --</option>` +
    chapters.map((c) => `<option value="${c.chapter_title}">${c.chapter_title}</option>`).join("");

  chapterSelect.disabled = false;
  generateBtn.disabled = false;
}

// =======================================================
// 4. EVENT HANDLERS
// =======================================================
classSelect.addEventListener("change", async () => {
  const cls = classSelect.value;
  if (!cls) return;

  $("log").value = "";
  log(`=== Loading Class ${cls} Curriculum ===`);

  try {
    curriculum = await loadCurriculum(cls);
    populateSubjects();
    log("📗 Subjects ready.");
  } catch (err) {
    log(`❌ Failed: ${err.message}`);
  }
});

subjectSelect.addEventListener("change", () => {
  const subj = subjectSelect.value;
  if (!subj) return;
  populateBooks(subj);
});

bookSelect.addEventListener("change", () => {
  const subj = subjectSelect.value;
  const book = bookSelect.value;
  if (subj && book) populateChapters(subj, book);
});

// =======================================================
// 5. OPTIMIZED TABLE NAME BUILDER
// =======================================================
function buildTableName(cls, subject, chapter) {
  return `class${cls}_${subject}_${chapter}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")     // replace all non-alphanumeric
    .replace(/^_+|_+$/g, "");        // trim start/end underscores
}

// =======================================================
// 6. GEMINI → SUPABASE AUTOMATION (aligned with backend)
// =======================================================
generateBtn.addEventListener("click", async () => {
  const cls = classSelect.value;
  const subj = subjectSelect.value;

  const book =
    bookContainer.classList.contains("hidden")
      ? Object.keys(curriculum[subj])[0]
      : bookSelect.value;

  const chapter = chapterSelect.value;

  log(`⚙️ Generating questions for ${chapter}...`);

  // 1️⃣ Call Gemini (backend expects meta)
  const genRes = await fetch(`${BACKEND_API}/api/gemini`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      meta: {
        class_name: `class${cls}`,
        subject: subj,
        book,
        chapter,
        num: 60
      }
    })
  });

  const genData = await genRes.json();

  if (!genData.ok || !genData.questions) {
    log("❌ Gemini error: " + genData.error);
    return;
  }

  const rows = genData.questions;     
  const count = rows.length;          

  const tableName = buildTableName(cls, subj, chapter);

  log(`✅ Gemini generated ${count} questions`);
  log(`📄 Table Name: ${tableName}`);
  log(`📤 Uploading to Supabase...`);

  // 2️⃣ Upload to Supabase
  const upRes = await fetch(`${BACKEND_API}/api/manageSupabase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      className: `class${cls}`,
      tableName,
      rows
    })
  });

  const upData = await upRes.json();
  log(`✅ Supabase inserted: ${upData.inserted} rows`);
  log("🎉 Automation flow completed successfully.");
});
