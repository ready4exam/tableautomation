// gemini_frontend.js — FINAL CLEAN VERSION (No x-api-key, No dev-mode)

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

  // First try repo file
  try {
    log(`📘 Trying curriculum from: ${repoUrl}`);
    const module = await import(repoUrl);
    const raw = module.curriculum ?? module.default ?? module;
    log("✅ Loaded curriculum from class repo.");
    return normalize(raw);
  } catch (err) {
    log("⚠️ Repo curriculum missing → fallback to backend JSON...");
  }

  // Fallback
  const res = await fetch(backendUrl);
  if (!res.ok) throw new Error(`Backend curriculum missing for class ${cls}.`);
  log("✅ Loaded curriculum from backend static JSON.");
  return normalize(await res.json());
}

// =======================================================
// 2. Normalize Curriculum to Standard Shape
// =======================================================
function normalize(raw) {
  if (!raw) return {};

  // Format A — Array structure (backend JSON for class11/12)
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

  // Format B — Object structure (frontend repo)
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
// 3. Populate UI
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

  // Classes 11 & 12 → always show books
  if (Number(classSelect.value) >= 11 || books.length > 1) {
    bookContainer.classList.remove("hidden");
    bookSelect.innerHTML =
      `<option value="">-- Select Book --</option>` +
      books.map((b) => `<option>${b}</option>`).join("");
  } else {
    // classes 5–10: directly chapters (implicit single book)
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
// 5. FINAL: GEMINI → SUPABASE WORKING AUTOMATION (NO x-api-key)
// =======================================================
generateBtn.addEventListener("click", async () => {
  const cls = classSelect.value;
  const subj = subjectSelect.value;

  const book =
    bookContainer.classList.contains("hidden")
      ? Object.keys(curriculum[subj])[0] // class 5–10
      : bookSelect.value;

  const chapter = chapterSelect.value;

  log(`⚙️ Generating questions for ${chapter}...`);

  // 1. Call Gemini (no x-api-key)
  const genRes = await fetch(`${BACKEND_API}/api/gemini`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      className: `class${cls}`,
      subject: subj,
      book,
      chapter
    })
  });

  const genData = await genRes.json();
  log(`✅ Gemini generated ${genData.count} questions`);
  log(`📄 Target Table: ${genData.table}`);

  // 2. Upload to Supabase
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
  log(`✅ Supabase inserted: ${upData.inserted} rows`);
  log("🎉 Automation flow completed successfully.");
});
