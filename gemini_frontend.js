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

// --- Gemini API helper ---
async function askGemini(prompt) {
  log("🧠 Asking Gemini 2.5 Flash...");
  const res = await fetch("/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });

  if (!res.ok) throw new Error(`Gemini request failed (${res.status})`);
  const data = await res.json();
  return data;
}

// --- Fetch subjects ---
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
    subjects.forEach((s) => {
      subjectSelect.innerHTML += `<option value="${s}">${s}</option>`;
    });
    subjectSelect.disabled = false;
    log(`✅ Found ${subjects.length} subjects.`);
  } catch (err) {
    log(`❌ Failed to fetch subjects: ${err.message}`);
  }
});

// --- Fetch chapters ---
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
    chapters.forEach((ch) => {
      chapterSelect.innerHTML += `<option value="${ch}">${ch}</option>`;
    });
    chapterSelect.disabled = false;
    log(`✅ Found ${chapters.length} chapters.`);
  } catch (err) {
    log(`❌ Failed to fetch chapters: ${err.message}`);
  }
});

// --- Generate quiz ---
generateBtn.addEventListener('click', async () => {
  const chapter = chapterSelect.value;
  const subject = subjectSelect.value;
  const selectedClass = classSelect.value;
  if (!chapter) return alert("Please select a chapter first.");

  const tableName = chapter.toLowerCase().replace(/\s+/g, '_');
  log(`🧾 Preparing table: ${tableName}`);

  // ✅ FIXED SQL (no syntax errors)
  const sql = `
DO $$
BEGIN
  -- Create table if not exists
  IF NOT EXISTS (
    SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = '${tableName}'
  ) THEN
    EXECUTE format('
      CREATE TABLE public.${tableName} (
        id SERIAL PRIMARY KEY,
        difficulty TEXT,
        question_type TEXT,
        question_text TEXT,
        scenario_reason_text TEXT,
        option_a TEXT,
        option_b TEXT,
        option_c TEXT,
        option_d TEXT,
        correct_answer_key TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    ');
  END IF;

  -- Enable RLS
  EXECUTE format('ALTER TABLE public.${tableName} ENABLE ROW LEVEL SECURITY;');

  -- Policy 1: insert for anon + authenticated
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = '${tableName}' AND policyname = 'Enable insert for authenticated users'
  ) THEN
    EXECUTE format('
      CREATE POLICY "Enable insert for authenticated users" ON public.${tableName}
      FOR INSERT TO anon, authenticated
      USING (true) WITH CHECK (true);
    ');
  END IF;

  -- Policy 2: select for public
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = '${tableName}' AND policyname = 'Enable read access for all users'
  ) THEN
    EXECUTE format('
      CREATE POLICY "Enable read access for all users" ON public.${tableName}
      FOR SELECT TO public USING (true);
    ');
  END IF;
END $$;
`;

  // Call Supabase RPC (execute_sql)
  const { error: createError } = await supabase.rpc('execute_sql', { query: sql });
  if (createError) {
    log(`⚠️ Table or RLS setup failed: ${createError.message}`);
    return;
  }
  log(`✅ Table ${tableName} ready with RLS and policies.`);

  // Generate 60 questions using Gemini
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
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
    const row = {};
    headers.forEach((h, i) => (row[h] = values[i]));
    return row;
  });
}
