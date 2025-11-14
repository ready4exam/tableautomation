// ------------------------------
//  gemini_frontend.js – FINAL VERSION
//  Fully aligned with Phase-2 backend
//  Sends:  { meta: {...}, csv: [...] }
// ------------------------------

const BACKEND_API = "https://ready4exam-master-automation.vercel.app";

const $ = (id) => document.getElementById(id);
const log = (m) => ($("log").value += m + "\n");

// UI refs
const classSelect = $("classSelect");
const subjectSelect = $("subjectSelect");
const bookSelect = $("bookSelect");
const chapterSelect = $("chapterSelect");
const bookContainer = $("bookContainer");
const generateBtn = $("generateBtn");

let curriculum = null;

// ==========================================
// 1. LOAD CURRICULUM (Repo → Backend Fallback)
// ==========================================
async function loadCurriculum(cls) {
  const repoUrl = `https://ready4exam.github.io/ready4exam-${cls}/js/curriculum.js`;
  const backendUrl = `${BACKEND_API}/static_curriculum/class${cls}/curriculum.json`;

  try {
    log(`📘 Trying curriculum from: ${repoUrl}`);
    const module = await import(repoUrl);
    const raw = module.curriculum ?? module.default ?? module;
    log("✅ Loaded curriculum from class repo.");
    return normalize(raw);
  } catch (e) {
    log("⚠️ Repo curriculum missing → trying backend...");
  }

  const res = await fetch(backendUrl);
  if (!res.ok) throw new Error(`Backend curriculum missing for class ${cls}`);

  log("✅ Loaded curriculum from backend static JSON.");
  return normalize(await res.json());
}

// Normalizer
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

// ==========================================
// 2. POPULATE SUBJECTS, BOOKS, CHAPTERS
// ==========================================
function populateSubjects() {
  subjectSelect.innerHTML =
    `<option value="">-- Select Subject --</option>` +
    Object.keys(curriculum).map((s) => `<option>${s}</option>`).join("");

  subjectSelect.disabled = false;
  chapterSelect.disabled = true;
  generateBtn.disabled = true;
  bookContainer.classList.add("hidden");
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
    chapters
      .map((c) => `<option value="${c.chapter_title}">${c.chapter_title}</option>`)
      .join("");

  chapterSelect.disabled = false;
  generateBtn.disabled = false;
}

// ==========================================
// 3. EVENT LISTENERS
// ==========================================
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
    log("❌ " + err.message);
  }
});

subjectSelect.addEventListener("change", () => {
  const subj = subjectSelect.value;
  if (subj) populateBooks(subj);
});

bookSelect.addEventListener("change", () => {
  const subj = subjectSelect.value;
  const book = bookSelect.value;
  if (subj && book) populateChapters(subj, book);
});

// ==========================================
// 4. GEMINI → SUPABASE AUTOMATION
// ==========================================
generateBtn.addEventListener("click", async () => {
  const cls = classSelect.value;
  const subj = subjectSelect.value;

  const book =
    bookContainer.classList.contains("hidden")
      ? Object.keys(curriculum[subj])[0]
      : bookSelect.value;

  const chapter = chapterSelect.value;

  log(`⚙️ Generating questions for ${chapter}...`);

  // 1️⃣ Call GEMINI backend
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
  log(`✅ Gemini generated ${rows.length} questions`);

  // 2️⃣ Upload to Supabase – FINAL, CORRECT PAYLOAD
  log("📤 Uploading to Supabase...");

  const upRes = await fetch(`${BACKEND_API}/api/manageSupabase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      meta: {
        class_name: `class${cls}`,
        subject: subj,
        book,
        chapter,
        refresh: false
      },
      csv: rows
    })
  });

  const upData = await upRes.json();

  if (!upData.ok) {
    log("❌ Supabase Error: " + upData.error);
    return;
  }

  log(`✅ Supabase inserted ${rows.length} rows`);
  log("🎉 Automation flow completed successfully.");
});
