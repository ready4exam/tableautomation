// gemini_frontend.js — Clean version WITHOUT config.js

// Hardcoded backend values
const BACKEND_API = "https://ready4exam-master-automation.vercel.app";
const GEMINI_API_KEY = "dev-mode";

// UI Helpers
const log = (m) => (document.getElementById("log").value += m + "\n");

// UI Elements
const classSelect = document.getElementById("classSelect");
const subjectSelect = document.getElementById("subjectSelect");
const bookSelect = document.getElementById("bookSelect");
const chapterSelect = document.getElementById("chapterSelect");
const bookContainer = document.getElementById("bookContainer");
const generateBtn = document.getElementById("generateBtn");

let curriculum = null;

// CLASS → LOAD curriculum.js dynamically from class repo
classSelect.addEventListener("change", async () => {
  const cls = classSelect.value;
  if (!cls) return;

  log(`📘 Loading Class ${cls} curriculum.js...`);

  const url = `https://ready4exam.github.io/ready4exam-${cls}/js/curriculum.js`;

  try {
    const module = await import(url); // dynamic import
    curriculum = module.curriculum;

    // SUBJECTS
    subjectSelect.innerHTML =
      `<option value="">-- Select Subject --</option>` +
      Object.keys(curriculum)
        .map((s) => `<option>${s}</option>`)
        .join("");

    subjectSelect.disabled = false;
    log("📗 Subjects loaded.");
  } catch (err) {
    log("❌ Failed to load curriculum.js");
    console.error(err);
  }
});

// SUBJECT → BOOKS
subjectSelect.addEventListener("change", () => {
  const subj = subjectSelect.value;
  if (!subj) return;

  const books = Object.keys(curriculum[subj]);

  bookSelect.innerHTML =
    `<option value="">-- Select Book --</option>` +
    books.map((b) => `<option>${b}</option>`).join("");

  bookContainer.classList.remove("hidden");
});

// BOOK → CHAPTERS
bookSelect.addEventListener("change", () => {
  const subj = subjectSelect.value;
  const book = bookSelect.value;

  const chapters = curriculum[subj][book];

  chapterSelect.innerHTML =
    `<option value="">-- Select Chapter --</option>` +
    chapters.map((c) => `<option>${c.chapter_title}">${c.chapter_title}</option>`).join("");

  chapterSelect.disabled = false;
});

// GENERATE + UPLOAD
generateBtn.addEventListener("click", async () => {
  const cls = classSelect.value;
  const subj = subjectSelect.value;
  const book = bookSelect.value;
  const chapter = chapterSelect.value;

  log("⚙️ Generating questions via Gemini...");

  const genRes = await fetch(`${BACKEND_API}/api/gemini`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": GEMINI_API_KEY,
    },
    body: JSON.stringify({ className: cls, subject: subj, book, chapter }),
  });

  const genData = await genRes.json();
  log(`✅ Gemini generated ${genData.count} questions.`);

  log("📤 Uploading to Supabase...");

  const upRes = await fetch(`${BACKEND_API}/api/manageSupabase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      className: cls,
      tableName: genData.table,
      rows: genData.rows,
    }),
  });

  const upData = await upRes.json();

  log(`✅ Supabase upload complete: ${upData.inserted} rows inserted`);
  log("🎉 Automation complete.");
});
