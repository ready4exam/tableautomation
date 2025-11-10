// ----------------------------
// Ready4Exam Developer Tool
// Frontend Script (Phase-2 Automation with Mapping Integration)
// ----------------------------

const baseStatic = "https://ready4exam-master-automation.vercel.app/static_curriculum";

// 🔹 Element References
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
      log(`📗 Chapters loaded for ${subjectValue} (${firstBook}).`);
    }
  } catch (err) {
    log(`❌ ${err.message}`);
  }
});

// ------------------------------------------------
// 3️⃣ Book → Chapters
// ------------------------------------------------
bookSelect.addEventListener("change", async () => {
  const classValue = classSelect.value;
  const subjectValue = subjectSelect.value;
  const bookValue = bookSelect.value;
  if (!bookValue) return;

  const res = await fetch(`${baseStatic}/class${classValue}/curriculum.json`);
  const curriculum = await res.json();
  const chapters = curriculum[subjectValue]?.[bookValue] || [];
  fillChapterDropdown(chapters);
  log(`📗 Chapters loaded for ${subjectValue} → ${bookValue}`);
});

function fillChapterDropdown(chapters) {
  chapterSelect.innerHTML = '<option value="">-- Select Chapter --</option>';
  chapters.forEach((ch) => {
    const title = ch.chapter_title || ch.title || "Untitled Chapter";
    chapterSelect.innerHTML += `<option value="${title}">${title}</option>`;
  });
  chapterSelect.disabled = false;
  generateBtn.disabled = false;
  refreshBtn.disabled = false;
}

// ------------------------------------------------
// 4️⃣ Generate or Refresh Quiz
// ------------------------------------------------
generateBtn.addEventListener("click", () => handleGenerateOrRefresh(false));
refreshBtn.addEventListener("click", () => handleGenerateOrRefresh(true));

async function handleGenerateOrRefresh(isRefresh) {
  const classValue = classSelect.value;
  const subjectValue = subjectSelect.value;
  const bookValue = bookSelect.value || "N/A";
  const chapterValue = chapterSelect.value;

  if (!classValue || !subjectValue || !chapterValue) {
    log("⚠️ Please select all fields first.");
    return;
  }

  try {
    // -----------------------------
    // Step 1 – Ask Gemini to generate questions
    // -----------------------------
    log(isRefresh ? "🔄 Refreshing question set..." : "⚙️ Generating 60-question set...");
    const geminiRes = await fetch("https://ready4exam-master-automation.vercel.app/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ class_name: classValue, subject: subjectValue, book: bookValue, chapter: chapterValue }),
    });
    const geminiData = await geminiRes.json();
    if (!geminiData.ok || !geminiData.questions) throw new Error("Gemini generation failed.");
    const generatedQuestionsArray = geminiData.questions;
    log(`✅ Gemini generated ${generatedQuestionsArray.length} questions.`);

    // -----------------------------
    // Step 2 – Upload to Supabase (manageSupabase)
    // -----------------------------
    const uploadRes = await fetch("https://ready4exam-master-automation.vercel.app/api/manageSupabase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meta: {
          class_name: classValue,
          subject: subjectValue,
          book: bookValue,
          chapter: chapterValue,
          refresh: isRefresh,
        },
        csv: generatedQuestionsArray,
      }),
    });

    const uploadData = await uploadRes.json();
    if (!uploadRes.ok) throw new Error(uploadData.error || "Upload failed");
    log(`✅ ${uploadData.message}`);

    // -----------------------------
    // Step 3 – Verify Mapping (new)
    // -----------------------------
    const mapRes = await fetch("https://ready4exam-master-automation.vercel.app/api/getMapping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        class_name: classValue,
        subject: subjectValue,
        chapter: chapterValue,
      }),
    });
    const mapData = await mapRes.json();
    if (mapData.ok && mapData.table_name) {
      log(`🔗 Verified mapping: ${chapterValue} → ${mapData.table_name}`);
    } else {
      log(`⚠️ No mapping found for ${chapterValue}`);
    }
  } catch (err) {
    log(`❌ Error: ${err.message}`);
  }
}
