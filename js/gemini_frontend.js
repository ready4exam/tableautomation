// gemini_frontend.js — FINAL STABLE VERSION (Class 5–12)
// With working Gemini → Supabase automation + dynamic curriculum loader.

// Backend constants
const BACKEND_API = "https://ready4exam-master-automation.vercel.app";
const GEMINI_API_KEY = "dev-mode";

// Helper
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
// 1. LOAD CURRICULUM (Repo → Backend fallback)
// =======================================================
async function loadCurriculum(cls) {
  const repoUrl = `https://ready4exam.github.io/ready4exam-${cls}/js/curriculum.js`;
  const backendUrl = `${BACKEND_API}/static_curriculum/class${cls}/curriculum.json`;

  // Try GitHub Pages curriculum.js
  try {
    log(`📘 Trying: ${repoUrl}`);
    const module = await import(repoUrl);

    const raw = module.curriculum ?? module.default ?? module;
    log("✅ Loaded curriculum from class repo.");
    return normalizeCurriculum(raw);
  } catch (err) {
    log("⚠️ Repo curriculum not found. Falling back to backend JSON...");
  }

  // Fallback — backend static curriculum
  const res = await fetch(backendUrl);
  if (!res.ok) throw new Error(`Backend curriculum missing. ${backendUrl}`);

  log("✅ Loaded curriculum from backend static JSON.");
  const json = await res.json();
  return normalizeCurriculum(json);
}

// =======================================================
// 2. NORMALIZE CURRICULUM (handle all formats)
// =======================================================
function normalizeCurriculum(raw) {
  if (!raw) return {};

  // CASE A: array format (class11/12 backend JSON)
  if (Array.isArray(raw)) {
    const out = {};
    raw.forEach((item) => {
      const subj = item.subject;
      out[subj] = {};
      item.books.forEach((b) => {
        out[subj][b.bookName] = b.chapters.map((c) =>
          typeof c === "string" ? { chapter_title: c } : c
        );
      });
    });
    return out;
  }

  // CASE B: object format (frontend repo curriculum.js)
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
  bookSelect.innerHTML = "";
  chapterSelect.disabled = true;
  generateBtn.disabled = true;
}

function populateBooks(subj) {
  const books = Object.keys(curriculum[subj] || {});

  if (books.length > 1 || Number(classSelect.value) >= 11) {
    // class 11 & 12 OR multi-book subjects
    bookContainer.classList.remove("hidden");
    bookSelect.innerHTML =
      `<option value="">-- Select Book --</option>` +
      books.map((b) => `<option>${b}</option>`).join("");
  } else {
    // classes 5–10: treat single book as direct chapters
    bookContainer.classList.add("hidden");
    bookSelect.innerHTML = books.length ? books[0] : "";
    populateChapters(subj, books[0]);
  }
}

function populateChapters(subj, book) {
  const list = curriculum[subj][book] || [];
  chapterSelect.innerHTML =
    `<option value="">-- Select Chapter --</option>` +
    list.map((c) => `<option value="${c.chapter_title}">${c.chapter_title}</option>`).join("");

  chapterSelect.disabled = false;
  generateBtn.disabled = false;
}

// =======================================================
// 4. EVENTS: Class → Subject → Book → Chapter
// =======================================================
classSelect.addEventListener("change", async () => {
  const cls = classSelect.value;
  if (!cls) return;

  $("log").value = ""; // clear logs
  log(`\n=== Loading Class ${cls} Curriculum ===`);

  try {
    curriculum = await loadCurriculum(cls);
    populateSubjects();

    log("📗 Subjects ready.");
  } catch (err) {
    log(`❌ Failed to load curriculum: ${err.message}`);
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

chapterSelect.addEventListener("change", () => {
  generateBtn.disabled = !chapterSelect.value;
});

// =======================================================
// 5. GENERATE + UPLOAD (RESTORED PHASE-2 WORKING BLOCK)
// =======================================================
generateBtn.addEventListener("click", async () => {
  const cls = classSelect.value;
  const subj = subjectSelect.value;
  const book = bookContainer.classList.contains("hidden")
    ? Object.keys(curriculum[subj])[0] // classes 5–10
    : bookSelect.value;
  const chapter = chapterSelect.value;

  log(`⚙️ Generating 60 questions for ${chapter}...`);

  // --- 1: Generate questions via Gemini ---
  const genRes = await fetch(`${BACKEND_API}/api/gemini`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": GEMINI_API_KEY
    },
    body: JSON.stringify({
      className: `class${cls}`,
      subject: subj,
      book,
      chapter
    })
  });

  const genData = await genRes.json();
  log(`✅ Gemini generated ${genData.count} questions.`);
  log(`📄 Table: ${genData.table}`);

  // --- 2: Upload to Supabase ---
  log("📤 Uploading rows to Supabase...");

  const upRes = await fetch(`${BACKEND_API}/api/manageSupabase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      className: `class${cls}`,
      tableName: genData.table,
      rows: genData.rows
    })
  });

  const upData = await upRes.json();

  log(`✅ Supabase inserted ${upData.inserted} rows.`);
  log("🎉 Automation flow completed successfully.");
});
