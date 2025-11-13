import { ENV } from "./config.js";

const log = (m) => {
  document.getElementById("log").value += m + "\n";
};

const classSelect = document.getElementById("classSelect");
const subjectSelect = document.getElementById("subjectSelect");
const bookSelect = document.getElementById("bookSelect");
const chapterSelect = document.getElementById("chapterSelect");
const bookContainer = document.getElementById("bookContainer");

const generateBtn = document.getElementById("generateBtn");
const refreshBtn = document.getElementById("refreshBtn");

let curriculum = null;

// Load curriculum
classSelect.addEventListener("change", async () => {
  const cls = classSelect.value;
  if (!cls) return;

  log(`📘 Loading curriculum for ${cls}...`);

  const res = await fetch(`${ENV.BACKEND_API}/static_curriculum/${cls}/curriculum.json`);
  curriculum = await res.json();

  subjectSelect.innerHTML = `<option value="">-- Select Subject --</option>` +
    Object.keys(curriculum).map(s => `<option>${s}</option>`).join("");

  subjectSelect.disabled = false;
});

// Subject → Books
subjectSelect.addEventListener("change", () => {
  const subj = subjectSelect.value;
  const books = Object.keys(curriculum[subj]);

  bookContainer.classList.remove("hidden");
  bookSelect.innerHTML = books.map(b => `<option>${b}</option>`).join("");

  chapterSelect.disabled = true;
});

// Book → Chapters
bookSelect.addEventListener("change", () => {
  const subj = subjectSelect.value;
  const book = bookSelect.value;

  const chapters = curriculum[subj][book];

  chapterSelect.innerHTML = chapters
    .map((c) => `<option>${c.chapter_title}</option>`)
    .join("");

  chapterSelect.disabled = false;
  generateBtn.disabled = false;
});

// Generate + Upload
generateBtn.addEventListener("click", async () => {
  const cls = classSelect.value;
  const subj = subjectSelect.value;
  const book = bookSelect.value;
  const chapter = chapterSelect.value;

  log("⚙️ Generating questions via Gemini...");

  const genRes = await fetch(`${ENV.BACKEND_API}/api/gemini`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ENV.GEMINI_API_KEY },
    body: JSON.stringify({ className: cls, subject: subj, book, chapter }),
  });

  const genData = await genRes.json();
  log(`✅ Gemini generated ${genData.count} questions.`);

  log("📤 Uploading to Supabase...");

  const upRes = await fetch(`${ENV.BACKEND_API}/api/manageSupabase`, {
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
  log("🎉 Full automation flow completed successfully.");
});
