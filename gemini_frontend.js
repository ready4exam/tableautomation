// ------------------- Gemini Frontend Automation -------------------
// Works with supabaseClient.js and Gemini 2.5 Flash
// Creates RLS-enabled tables, adds policies, and uploads generated quiz data

import { supabase } from './supabaseClient.js';

const GEMINI_API_KEY = "AIzaSyBX5TYNhyMR9S8AODdFkfsJW-vSbVZVI5Y"; // 🔑 Replace with your Gemini API key

const classSelect = document.getElementById('classSelect');
const subjectSelect = document.getElementById('subjectSelect');
const chapterSelect = document.getElementById('chapterSelect');
const generateBtn = document.getElementById('generateBtn');
const logEl = document.getElementById('log');

// ------------- Logging -------------
const log = (msg) => {
  console.log(msg);
  if (logEl) {
    logEl.textContent += msg + "\n";
    logEl.scrollTop = logEl.scrollHeight;
  }
};

// ------------- Ask Gemini API -------------
async function askGemini(prompt) {
  log("🧠 Asking Gemini 2.5 Flash...");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    }
  );

  if (!res.ok) throw new Error(`Gemini request failed (${res.status})`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return text;
}

// ------------- Parse CSV -------------
function parseCSV(csv) {
  const lines = csv.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row = {};
    headers.forEach((h, i) => (row[h] = values[i]));
    return row;
  });
}

// ------------- Handle Class Selection -------------
classSelect.addEventListener('change', async () => {
  const selectedClass = classSelect.value;
  if (!selectedClass) return;
  subjectSelect.innerHTML = "";
  chapterSelect.innerHTML = "";
  generateBtn.disabled = true;

  log(`🔍 Fetching NCERT subjects for Class ${selectedClass}...`);
  const prompt = `List all NCERT subjects for Class ${selectedClass} in JSON array format. Example: ["Science","Mathematics","Social Science","English"]`;

  try {
    const text = await askGemini(prompt);
    const subjects = JSON.parse(text.replace(/```json|```/g, '').trim());
    subjectSelect.innerHTML = '<option value="">-- Select Subject --</option>';
    subjects.forEach((s) => {
      subjectSelect.innerHTML += `<option value="${s}">${s}</option>`;
    });
    subjectSelect.disabled = false;
    log(`✅ Found ${subjects.length} subjects.`);
  } catch (err) {
    log(`❌ Failed to fetch subjects: ${err.message}`);
  }
});

// ------------- Handle Subject Selection -------------
// ------------- Handle Subject Selection (Fixed JSON Parsing) -------------
subjectSelect.addEventListener('change', async () => {
  const selectedClass = classSelect.value;
  const subject = subjectSelect.value;
  if (!subject) return;
  chapterSelect.innerHTML = "";
  generateBtn.disabled = true;

  log(`📖 Fetching chapters for ${subject} (Class ${selectedClass})...`);
  const prompt = `List all NCERT chapters for Class ${selectedClass}, Subject ${subject} as a JSON array of chapter names only. Example: ["Chapter 1: ...", "Chapter 2: ..."]`;

  try {
    const text = await askGemini(prompt);
    let cleaned = text
      .replace(/```json|```/g, '')
      .replace(/^.*?\[/s, '[') // remove anything before first [
      .replace(/\].*$/s, ']') // remove anything after last ]
      .trim();

    const chapters = JSON.parse(cleaned);
    if (!Array.isArray(chapters) || chapters.length === 0) throw new Error("No chapters found");

    chapterSelect.innerHTML = '<option value="">-- Select Chapter --</option>';
    chapters.forEach((ch) => {
      chapterSelect.innerHTML += `<option value="${ch}">${ch}</option>`;
    });

    chapterSelect.disabled = false;
    log(`✅ Found ${chapters.length} chapters.`);
  } catch (err) {
    log(`❌ Failed to fetch chapters: ${err.message}`);
  }
});

// ------------- Handle Chapter Selection -------------
chapterSelect.addEventListener('change', () => {
  generateBtn.disabled = !chapterSelect.value;
});

// ------------- Handle Question Generation -------------
generateBtn.addEventListener('click', async () => {
  const selectedClass = classSelect.value;
  const subject = subjectSelect.value;
  const chapter = chapterSelect.value;
  if (!chapter) return alert("Please select a chapter first.");

// Generate safe table name from chapter
const tableName = (() => {
  let words = chapter
    .toLowerCase()
    .replace(/[:.,;'"!?()]/g, '') // remove punctuation like :
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 1) {
    return `${words[0]}_quiz`; // single word → add suffix
  }
  return `${words[0]}_${words[1]}`; // first two words
})();
  log(`🧾 Preparing table: ${tableName}`);

  const columns = [
    'difficulty', 'question_type', 'question_text',
    'scenario_reason_text', 'option_a', 'option_b', 'option_c',
    'option_d', 'correct_answer_key'
  ];

  // ✅ Corrected SQL syntax for Supabase function
  const sql = `
    CREATE TABLE IF NOT EXISTS public.${tableName} (
      id SERIAL PRIMARY KEY,
      ${columns.map(c => `${c} TEXT`).join(', ')},
      created_at TIMESTAMP DEFAULT NOW()
    );

    ALTER TABLE public.${tableName} ENABLE ROW LEVEL SECURITY;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = '${tableName}'
          AND policyname = 'Enable insert for authenticated users'
      ) THEN
        CREATE POLICY "Enable insert for authenticated users"
        ON public.${tableName}
        FOR INSERT
        TO anon, authenticated
        WITH CHECK (true);
      END IF;
    END $$;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = '${tableName}'
          AND policyname = 'Enable read access for all users'
      ) THEN
        CREATE POLICY "Enable read access for all users"
        ON public.${tableName}
        FOR SELECT
        TO public
        USING (true);
      END IF;
    END $$;
  `;

  try {
    const { error: createError } = await supabase.rpc('execute_sql', { query: sql });
    if (createError) throw new Error(createError.message);
    log(`✅ Table ${tableName} ready with RLS and policies.`);
  } catch (err) {
    log(`⚠️ Table or RLS setup failed: ${err.message}`);
    return;
  }

  log(`📚 Generating 60 questions for ${subject} → ${chapter}...`);
  const prompt = `
Generate exactly 60 unique quiz questions for Class ${selectedClass}, Subject ${subject}, Chapter ${chapter}.
Return ONLY a valid CSV with these headers:
difficulty,question_type,question_text,scenario_reason_text,option_a,option_b,option_c,option_d,correct_answer_key
Distribution:
- Simple: 20 (10 MCQ, 5 AR, 5 Case-Based)
- Medium: 20 (10 MCQ, 5 AR, 5 Case-Based)
- Advanced: 20 (10 MCQ, 5 AR, 5 Case-Based)
`;

  try {
    let csvText = await askGemini(prompt);
csvText = csvText.replace(/```csv|```/g, '').trim();
log("✅ CSV received. Parsing...");
const rows = parseCSV(csvText);
    log(`📤 Uploading ${rows.length} rows to Supabase...`);

    const { error: insertError } = await supabase.from(tableName).insert(rows);
    if (insertError) throw insertError;
    log(`🎉 Successfully inserted ${rows.length} questions into ${tableName}.`);
  } catch (err) {
    log(`❌ Error: ${err.message}`);
  }
});
