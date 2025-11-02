// ------------------- Gemini Frontend Automation -------------------
// Works with supabaseClient.js and Gemini 2.5 Flash
// Creates RLS-enabled tables, adds policies, and uploads generated quiz data

import { supabase } from './supabaseClient.js';

const GEMINI_API_KEY = "AIzaSyBX5TYNhyMR9S8AODdFkfsJW-vSbVZVI5Y"; // your Gemini API key

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

// ------------- CSV parser (no external libs) -------------
// This is the reverted plain-JS parser with the requested special rule
function parseCSV(rawCsv) {
  if (!rawCsv || typeof rawCsv !== 'string') return [];

  // remove BOM and code fences
  let csv = rawCsv.replace(/^\uFEFF/, '').replace(/```csv|```/g, '').trim();
  const lines = csv.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  const expectedCols = headers.length; // should be 9

  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    let line = lines[i];

    // Fast path: if there are exactly expectedCols commas -> simple split
    const bruteParts = line.split(',');
    if (bruteParts.length === expectedCols) {
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = (bruteParts[idx] || '').trim();
      });
      // normalize and escape quotes in text columns
      sanitizeRowFields(obj);
      rows.push(obj);
      continue;
    }

    // When columns count mismatch, attempt intelligent rebuild.
    // Extract first two fields (difficulty, question_type) and last 5 fields (options A-D + key)
    const parts = line.split(',');
    if (parts.length < 3) {
      // too short — fallback to simple mapping with padding
      const padded = parts.concat(Array(Math.max(0, expectedCols - parts.length)).fill(''));
      const obj = {};
      headers.forEach((h, idx) => obj[h] = (padded[idx] || '').trim());
      sanitizeRowFields(obj);
      rows.push(obj);
      continue;
    }

    // get first two columns
    const first2 = parts.slice(0, 2).map(p => p.trim());
    // get last five columns (options + key) if available; else pad
    const last5 = parts.length >= 7 ? parts.slice(-5).map(p => p.trim()) : Array(5).fill('');

    // middle content (everything between second comma and start of last5)
    const middleParts = parts.slice(2, parts.length - 5);
    const middle = middleParts.join(',').trim();

    const questionType = first2[1] ? first2[1].trim() : '';

    // Apply your special quoting rule only for AR and Case-Based
    if (/^(AR|Case-Based)$/i.test(questionType)) {
      // Start a quoted block at the beginning of middle
      // Then whenever punctuation (. ? : ; !) is followed by a comma, close the quote at punctuation
      // and open a new quote after the comma.
      // Implement this by transforming the middle string and then splitting at the first quoted-comma boundary.

      // Build quoted version
      let mq = '"' + middle + '"';

      // Replace punctuation followed by comma: e.g. "word., next" -> "word.""," next" logic
      // We want: punctuation + quote + comma + quote
      // Use regex to find punctuation (.,?:;!) followed by comma (possibly spaces)
      mq = mq.replace(/([.?:;!])\s*,\s*/g, (m, punc) => {
        // we want to close quote at punctuation, keep comma, then open new quote
        return `${punc}" , "`; // note spaces preserved for readability
      });

      // Now mq looks like: " ...sentence." , " remainder ... "
      // Find the first occurrence of closing-quote + comma pattern: `"\s*,\s*"`
      const splitMatch = mq.match(/"\s*,\s*"/);
      let question_text = '';
      let scenario_text = '';

      if (splitMatch) {
        const idx = mq.search(/"\s*,\s*"/);
        // substring from initial opening quote (index 0) +1 to idx => question_text (without quotes)
        question_text = mq.slice(1, idx).trim();
        // remainder starts after the matched sequence length
        const afterIdx = idx + splitMatch[0].length;
        // remove final trailing quote if present
        scenario_text = mq.slice(afterIdx, mq.length - 1).trim();
      } else {
        // if no punctuation+comma pattern found, try to split the middle into two parts
        // by looking for the last comma that yields a reasonable right-side length (<=300)
        let splitAt = -1;
        const allCommas = [];
        for (let j = 0; j < middle.length; j++) if (middle[j] === ',') allCommas.push(j);
        for (let k = allCommas.length - 1; k >= 0; k--) {
          const pos = allCommas[k];
          const right = middle.slice(pos + 1).trim();
          if (right.length > 0 && right.length <= 300) {
            splitAt = pos;
            break;
          }
        }
        if (splitAt !== -1) {
          question_text = middle.slice(0, splitAt).trim();
          scenario_text = middle.slice(splitAt + 1).trim();
        } else {
          // fallback: everything into question_text
          question_text = middle;
          scenario_text = '';
        }
      }

      // Build parts back
      const rebuilt = [
        first2[0] || '',
        first2[1] || '',
        question_text,
        scenario_text,
        last5[0] || '',
        last5[1] || '',
        last5[2] || '',
        last5[3] || '',
        last5[4] || ''
      ];

      // Map to object per headers
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = (rebuilt[idx] || '').trim();
      });
      sanitizeRowFields(obj);
      rows.push(obj);
      continue;
    }

    // Non AR/Case-Based: best-effort split — take first2 + middle joined until last5
    const middleText = middleParts.join(',').trim();
    const rebuilt = [
      first2[0] || '',
      first2[1] || '',
      middleText, // question_text (may include scenario wrongly but for non-AR it's ok)
      '', // scenario_reason_text left empty for typical MCQ
      last5[0] || '',
      last5[1] || '',
      last5[2] || '',
      last5[3] || '',
      last5[4] || ''
    ];
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (rebuilt[idx] || '').trim();
    });
    sanitizeRowFields(obj);
    rows.push(obj);
  }

  return rows;
}

// sanitize text columns: normalize whitespace and escape internal double quotes by doubling them
function sanitizeRowFields(obj) {
  ['question_text', 'scenario_reason_text', 'option_a', 'option_b', 'option_c', 'option_d'].forEach((k) => {
    if (obj[k] === undefined || obj[k] === null) obj[k] = '';
    // normalize spaces
    obj[k] = String(obj[k]).replace(/\s+/g, ' ').trim();
    // escape internal quotes
    obj[k] = obj[k].replace(/"/g, '""');
  });

  if (obj['difficulty']) obj['difficulty'] = obj['difficulty'].trim();
  if (obj['question_type']) obj['question_type'] = obj['question_type'].trim();
  if (obj['correct_answer_key']) obj['correct_answer_key'] = String(obj['correct_answer_key']).trim().toUpperCase().slice(0,1);
  else obj['correct_answer_key'] = '';
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

// ------------- Handle Subject Selection -------------
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

  // tableName rule unchanged
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
    'scenario_reason_text', 'option_a', 'option_b', 'option_c',
    'option_d', 'correct_answer_key'
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
    let csvText = await askGemini(prompt);
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
