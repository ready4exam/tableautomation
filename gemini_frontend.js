// ------------------- Gemini Frontend Automation -------------------
// Works with Supabase + Gemini 2.5 Flash + Vercel backend APIs
// Creates RLS-enabled tables, uploads generated quiz data,
// and updates curriculum.js reference IDs automatically.

// 🔹 No import from "./supabaseClient.js" since automation now uses backend /api/manageSupabase
// (that keeps your keys safe server-side)

const GEMINI_MODEL = "gemini-2.5-flash";
const logEl = document.getElementById("log");
const classSelect = document.getElementById("classSelect");
const subjectSelect = document.getElementById("subjectSelect");
const chapterSelect = document.getElementById("chapterSelect");
const generateBtn = document.getElementById("generateBtn");

// ---------- Logger ----------
const log = (msg) => {
  console.log(msg);
  if (logEl) {
    logEl.textContent += msg + "\n";
    logEl.scrollTop = logEl.scrollHeight;
  }
};

// ---------- Ask Gemini via Server Proxy ----------
async function askGemini(prompt) {
  try {
    const proxyResp = await fetch(, "https://ready4exam-master-automation.vercel.app/api/gemini",{
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    if (proxyResp.ok) {
      const proxyJson = await proxyResp.json();
      const outputText =
        proxyJson?.candidates?.[0]?.content?.parts?.[0]?.text ||
        proxyJson?.output?.[0]?.content?.parts?.[0]?.text ||
        JSON.stringify(proxyJson);
      if (outputText && outputText.trim()) return outputText.trim();
    }
    console.warn(`⚠️ Proxy responded ${proxyResp.status}, fallback to direct Gemini.`);
  } catch (err) {
    console.warn("⚠️ Proxy failed:", err.message);
  }

  // ⚙️ Fallback direct call (only if proxy fails)
  //const GEMINI_API_KEY = "YOUR_GEMINI_API_KEY";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const body = { contents: [{ role: "user", parts: [{ text: prompt }] }] };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
}

// ---------- Extract JSON/Array ----------
function extractArrayFromText(text) {
  if (!text || typeof text !== "string") return [];
  try {
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (match) {
      const jsonText = match[0]
        .replace(/```(?:json)?/gi, "")
        .replace(/```/g, "")
        .trim();
      const parsed = JSON.parse(jsonText);
      if (Array.isArray(parsed)) return parsed;
      if (parsed.subjects) return parsed.subjects;
      if (parsed.chapters) return parsed.chapters;
    }
  } catch (e) {
    console.warn("⚠️ JSON parse failed:", e.message);
  }
  const quoted = Array.from(text.matchAll(/"([^"]+)"/g)).map((m) => m[1]);
  if (quoted.length) return quoted;
  return text.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
}

// ---------- CSV Parser ----------
function parseCSV(csvText) {
  if (!csvText || typeof csvText !== "string") return [];
  csvText = csvText.replace(/```csv/gi, "").replace(/```/g, "").trim();
  const lines = csvText.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error("CSV data incomplete");
  const headers = lines[0]
    .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase());
  const rows = lines.slice(1).map((line) => {
    const cols = line
      .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
      .map((v) => v.trim().replace(/^"|"$/g, ""));
    const obj = {};
    headers.forEach((h, i) => (obj[h] = cols[i] || ""));
    return obj;
  });
  return rows;
}

// ---------- Handle Class Selection ----------
classSelect.addEventListener("change", async () => {
  const selectedClass = classSelect.value;
  if (!selectedClass) return;
  subjectSelect.innerHTML = "";
  chapterSelect.innerHTML = "";
  generateBtn.disabled = true;

  log(`🔍 Fetching NCERT subjects for Class ${selectedClass}...`);
  const prompt = `List all NCERT subjects for Class ${selectedClass} in JSON array format like ["Science","Math","English"].`;

  try {
    const text = await askGemini(prompt);
    const subjects = extractArrayFromText(text);
    subjectSelect.innerHTML = '<option value="">-- Select Subject --</option>';
    subjects.forEach((s) => (subjectSelect.innerHTML += `<option>${s}</option>`));
    subjectSelect.disabled = false;
    log(`✅ Found ${subjects.length} subjects.`);
  } catch (err) {
    log(`❌ Failed: ${err.message}`);
  }
});

// ---------- Handle Subject Selection ----------
subjectSelect.addEventListener("change", async () => {
  const selectedClass = classSelect.value;
  const subject = subjectSelect.value;
  if (!subject) return;
  chapterSelect.innerHTML = "";
  generateBtn.disabled = true;

  log(`📖 Fetching chapters for ${subject} (Class ${selectedClass})...`);
  const prompt = `Return a JSON array of official NCERT chapters for Class ${selectedClass}, Subject ${subject}.`;

  try {
    const text = await askGemini(prompt);
    const chapters = extractArrayFromText(text);
    chapterSelect.innerHTML = '<option value="">-- Select Chapter --</option>';
    chapters.forEach((c) => (chapterSelect.innerHTML += `<option>${c}</option>`));
    chapterSelect.disabled = false;
    log(`✅ Found ${chapters.length} chapters.`);
  } catch (err) {
    log(`❌ Failed: ${err.message}`);
  }
});

// ---------- Generate Quiz ----------
generateBtn.addEventListener("click", async () => {
  const selectedClass = classSelect.value;
  const subject = subjectSelect.value;
  const chapter = chapterSelect.value;
  if (!chapter) return alert("Please select a chapter.");

  // 👇 Intelligent table name creation
  const tableName = chapter
    .toLowerCase()
    .replace(/chapter\s*\d+[:\-]?\s*/i, "")
    .replace(/[^\w]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .split("_")
    .slice(0, 2)
    .join("_")
    .concat("_quiz");

  log(`🧾 Preparing table: ${tableName}`);

  try {
    log(`📚 Generating 60 questions for ${subject} → ${chapter}...`);
    const prompt = `
Generate exactly 60 unique quiz questions for Class ${selectedClass}, Subject ${subject}, Chapter ${chapter}.
Return ONLY a valid CSV (no markdown) with headers:
difficulty,question_type,question_text,scenario_reason_text,option_a,option_b,option_c,option_d,correct_answer_key
`;

    const csvText = await askGemini(prompt);
    const rows = parseCSV(csvText);
    log(`📤 Sending ${rows.length} rows to server (class=${selectedClass})...`);

    // ✅ Always call secure backend API
    const resp = await fetch("/api/manageSupabase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ class: selectedClass, tableName, rows }),
    });

    const result = await resp.json();
    if (!resp.ok) throw new Error(result.error || result.message);
    log(`🎉 ${result.message || "Questions uploaded successfully."}`);

    await updateCurriculum(selectedClass, chapter, tableName);
  } catch (err) {
    log(`❌ Error: ${err.message}`);
  }
});

// ---------- Update curriculum.js ----------
async function updateCurriculum(className, chapterTitle, newId) {
  try {
    log(`🪶 Updating curriculum.js for Class ${className} → ${chapterTitle}`);
    const res = await fetch("/api/updateCurriculum", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ className, chapterTitle, newId }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || "Commit failed");
    log(`✅ curriculum.js updated successfully.`);
  } catch (err) {
    log(`❌ curriculum commit failed: ${err.message}`);
  }
}
