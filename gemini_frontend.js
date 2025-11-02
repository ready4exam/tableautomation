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

// ------------------- Logging -------------------
const log = (msg) => {
  console.log(msg);
  if (logEl) {
    logEl.textContent += msg + "\n";
    logEl.scrollTop = logEl.scrollHeight;
  }
};

// ------------------- Ask Gemini API -------------------
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

// ------------------- CSV Parsing & Quoting -------------------
// Safe parser that handles commas and quotes in text fields.
function parseAndSanitizeCSV(csvText) {
  if (!csvText || typeof csvText !== "string") return [];

  // Clean up
  let txt = csvText.replace(/^\uFEFF/, '').replace(/```csv|```/g, '').trim();
  const lines = txt.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error("CSV contains no data");

  const headers = lines[0].split(',').map(h => h.trim());
  const expectedCols = headers.length;
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    let parts = lines[i].split(',');
    if (parts.length > expectedCols) {
      const first2 = parts.slice(0, 2);
      const last5 = parts.slice(-5);
      const middle = parts.slice(2, parts.length - 5).join(',').trim();

      const splitIdx = findSplitBetweenQuestionAndScenario(middle);
      let question_text = middle;
      let scenario_reason_text = '';
      if (splitIdx !== -1) {
        question_text = middle.slice(0, splitIdx).trim();
        scenario_reason_text = middle.slice(splitIdx + 1).trim();
      }
      parts = [...first2, question_text, scenario_reason_text, ...last5];
    }

    while (parts.length < expectedCols) parts.push('');

    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (parts[idx] || '').trim();
    });

    // Escape quotes and normalize
    ['question_text', 'scenario_reason_text', 'option_a', 'option_b', 'option_c', 'option_d'].forEach(k => {
      obj[k] = obj[k]?.replace(/\s+/g, ' ').trim().replace(/"/g, '""') || '';
    });

    obj['correct_answer_key'] = obj['correct_answer_key']?.trim().toUpperCase().slice(0, 1) || '';

    rows.push(obj);
  }

  return rows;
}

function findSplitBetweenQuestionAndScenario(s) {
  const commas = [];
  for (let i = 0; i < s.length; i++) if (s[i] === ',') commas.push(i);
  if (commas.length === 0) return -1;
  for (let j = commas.length - 1; j >= 0; j--) {
    const idx = commas[j];
    const right = s.slice(idx + 1).trim();
    if (right.length > 0 && right.length <= 300) return idx;
  }
  return commas[0];
}

// Optional helper for CSV export (quoted fields)
function exportCsvWithQuotes(rows) {
  if (!rows?.length) return '';
  const headers = [
    'difficulty','question_type','question_text','scenario_reason_text',
    'option_a','option_b','option_c','option_d','correct_answer_key'
  ];
  const lines = [headers.join(',')];
  for (const r of rows) {
    const quoted = headers.map(k => `"${(r[k] || '').replace(/"/g, '""')}"`);
    lines.push(quoted.join(','));
  }
  return lines.join('\n');
}

// ------------------- Handle Class Selection -------------------
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
    const clean = text.replace(/```json|```/g, '').replace(/\n/g, '').trim();
    const subjects = JSON.parse(clean.endsWith(']') ? clean : clean + ']');
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

// ------------------- Handle Subject Selection -------------------
subjectSelect.addEventListener('change', async () => {
  const selectedClass = classSelect.value;
  const subject = subjectSelect.value;
  if (!subject) return;
  chapterSelect.innerHTML = "";
  generateBtn.disabled = true;

  log(`📖 Fetching chapters for ${subject} (Class ${selectedClass})...`);
  const prompt = `List all NCERT chapters for Class ${selectedClass}, Subject ${subject} as a JSON array of chapter names only.`;

  try {
    const text = await askGemini(prompt);
    const clean = text.replace(/```json|```/g, '').replace(/\n/g, '').trim();
    const chapters = JSON.parse(clean.endsWith(']') ? clean : clean + ']');
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

// ------------------- Handle Chapter Selection -------------------
chapterSelect.addEventListener('change', () => {
  generateBtn.disabled = !chapterSelect.value;
});

// ------------------- Handle Question Generation -------------------
generateBtn.addEventListener('click', async () => {
  const selectedClass = classSelect.value;
  const subject = subjectSelect.value;
  const chapter = chapterSelect.value;
  if (!chapter) return alert("Please select a chapter first.");

  const tableName = (() => {
    let cleanChapter = chapter
      .toLowerCase()
      .replace(/[:;.,!?'"()]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const words = cleanChapter.split(' ').filter(Boolean);
    return words.length > 1 ? `${words[0]}_${words[1]}` : `${words[0]}_quiz`;
  })();

  log(`🧾 Preparing table: ${tableName}`);

  const columns = [
    'difficulty', 'question_type', 'question_text',
    'scenario_reason_text', 'option_a', 'option_b',
    'option_c', 'option_d', 'correct_answer_key'
  ];

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
    const csvText = await askGemini(prompt);
    log("✅ CSV received. Parsing...");
    const rows = parseAndSanitizeCSV(csvText);
    log(`📤 Uploading ${rows.length} rows to Supabase...`);

    const { error: insertError } = await supabase.from(tableName).insert(rows);
    if (insertError) throw insertError;
    log(`🎉 Successfully inserted ${rows.length} questions into ${tableName}.`);
  } catch (err) {
    log(`❌ Error: ${err.message}`);
  }
});
