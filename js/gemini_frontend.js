// ---------------- Developer Automation Frontend ----------------
// Aligned with Ready4Exam Phase-2 unified Supabase_11 backend
// Calls: /api/gemini, /api/manageSupabase, /api/updateCurriculum

const baseAPI = "https://ready4exam-master-automation.vercel.app/api";
const baseStatic = "https://ready4exam-master-automation.vercel.app/static_curriculum";

const classSelect = document.getElementById("classSelect");
const subjectSelect = document.getElementById("subjectSelect");
const bookSelect = document.getElementById("bookSelect");
const bookContainer = document.getElementById("bookContainer");
const chapterSelect = document.getElementById("chapterSelect");
const generateBtn = document.getElementById("generateBtn");
const refreshBtn = document.getElementById("refreshBtn");
const logEl = document.getElementById("log");

function log(msg) {
  console.log(msg);
  logEl.value += msg + "\n";
  logEl.scrollTop = logEl.scrollHeight;
}

// ---------------- Load Curriculum ----------------
classSelect.addEventListener("change", async () => {
  const classValue = classSelect.value;
  if (!classValue) return;

  subjectSelect.innerHTML = '<option value="">-- Select Subject --</option>';
  chapterSelect.innerHTML = '<option value="">-- Select Chapter --</option>';
  bookContainer.classList.add("hidden");
  bookSelect.innerHTML = '<option value="">-- Select Book --</option>';
  subjectSelect.disabled = true;
  chapterSelect.disabled = true;
  generateBtn.disabled = true;
  refreshBtn.disabled = true;
  log(`📚 Loading curriculum for Class ${classValue}...`);

  try {
    const res = await fetch(`${baseStatic}/class${classValue}/curriculum.json`);
    if (!res.ok) throw new Error(`Failed to fetch curriculum for class ${classValue}`);
    const curriculum = await res.json();

    subjectSelect.innerHTML = '<option value="">-- Select Subject --</option>';
    Object.keys(curriculum).forEach(sub => {
      subjectSelect.innerHTML += `<option value="${sub}">${sub}</option>`;
    });
    subjectSelect.disabled = false;
    log(`✅ Subjects loaded for Class ${classValue}.`);
  } catch (err) {
    log(`❌ Error loading curriculum: ${err.message}`);
  }
});

// ---------------- Subject → Book / Chapter ----------------
subjectSelect.addEventListener("change", async () => {
  const classValue = classSelect.value;
  const subjectValue = subjectSelect.value;
  if (!subjectValue) return;

  const res = await fetch(`${baseStatic}/class${classValue}/curriculum.json`);
  const curriculum = await res.json();

  if (["11", "12"].includes(classValue)) {
    // Classes 11-12 have book layers
    const books = Object.keys(curriculum[subjectValue] || {});
    bookSelect.innerHTML = '<option value="">-- Select Book --</option>';
    books.forEach(b => (bookSelect.innerHTML += `<option value="${b}">${b}</option>`));
    bookContainer.classList.remove("hidden");
    chapterSelect.disabled = true;
    generateBtn.disabled = true;
  } else {
    // Classes 5–10
    bookContainer.classList.add("hidden");
    const chapters = curriculum[subjectValue] || [];
    fillChapterDropdown(chapters);
  }
});

bookSelect.addEventListener("change", async () => {
  const classValue = classSelect.value;
  const subjectValue = subjectSelect.value;
  const bookValue = bookSelect.value;
  if (!bookValue) return;

  const res = await fetch(`${baseStatic}/class${classValue}/curriculum.json`);
  const curriculum = await res.json();

  const chapters = curriculum[subjectValue]?.[bookValue] || [];
  fillChapterDropdown(chapters);
});

function fillChapterDropdown(chapters) {
  chapterSelect.innerHTML = '<option value="">-- Select Chapter --</option>';
  chapters.forEach(ch => {
    chapterSelect.innerHTML += `<option value="${ch.chapter_title}">${ch.chapter_title}</option>`;
  });
  chapterSelect.disabled = false;
  generateBtn.disabled = false;
  refreshBtn.disabled = false;
}

// ---------------- API Helpers ----------------
async function callGemini(prompt) {
  const res = await fetch(`${baseAPI}/gemini`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  if (!text) throw new Error("Empty Gemini response");
  return text;
}

function parseCSV(csv) {
  const [header, ...lines] = csv.split("\n").filter(l => l.trim());
  const headers = header.split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  return lines.map(line => {
    const cols = line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(c => c.trim().replace(/^"|"$/g, ""));
    const obj = {};
    headers.forEach((h, i) => (obj[h] = cols[i] || ""));
    return obj;
  });
}

async function updateCurriculum(classValue, chapterTitle, tableName) {
  const body = { className: classValue, chapterTitle, newId: tableName };
  const res = await fetch(`${baseAPI}/updateCurriculum`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return await res.json();
}

// ---------------- Generate or Refresh ----------------
async function handleGeneration(isRefresh = false) {
  const classValue = classSelect.value;
  const subject = subjectSelect.value;
  const book = ["11", "12"].includes(classValue) ? bookSelect.value : "";
  const chapter = chapterSelect.value;
  if (!chapter) return alert("Please select a chapter.");

  const tableName = [
    `class${classValue}`,
    subject.toLowerCase().replace(/\s+/g, "_"),
    book ? book.toLowerCase().replace(/\s+/g, "_") : "",
    chapter.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
    "quiz",
  ]
    .filter(Boolean)
    .join("_");

  log(`🧠 Generating 60 questions for ${subject} → ${chapter}`);
  try {
    const prompt = `
Generate 60 unique quiz questions for Class ${classValue}, Subject ${subject}${
      book ? `, Book ${book}` : ""
    }, Chapter ${chapter}.
Return ONLY CSV with headers:
difficulty,question_type,question_text,scenario_reason_text,option_a,option_b,option_c,option_d,correct_answer_key
Distribution:
- Simple: 20 (10 MCQ, 5 AR, 5 Case)
- Medium: 20 (10 MCQ, 5 AR, 5 Case)
- Advanced: 20 (10 MCQ, 5 AR, 5 Case)
`;

    const csvText = await callGemini(prompt);
    const rows = parseCSV(csvText);
    log(`✅ Gemini returned ${rows.length} rows.`);

    const manageBody = {
      meta: { className: classValue, subject, book, chapter, refresh: isRefresh },
      csv: rows,
    };

    const res = await fetch(`${baseAPI}/manageSupabase`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(manageBody),
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Upload failed");
    log(`📤 ${rows.length} questions uploaded to Supabase table '${tableName}'.`);

    const updateRes = await updateCurriculum(classValue, chapter, tableName);
    if (updateRes.error) throw new Error(updateRes.error);
    log(`🪶 Curriculum updated. Commit: ${updateRes.commitSHA || "n/a"}`);
  } catch (err) {
    log(`❌ Error: ${err.message}`);
  }
}

generateBtn.addEventListener("click", () => handleGeneration(false));
refreshBtn.addEventListener("click", () => handleGeneration(true));
