// gemini_frontend.js — Robust loader + generate/upload flow
// No external config.js required. Uses backend static curriculum as fallback.

const BACKEND_API = "https://ready4exam-master-automation.vercel.app";
const GEMINI_API_KEY = "dev-mode"; // backend will validate

const $ = (id) => document.getElementById(id);
const log = (s) => ($("log").value += s + "\n");

const classSelect = $("classSelect");
const subjectSelect = $("subjectSelect");
const bookSelect = $("bookSelect");
const chapterSelect = $("chapterSelect");
const bookContainer = $("bookContainer");
const generateBtn = $("generateBtn");
const refreshBtn = $("refreshBtn");

let curriculum = null; // normalized object: { subject: { bookName: [ {chapter_title,..}, ... ] } }

// Helper: try loading from repo github pages, else fallback to backend static JSON
async function loadCurriculumForClass(cls) {
  // cls is numeric string: "6", "11", etc.
  const repoUrl = `https://ready4exam.github.io/ready4exam-${cls}/js/curriculum.js`;
  const backendUrl = `${BACKEND_API}/static_curriculum/class${cls}/curriculum.json`;

  // Try GitHub Pages dynamic import first (works when repo has curriculum.js)
  try {
    log(`Trying repo curriculum: ${repoUrl}`);
    const module = await import(repoUrl);
    // module could export curriculum as object or default; normalize below
    const c = module.curriculum ?? module.default ?? module;
    log("Loaded curriculum from repo.");
    return normalizeCurriculum(c);
  } catch (err) {
    log(`Repo load failed (expected on missing repos). Falling back to backend: ${backendUrl}`);
    // Fall back to fetching backend JSON
    const res = await fetch(backendUrl);
    if (!res.ok) throw new Error(`Backend curriculum fetch failed: ${res.status}`);
    const json = await res.json();
    log("Loaded curriculum from backend.");
    return normalizeCurriculum(json);
  }
}

// Normalize supported shapes into canonical object:
// Input shapes handled:
// 1) object: { "Physics": { "Book A": [ {chapter_title}, ... ] } }
// 2) array: [ { subject: "Physics", books: [ { bookName, chapters: [..] } ] } ]
function normalizeCurriculum(raw) {
  if (!raw) return {};
  // If it's an array of {subject, books}
  if (Array.isArray(raw)) {
    const out = {};
    raw.forEach((s) => {
      const subj = s.subject || s.name;
      out[subj] = {};
      const books = s.books || s.books_list || [];
      books.forEach((b) => {
        const name = b.bookName || b.book || "Book";
        const chapters = b.chapters || b.chapters_list || [];
        // ensure chapters are objects with chapter_title
        out[subj][name] = chapters.map((ch) =>
          typeof ch === "string" ? { chapter_title: ch } : ch
        );
      });
    });
    return out;
  }

  // If it's already an object in form { subject: { book: [ {chapter_title} ] } }
  if (typeof raw === "object") {
    // convert arrays of chapter strings to objects if needed
    const out = {};
    Object.keys(raw).forEach((subj) => {
      out[subj] = {};
      const books = raw[subj] || {};
      Object.keys(books).forEach((bookName) => {
        const chapters = books[bookName] || [];
        out[subj][bookName] = chapters.map((c) =>
          typeof c === "string" ? { chapter_title: c } : c
        );
      });
    });
    return out;
  }

  return {};
}

// UI population helpers
function populateSubjects(curr) {
  subjectSelect.innerHTML =
    `<option value="">-- Select Subject --</option>` +
    Object.keys(curr)
      .map((s) => `<option value="${s}">${s}</option>`)
      .join("");
  subjectSelect.disabled = false;
  bookContainer.classList.add("hidden");
  bookSelect.innerHTML = "";
  chapterSelect.innerHTML = `<option value="">-- Select Chapter --</option>`;
  chapterSelect.disabled = true;
  generateBtn.disabled = true;
}

function populateBooksForSubject(subj) {
  const books = Object.keys(curriculum[subj] || {});
  if (books.length === 0) {
    bookContainer.classList.add("hidden");
  } else {
    bookContainer.classList.remove("hidden");
    bookSelect.innerHTML =
      `<option value="">-- Select Book --</option>` +
      books.map((b) => `<option value="${b}">${b}</option>`).join("");
  }
  chapterSelect.innerHTML = `<option value="">-- Select Chapter --</option>`;
  chapterSelect.disabled = true;
  generateBtn.disabled = true;
}

function populateChapters(subj, book) {
  const chArr = curriculum[subj][book] || [];
  chapterSelect.innerHTML =
    `<option value="">-- Select Chapter --</option>` +
    chArr.map((c) => `<option value="${c.chapter_title}">${c.chapter_title}</option>`).join("");
  chapterSelect.disabled = false;
  generateBtn.disabled = false;
}

// Events
classSelect.addEventListener("change", async () => {
  const cls = classSelect.value;
  if (!cls) return;
  log(`\n--- Loading class ${cls} ---`);
  try {
    curriculum = await loadCurriculumForClass(String(cls));
    populateSubjects(curriculum);
  } catch (err) {
    log(`❌ Failed to load curriculum: ${err.message}`);
    console.error(err);
    subjectSelect.disabled = true;
  }
});

subjectSelect.addEventListener("change", () => {
  const subj = subjectSelect.value;
  if (!subj) return;
  // For classes 11/12 there are books; for others we expect subject -> chapters directly
  const books = Object.keys(curriculum[subj] || {});
  // If only one book and class is <11, treat it as direct chapters (but support both)
  populateBooksForSubject(subj);
});

bookSelect.addEventListener("change", () => {
  const subj = subjectSelect.value;
  const book = bookSelect.value;
  if (!subj || !book) return;
  populateChapters(subj, book);
});

chapterSelect.addEventListener("change", () => {
  // chapter selected; enable generate
  const ch = chapterSelect.value;
  generateBtn.disabled = !ch;
});

// GENERATE: call Gemini, parse CSV if needed (backend returns rows), and upload via manageSupabase
generateBtn.addEventListener("click", async () => {
  const cls = classSelect.value;
  const subj = subjectSelect.value;
  // determine book (may be empty for classes <11)
  const book = bookContainer.classList.contains("hidden") ? "" : bookSelect.value;
  const chapter = chapterSelect.value;
  if (!cls || !subj || !chapter) {
    log("Select class, subject and chapter first.");
    return;
  }

  log(`⚙️ Requesting 60 questions for ${subj} — ${chapter} ...`);
  try {
    const genRes = await fetch(`${BACKEND_API}/api/gemini`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": GEMINI_API_KEY
      },
      body: JSON.stringify({ className: `class${cls}`, subject: subj, book, chapter })
    });
    if (!genRes.ok) throw new Error(`gemini API ${genRes.status}`);
    const genData = await genRes.json();
    log(`✅ Gemini returned ${genData.count ?? genData.rows?.length ?? 0} items.`);

    // Upload to supabase via manageSupabase
    log("📤 Uploading to Supabase...");
    const upRes = await fetch(`${BACKEND_API}/api/manageSupabase`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        className: `class${cls}`,
        tableName: genData.table,
        rows: genData.rows
      })
    });
    if (!upRes.ok) throw new Error(`manageSupabase ${upRes.status}`);
    const upData = await upRes.json();
    log(`✅ Supabase inserted ${upData.inserted ?? upData.count ?? "?"} rows.`);
    log("🎉 Done.");
  } catch (err) {
    log(`❌ Error during generate/upload: ${err.message}`);
    console.error(err);
  }
});
