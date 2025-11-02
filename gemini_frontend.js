// ------------------- Gemini Frontend Automation -------------------
// Works with supabaseClient.js and Gemini 2.5 Flash
// Creates RLS-enabled tables, adds policies, and uploads generated quiz data

import { supabase } from './supabaseClient.js';

const GEMINI_API_KEY = "AIzaSyBX5TYNhyMR9S8AODdFkfsJW-vSbVZVI5Y"; // 🔑 Replace with your Gemini API key
const GEMINI_MODEL = "gemini-1.5-flash";

// ---------- DOM Elements ----------
const classSelect = document.getElementById('classSelect');
const subjectSelect = document.getElementById('subjectSelect');
const chapterSelect = document.getElementById('chapterSelect');
const generateBtn = document.getElementById('generateBtn');
const logEl = document.getElementById('log');

// ---------- Utility: Logging ----------
function log(message, type = "info") {
  const p = document.createElement("p");
  p.textContent = message;
  p.className = type;
  logEl.appendChild(p);
  logEl.scrollTop = logEl.scrollHeight;
}

// ---------- Gemini API Wrapper ----------
async function askGemini(prompt) {
  log("🧠 Asking Gemini 2.5 Flash...");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
  return text;
}

// ---------- Fetch Subjects ----------
async function fetchSubjects(selectedClass) {
  subjectSelect.innerHTML = `<option>Loading...</option>`;
  chapterSelect.innerHTML = `<option>Select Subject first</option>`;
  log(`🔍 Fetching NCERT subjects for Class ${selectedClass}...`);

  const prompt = `List all NCERT subjects for Class ${selectedClass} based on CBSE syllabus. Return only subject names, one per line.`;
  const text = await askGemini(prompt);

  const subjects = text.split("\n").filter(Boolean).map(s => s.trim());
  log(`✅ Found ${subjects.length} subjects.`);

  subjectSelect.innerHTML = `<option value="">Select Subject</option>`;
  subjects.forEach(sub => {
    const opt = document.createElement("option");
    opt.value = sub;
    opt.textContent = sub;
    subjectSelect.appendChild(opt);
  });
}

// ---------- Fetch Chapters ----------
async function fetchChapters(selectedClass, selectedSubject) {
  chapterSelect.innerHTML = `<option>Loading...</option>`;
  log(`📖 Fetching chapters for ${selectedSubject} (Class ${selectedClass})...`);

  const prompt = `List all chapters for Class ${selectedClass} ${selectedSubject} based on NCERT book (latest CBSE edition). Return only chapter names, one per line.`;
  const text = await askGemini(prompt);

  const chapters = text.split("\n").filter(Boolean).map(c => c.trim());
  log(`✅ Found ${chapters.length} chapters.`);

  chapterSelect.innerHTML = `<option value="">Select Chapter</option>`;
  chapters.forEach(ch => {
    const opt = document.createElement("option");
    opt.value = ch;
    opt.textContent = ch;
    chapterSelect.appendChild(opt);
  });
}

// ---------- Generate Quiz CSV ----------
async function generateQuizCSV(chapterTitle) {
  log(`📚 Generating quiz for: ${chapterTitle} ...`);

  const prompt = `
Generate exactly 60 unique quiz questions on the topic **"${chapterTitle}"**, strictly following the 9th standard NCERT/CBSE syllabus.

Format the output strictly as a **CSV file**, ensuring it exactly follows the database schema and distribution rules given below. The CSV must include the column headers exactly as shown and contain only the question data rows (no extra text, no markdown, no explanations).

---

**Distribution Rules (Total: 60 Questions):**
* **Simple:** 20 questions (10 MCQ, 5 AR, 5 Case-Based)
* **Medium:** 20 questions (10 MCQ, 5 AR, 5 Case-Based)
* **Advanced:** 20 questions (10 MCQ, 5 AR, 5 Case-Based)

---

**Schema (Columns and Rules):**

| Column Name | Data Type | Notes on Content |
| :--- | :--- | :--- |
| **difficulty** | text | Must be exactly 'Simple', 'Medium', or 'Advanced'. |
| **question_type** | text | Must be exactly 'MCQ', 'AR', or 'Case-Based'. |
| **question_text** | text | The main question text (or Assertion text for AR). |
| **scenario_reason_text** | text | For 'AR', holds the Reason text. For 'Case-Based', holds the question part related to the given scenario. For 'MCQ', leave empty or NULL. |
| **option_a** | text | Option A text (or standard AR choice A). |
| **option_b** | text | Option B text (or standard AR choice B). |
| **option_c** | text | Option C text (or standard AR choice C). |
| **option_d** | text | Option D text (or standard AR choice D). |
| **correct_answer_key** | text | The correct option key — one of 'A', 'B', 'C', or 'D'. |

---

**Formatting & Content Rules:**

1. **Assertion–Reason (AR) Questions:**
   - question_type must be 'AR'.
   - question_text must start with "Assertion (A):"
   - scenario_reason_text must start with "Reason (R):"
   - Use standard AR options:
     - A: Both A and R are true, and R is the correct explanation of A.
     - B: Both A and R are true, but R is not the correct explanation of A.
     - C: A is true, but R is false.
     - D: A is false, but R is true.

2. **Case-Based Questions:**
   - question_type must be 'Case-Based'.
   - question_text must start with "Scenario:"
   - scenario_reason_text must contain the related question.
   - Options must be contextually relevant.

3. **MCQ Questions:**
   - question_type must be 'MCQ'.
   - scenario_reason_text must be empty.
   - Each MCQ must test a key NCERT concept or fact.

4. **CSV Quoting Rule (for safety):**
   - Always wrap text fields in double quotes.
   - Escape internal quotes by doubling them, e.g. "Water is called ""universal solvent"""
   - Ensure commas inside text fields are properly enclosed in quotes.

---

**Final Output Requirement:**
Output only valid CSV text. The first line must be:

difficulty,question_type,question_text,scenario_reason_text,option_a,option_b,option_c,option_d,correct_answer_key
`;

  const csv = await askGemini(prompt);

  const cleanCSV = csv
    .replace(/^```csv\s*/i, "")
    .replace(/^```/i, "")
    .replace(/```$/i, "")
    .trim();

  if (!cleanCSV.startsWith("difficulty,")) {
    console.error("CSV preview:\n", cleanCSV.slice(0, 200));
    throw new Error("Invalid CSV format received from Gemini.");
  }

  log("✅ CSV generated successfully!");
  return cleanCSV;
}

// ---------- Upload to Supabase ----------
async function uploadQuizToSupabase(tableName, csvText) {
  log(`📤 Uploading quiz data to Supabase table: ${tableName}`);

  const rows = csvText.split("\n").slice(1).map(row => row.split(","));
  const inserts = rows.map(cols => ({
    difficulty: cols[0],
    question_type: cols[1],
    question_text: cols[2],
    scenario_reason_text: cols[3],
    option_a: cols[4],
    option_b: cols[5],
    option_c: cols[6],
    option_d: cols[7],
    correct_answer_key: cols[8]
  }));

  for (const row of inserts) {
    const { error } = await supabase.from(tableName).insert(row);
    if (error) console.error(error);
  }

  log("✅ All rows inserted successfully!");
}

// ---------- Update Curriculum via API ----------
async function updateCurriculum(chapterTitle, tableName) {
  try {
    await fetch("/api/updateCurriculum", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapterTitle, tableName })
    });
    log("✅ curriculum.js updated successfully!");
  } catch (err) {
    console.error("Curriculum update failed:", err);
  }
}

// ---------- Event Listeners ----------
classSelect.addEventListener("change", async () => {
  const selectedClass = classSelect.value;
  if (selectedClass) await fetchSubjects(selectedClass);
});

subjectSelect.addEventListener("change", async () => {
  const selectedClass = classSelect.value;
  const selectedSubject = subjectSelect.value;
  if (selectedSubject) await fetchChapters(selectedClass, selectedSubject);
});

generateBtn.addEventListener("click", async () => {
  const selectedClass = classSelect.value;
  const selectedSubject = subjectSelect.value;
  const selectedChapter = chapterSelect.value;

  if (!selectedClass || !selectedSubject || !selectedChapter) {
    log("⚠️ Please select Class, Subject, and Chapter first.", "error");
    return;
  }

  const tableName = selectedChapter.toLowerCase().replace(/\s+/g, "_") + "_quiz";

  try {
    log(`🚀 Starting quiz generation for ${selectedChapter}`);
    const csv = await generateQuizCSV(selectedChapter);
    await uploadQuizToSupabase(tableName, csv);
    await updateCurriculum(selectedChapter, tableName);
    log(`🎯 Quiz ready for ${selectedChapter}!`);
  } catch (err) {
    console.error(err);
    log("❌ Error: " + err.message, "error");
  }
});
