// ----------------------------
// Ready4Exam Developer Tool (Phase-2 Automation)
// Full Integration: Gemini → Supabase (Stable Backend)
// ----------------------------

const baseStatic = "https://ready4exam-master-automation.vercel.app/static_curriculum";

// 🔹 UI Elements
const classSelect = document.getElementById("classSelect");
const subjectSelect = document.getElementById("subjectSelect");
const bookContainer = document.getElementById("bookContainer");
const bookSelect = document.getElementById("bookSelect");
const chapterSelect = document.getElementById("chapterSelect");
const generateBtn = document.getElementById("generateBtn");
const refreshBtn = document.getElementById("refreshBtn");
const logBox = document.getElementById("log");

// 🔹 Logger
function log(...args) {
  const msg = args.join(" ");
  console.log(msg);
  logBox.value += msg + "\n";
  logBox.scrollTop = logBox.scrollHeight;
}

// ------------------------------------------------
// 1️⃣ Load Curriculum
// ------------------------------------------------
classSelect.addEventListener("change", async () => {
  const classValue = classSelect.value;
  subjectSelect.innerHTML = '<option value="">-- Select Subject --</option>';
  bookSelect.innerHTML = '<option value="">-- Select Book --</option>';
  chapterSelect.innerHTML = '<option value="">-- Select Chapter --</option>';
  subjectSelect.disabled = true;
  bookContainer.classList.add("hidden");
  chapterSelect.disabled = true;
  generateBtn.disabled = true;
  refreshBtn.disabled = true;

  if (!classValue) return;

  try {
    log(`📚 Loading curriculum for Class ${classValue}...`);
    const res = await fetch(`${baseStatic}/class${classValue}/curriculum.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const curriculum = await res.json();

    const subjects = Object.keys(curriculum);
    subjects.forEach((sub) => {
      subjectSelect.innerHTML += `<option value="${sub}">${sub}</option>`;
    });

    subjectSelect.disabled = false;
    log(`✅ Subjects loaded for Class ${classValue}.`);
  } catch (err) {
    log(`❌ ${err.message}`);
  }
});

// ------------------------------------------------
// 2️⃣ Subject → Book / Chapters
// ------------------------------------------------
subjectSelect.addEventListener("change", async () => {
  const classValue = classSelect.value;
  const subjectValue = subjectSelect.value;
  if (!subjectValue) return;

  try {
    const res = await fetch(`${baseStatic}/class${classValue}/curriculum.json`);
    const curriculum = await res.json();
    const subjectData = curriculum[subjectValue];

    if (["11", "12"].includes(classValue)) {
      const books = Object.keys(subjectData);
      bookSelect.innerHTML = '<option value="">-- Select Book --</option>';
      books.forEach((b) => (bookSelect.innerHTML += `<option value="${b}">${b}</option>`));
      bookContainer.classList.remove("hidden");
      chapterSelect.disabled = true;
      log(`📘 Books loaded for ${subjectValue}.`);
    } else {
      const books = Object.keys(subjectData);
      const firstBook = books[0];
      const chapters = subjectData[firstBook] || [];
      fillChapterDropdown(chapters);
      bookContainer.classList.add("hidden");
      log(`📗 Chapters
