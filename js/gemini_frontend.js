// ----------------------------
// Ready4Exam Developer Tool
// Frontend Script (Phase-2 Automation)
// ----------------------------

// 🌍 Base static curriculum path (master automation repo)
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

// 🔹 Logging Utility
function log(...args) {
  const text = args.join(" ");
  console.log(text);
  logBox.value += text + "\n";
  logBox.scrollTop = logBox.scrollHeight;
}

// ----------------------------
// 1️⃣ Load Curriculum for Selected Class
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
    const curriculum = await res.json();

    const subjects = Object.keys(curriculum || {});
    if (!subjects.length) throw new Error("No subjects found");

    subjects.forEach(sub => {
      subjectSelect.innerHTML += `<option value="${sub}">${sub}</option>`;
    });

    subjectSelect.disabled = false;
    log(`✅ Subjects loaded for Class ${classValue}.`);
  } catch (err) {
    log(`❌ Error loading curriculum: ${err.message}`);
  }
});

// ----------------------------
// 2️⃣ When Subject Selected
// ----------------------------
subjectSelect.addEventListener("change", async () => {
  const classValue = classSelect.value;
  const subjectValue = subjectSelect.value;
  if (!subjectValue) return;

  try {
    const res = await fetch(`${baseStatic}/class${classValue}/curriculum.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const curriculum = await res.json();
    const subjectData = curriculum[subjectValue];

    if (!subjectData) {
      log(`❌ No data found for subject: ${subjectValue}`);
      return;
    }

    // ✅ For classes 11–12 (multiple books)
    if (["11", "12"].includes(classValue)) {
      const books = Object.keys(subjectData);
      bookSelect.innerHTML = '<option value="">-- Select Book --</option>';
      books.forEach(b => (bookSelect.innerHTML += `<option value="${b}">${b}</option>`));
      bookContainer.classList.remove("hidden");
      chapterSelect.disabled = true;
      generateBtn.disabled = true;
      refreshBtn.disabled = true;
      log(`📘 Books loaded for ${subjectValue}.`);

    // ✅ For classes 5–10
    } else {
      const books = Object.keys(subjectData);
      if (books.length === 1) {
        const firstBook = books[0];
        const chapters = subjectData[firstBook] || [];
        bookContainer.classList.add("hidden");
        fillChapterDropdown(chapters);
        log(`📗 Chapters loaded for ${subjectValue} (${firstBook}).`);
      } else {
        bookSelect.innerHTML = '<option value="">-- Select Book --</option>';
        books.forEach(b => (bookSelect.innerHTML += `<option value="${b}">${b}</option>`));
        bookContainer.classList.remove("hidden");
        chapterSelect.disabled = true;
        generateBtn.disabled = true;
        refreshBtn.disabled = true;
        log(`📘 Multiple books found for ${subjectValue}.`);
      }
    }
  } catch (err) {
    log(`❌ Error processing subject: ${err.message}`);
  }
});

// ----------------------------
// 3️⃣ When Book Selected
// ----------------------------
bookSelect.addEventListener("change", async () => {
  const classValue = classSelect.value;
  const subjectValue = subjectSelect.value;
  const bookValue = bookSelect.value;
  if (!bookValue) return;

  try {
    const res = await fetch(`${baseStatic}/class${classValue}/curriculum.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const curriculum = await res.json();
    const chapters = curriculum[subjectValue]?.[bookValue] || [];
    fillChapterDropdown(chapters);
    log(`📗 Chapters loaded for ${subjectValue} → ${bookValue}`);
  } catch (err) {
    log(`❌ Error loading chapters: ${err.message}`);
  }
});

// ----------------------------
// 4️⃣ Fill Chapter Dropdown
// ----------------------------
function fillChapterDropdown(chapters) {
  chapterSelect.innerHTML = '<option value="">-- Select Chapter --</option>';
  chapters.forEach(ch => {
    const title = ch.chapter_title || ch.title || "Untitled Chapter";
    chapterSelect.innerHTML += `<option value="${title}">${title}</option>`;
  });
  chapterSelect.disabled = false;
  generateBtn.disabled = false;
  refreshBtn.disabled = false;
}

// ----------------------------
// 5️⃣ Generate / Refresh Actions
// ----------------------------
generateBtn.addEventListener("click", async () => handleGenerateOrRefresh(false));
refreshBtn.addEventListener("click", async () => handleGenerateOrRefresh(true));

async function handleGenerateOrRefresh(isRefresh = false) {
  const classValue = classSelect.value;
  const subjectValue = subjectSelect.value;
  const bookValue = bookSelect.value || "N/A";
  const chapterValue = chapterSelect.value;

  if (!classValue || !subjectValue || !chapterValue) {
    log("⚠️ Please select all fields first.");
    return;
  }

  // ✅ Simulated question data to prevent ReferenceError
  const generatedQuestionsArray = [
    {
      difficulty: "medium",
      question_type: "mcq",
      question_text: `Sample question for ${chapterValue}`,
      scenario_reason_text: "",
      option_a: "Option A",
      option_b: "Option B",
      option_c: "Option C",
      option_d: "Option D",
      correct_answer_key: "A"
    }
  ];

  const payload = {
    meta: {
      className: classValue,
      subject: subjectValue,
      book: bookValue === "N/A" ? "" : bookValue,
      chapter: chapterValue,
      refresh: isRefresh
    },
    csv: generatedQuestionsArray
  };

  const apiURL = "https://ready4exam-master-automation.vercel.app/api/manageSupabase";

  try {
    log(isRefresh ? "🔄 Refreshing question set..." : "⚙️ Generating question set...");
    const res = await fetch(apiURL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    log(`✅ ${isRefresh ? "Refreshed" : "Generated"} successfully: ${data.message || ""}`);
  } catch (err) {
    log(`❌ Error: ${err.message}`);
  }
}
