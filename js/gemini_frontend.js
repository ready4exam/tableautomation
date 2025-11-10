// ----------------------------
// Ready4Exam Developer Tool – Phase 2 (Generate + Refresh)
// ----------------------------

const baseStatic = "https://ready4exam-master-automation.vercel.app/static_curriculum";

const classSelect = document.getElementById("classSelect");
const subjectSelect = document.getElementById("subjectSelect");
const bookContainer = document.getElementById("bookContainer");
const bookSelect = document.getElementById("bookSelect");
const chapterSelect = document.getElementById("chapterSelect");
const generateBtn = document.getElementById("generateBtn");
const refreshBtn = document.getElementById("refreshBtn");
const logBox = document.getElementById("log");

function log(...args) {
  const msg = args.join(" ");
  console.log(msg);
  logBox.value += msg + "\n";
  logBox.scrollTop = logBox.scrollHeight;
}

let currentCurriculum = null;
let generatedQuestionsArray = [];

// ----------------------------
// 1️⃣ Load curriculum by class
// ----------------------------
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
    currentCurriculum = await res.json();

    const subjects = Object.keys(currentCurriculum || {});
    subjects.forEach((s) => {
      subjectSelect.innerHTML += `<option value="${s}">${s}</option>`;
    });

    subjectSelect.disabled = false;
    log(`✅ Subjects loaded for Class ${classValue}.`);
  } catch (err) {
    log(`❌ Error loading curriculum: ${err.message}`);
  }
});

// ----------------------------
// 2️⃣ Subject selection
// ----------------------------
subjectSelect.addEventListener("change", () => {
  const subject = subjectSelect.value;
  const classValue = classSelect.value;
  if (!subject) return;

  const subjectData = currentCurriculum?.[subject];
  if (!subjectData) return;

  if (["11", "12"].includes(classValue)) {
    const books = Object.keys(subjectData);
    bookSelect.innerHTML = '<option value="">-- Select Book --</option>';
    books.forEach((b) => (bookSelect.innerHTML += `<option value="${b}">${b}</option>`));
    bookContainer.classList.remove("hidden");
  } else {
    const books = Object.keys(subjectData);
    const firstBook = books[0];
    fillChapterDropdown(subjectData[firstBook]);
  }
});

// ----------------------------
// 3️⃣ Book selection
// ----------------------------
bookSelect.addEventListener("change", () => {
  const subject = subjectSelect.value;
  const book = bookSelect.value;
  const subjectData = currentCurriculum?.[subject];
  if (!book || !subjectData) return;
  fillChapterDropdown(subjectData[book]);
});

// ----------------------------
// 4️⃣ Fill chapters
// ----------------------------
function fillChapterDropdown(chapters = []) {
  chapterSelect.innerHTML = '<option value="">-- Select Chapter --</option>';
  chapters.forEach((c) => {
    const title = c.chapter_title || "Untitled";
    chapterSelect.innerHTML += `<option value="${title}">${title}</option>`;
  });
  chapterSelect.disabled = false;
  generateBtn.disabled = false;
  refreshBtn.disabled = false;
}

// ----------------------------
// 5️⃣ Generate & Refresh
// ----------------------------
generateBtn.addEventListener("click", () => handleGenerateOrRefresh(false));
refreshBtn.addEventListener("click", () => handleGenerateOrRefresh(true));

async function handleGenerateOrRefresh(isRefresh = false) {
  const classValue = classSelect.value;
  const subject = subjectSelect.value;
  const book = bookSelect.value || "N/A";
  const chapter = chapterSelect.value;
  if (!classValue || !subject || !chapter) {
    log("⚠️ Please select all fields first.");
    return;
  }

  try {
    log(isRefresh ? "♻️ Refreshing existing table..." : "⚙️ Generating 60-question set...");

    // 🧠 Step 1: Get questions (60 total)
    if (!isRefresh) {
      const geminiRes = await fetch("https://ready4exam-master-automation.vercel.app/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ className: classValue, subject, book, chapter }),
      });
      const geminiData = await geminiRes.json();
      generatedQuestionsArray = geminiData.questions || [];
      log(`✅ Gemini generated ${generatedQuestionsArray.length} questions.`);
    }

    // 🧠 Step 2: Find existing table_id for Refresh
    let existingTableId = null;
    const subjectData = currentCurriculum?.[subject]?.[book] || [];
    const found = subjectData.find((c) => c.chapter_title === chapter);
    if (found?.table_id && found.table_id.includes("_quiz")) existingTableId = found.table_id;

    // 🧠 Step 3: Send to Supabase Manager
    const payload = {
      meta: {
        class_name: classValue,
        subject,
        book,
        chapter,
        refresh: isRefresh,
        table_name: existingTableId || null,
      },
      csv: generatedQuestionsArray,
    };

    const supaRes = await fetch("https://ready4exam-master-automation.vercel.app/api/manageSupabase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const supaData = await supaRes.json();
    if (!supaRes.ok) throw new Error(supaData.error || "Supabase failed");

    log(`✅ ${isRefresh ? "Refreshed" : "Generated"}: ${supaData.message}`);

    // 🧠 Step 4: Update Curriculum after Generate
    if (!isRefresh) {
      await fetch("https://ready4exam-master-automation.vercel.app/api/updateCurriculum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          className: classValue,
          subject,
          book,
          chapter,
          tableName: supaData.table,
        }),
      });
      log("📘 Curriculum updated with new table_id.");
    }
  } catch (err) {
    log(`❌ Error: ${err.message}`);
  }
}
