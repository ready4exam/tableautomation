// File: gemini_frontend.js
import { supabase } from './supabaseClient.js';

const classSelect = document.getElementById('classSelect');
const subjectSelect = document.getElementById('subjectSelect');
const chapterSelect = document.getElementById('chapterSelect');
const generateBtn = document.getElementById('generateBtn');
const logEl = document.getElementById('log');

const log = (msg) => {
  console.log(msg);
  logEl.textContent += msg + "\n";
  logEl.scrollTop = logEl.scrollHeight;
};

async function askGemini(prompt) {
  log("🤖 Asking Gemini 2.5 Flash...");
  const res = await fetch("https://tableautomation.vercel.app/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt })
  });
  if (!res.ok) throw new Error(`Gemini request failed (${res.status})`);
  return res.json();
}

classSelect.addEventListener('change', async () => {
  const selectedClass = classSelect.value;
  if (!selectedClass) return;
  subjectSelect.innerHTML = "";
  chapterSelect.innerHTML = "";
  generateBtn.disabled = true;

  log(`🔍 Fetching NCERT subjects for Class ${selectedClass}...`);
  const prompt = `List all NCERT subjects for Class ${selectedClass} in JSON array format. Example: ["Science","Mathematics","Social Science","English"]`;

  try {
    const data = await askGemini(prompt);
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    const subjects = JSON.parse(text.replace(/```json|```/g, '').trim());
    subjectSelect.innerHTML = '<option value="">-- Select Subject --</option>';
    subjects.forEach(s => subjectSelect.innerHTML += `<option value="${s}">${s}</option>`);
    subjectSelect.disabled = false;
    log(`✅ Found ${subjects.length} subjects.`);
  } catch (err) {
    log(`❌ Failed to fetch subjects: ${err.message}`);
  }
});

subjectSelect.addEventListener('change', async () => {
  const selectedClass = classSelect.value;
  const subject = subjectSelect.value;
  if (!subject) return;
  chapterSelect.innerHTML = "";
  generateBtn.disabled = true;

  log(`📖 Fetching chapters for ${subject} (Class ${selectedClass})...`);
  const prompt = `List all NCERT chapters for Class ${selectedClass}, Subject ${subject} as a JSON array of chapter names only.`;

  try {
    const data = await askGemini(prompt);
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    const chapters = JSON.parse(text.replace(/```json|```/g, '').trim());
    chapterSelect.innerHTML = '<option value="">-- Select Chapter --</option>';
    chapters.forEach(ch => chapterSelect.innerHTML += `<option value="${ch}">${ch}</option>`);
    chapterSelect.disabled = false;
    log(`✅ Found ${chapters.length} chapters.`);
  } catch (err) {
    log(`❌ Failed to fetch chapters: ${err.message}`);
  }
});

generateBtn.addEventListener('click', async () => {
  const chapter = chapterSelect.value;
  const subject = subjectSelect.value;
  const selectedClass = classSelect.value;
  if (!chapter) return alert("Please select a chapter first.");

  const tableName = chapter.toLowerCase().replace(/\s+/g, '_');
  log(`🧾 Checking or creating table: ${tableName}`);

  const columns = [
    'difficulty', 'question_type', 'question_text',
    'scenario_reason_text', 'option_a', 'option_b', 'option_c',
    'option_d', 'correct_answer_key'
  ];

  const sql = `
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id SERIAL PRIMARY KEY,
      ${columns.map(c => `${c} TEXT`).join(', ')},
      created_at TIMESTAMP DEFAULT NOW()
    );

    ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;

    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = '${tableName}' AND policyname = 'Enable insert for authenticated users') THEN
        CREATE POLICY "Enable insert for authenticated users" ON ${tableName}
        FOR INSERT
        TO anon, authenticated
        USING (true)
        WITH CHECK (true);
      END IF;
    END$$;

    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = '${tableName}' AND policyname = 'Enable read access for all users') THEN
        CREATE POLICY "Enable read access for all users" ON ${tableName}
        FOR SELECT
        TO public
        USING (true);
      END IF;
    END$$;
  `;

  const { error: createError } = await supabase.rpc('execute_sql', { query: sql });
  if (createError) {
    log(`⚠️ Table creation failed: ${createError.message}`);
    return;
  }

  log(`✅ Table ${tableName} ready.`);

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
    const data = await askGemini(prompt);
    const csv = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    log("✅ CSV received. Parsing...");
    const rows = parseCSV(csv);
    log(`📤 Uploading ${rows.length} rows to Supabase...`);

    const { error: insertError } = await supabase.from(tableName).insert(rows);
    if (insertError) throw insertError;
    log(`🎉 Successfully inserted ${rows.length} questions into ${tableName}.`);
  } catch (err) {
    log(`❌ Error: ${err.message}`);
  }
});

chapterSelect.addEventListener('change', () => {
  generateBtn.disabled = !chapterSelect.value;
});

function parseCSV(csv) {
  const lines = csv.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row = {};
    headers.forEach((h, i) => (row[h] = values[i]));
    return row;
  });
}
