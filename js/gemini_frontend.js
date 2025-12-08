// /api/manageSupabase.js
// ============================================================================
//  SINGLE / PER-CHAPTER UPLOAD API
//  - Creates/refreshes Supabase table for a chapter
//  - Inserts MCQ/AR/Case questions
//  - Updates usage_logs
//  - Updates js/curriculum.js in ready4exam-class-<class> repo with table_id
//  - Table name is UNIQUE per subject + chapter + class:
//      <subject>_<firstword>_<lastword>_<class>_quiz
// ============================================================================

import { createClient } from "@supabase/supabase-js";
import { getCorsHeaders } from "./cors.js";
import { transliterate as tr } from "transliteration";

export const config = { runtime: "nodejs" };

// =====================================================================
// Helpers: Normalizers
// =====================================================================
function normalizeDifficulty(d) {
  if (!d) return "Simple";
  d = d.toLowerCase().trim();
  if (["simple", "easy"].includes(d)) return "Simple";
  if (["medium", "moderate"].includes(d)) return "Medium";
  if (["advanced", "hard"].includes(d)) return "Advanced";
  return "Simple";
}

function normalizeQType(t) {
  if (!t) return "MCQ";
  t = t.toLowerCase().trim();
  if (["mcq", "multiple choice", "objective"].includes(t)) return "MCQ";
  if (["ar", "assertion", "assertion-reason"].includes(t)) return "AR";
  if (["case", "case-based", "case study"].includes(t)) return "Case-Based";
  return "MCQ";
}

const SKIP_WORDS = ["as","of","the","a","an","in","on","for","to","ki","ke","ka"];
const norm = s => (s ?? "").toString().trim().toLowerCase();

// =====================================================================
// Table Name Builder (SUBJECT + CHAPTER + CLASS)
//    => <subject>_<firstword>_<lastword>_<class>_quiz
// =====================================================================
function buildTableName(meta) {
  const grade = meta.class_name || "11";

  // ---- SUBJECT SLUG from curriculum.js subject key ----
  const rawSubject = meta.subject || "";
  let subjectSlug = tr(rawSubject)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // take only first word of subject: "Physics Part I" -> "physics"
  subjectSlug = (subjectSlug.split(" ")[0]) || "subject";

  // ---- CHAPTER SLUG (same transliteration logic as before) ----
  const chapterRaw = meta.chapter || "";

  let chapter = tr(chapterRaw)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const words = chapter.split(" ").filter(Boolean);
  const filtered = words.filter(w => !SKIP_WORDS.includes(w));

  const first = filtered[0] || words[0] || "ch";
  const last  = filtered[filtered.length - 1] || words[words.length - 1] || "x";

  // ---- FINAL TABLE NAME ----
  return `${subjectSlug}_${first}_${last}_${grade}_quiz`;
}

// =====================================================================
// GitHub helpers: fetch + update curriculum.js
// =====================================================================

async function fetchGithubFile({ owner, repo, path, token }) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json"
    }
  });

  if (!resp.ok) {
    console.error(`❌ GitHub GET failed for ${repo}/${path}:`, resp.status, await resp.text());
    return null;
  }

  const json = await resp.json();
  return json; // includes content (base64), sha, etc.
}

async function updateGithubFile({ owner, repo, path, token, content, sha, message }) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

  const body = {
    message,
    content: Buffer.from(content, "utf8").toString("base64"),
    sha,
    branch: "main"
  };

  const resp = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    console.error(`❌ GitHub PUT failed for ${repo}/${path}:`, resp.status, await resp.text());
    return null;
  }

  return await resp.json();
}

// Parse `export default { ... }` → JS object, then stringify back.
function parseCurriculumJsToObject(fileText) {
  try {
    let src = fileText.trim();

    // remove leading "export default"
    src = src.replace(/^export\s+default\s+/, "");

    // remove trailing ";" if present
    src = src.replace(/;?\s*$/, "");

    const wrapped = `(${src})`;

    // Eval in local context – this is safe-ish because content is trusted repo code
    // eslint-disable-next-line no-eval
    const obj = eval(wrapped);
    return obj;
  } catch (e) {
    console.error("❌ Failed to parse curriculum.js:", e);
    return null;
  }
}

function serializeCurriculumObjectToJs(obj) {
  // Keep it simple: JSON-ish style as JS export
  const body = JSON.stringify(obj, null, 2);
  return `export default ${body};\n`;
}

// Update table_id for matching chapter in curriculum object
// Structure cases:
//  - curriculum[subject] = [chapters...]
//  - curriculum[subject] = { bookA: [chapters...], bookB: [chapters...] }
function applyTableIdToCurriculum(curriculum, meta, tableName) {
  const subjectKey = meta.subject;
  const chapterTitle = meta.chapter;
  const bookName = meta.book || null;

  if (!subjectKey || !curriculum || !curriculum[subjectKey]) {
    console.warn("⚠ Subject not found in curriculum.js for:", subjectKey);
    return false;
  }

  const subjectNode = curriculum[subjectKey];
  let updated = false;

  const matchChapter = (chapterObj) => {
    if (!chapterObj || typeof chapterObj !== "object") return false;
    return norm(chapterObj.chapter_title) === norm(chapterTitle);
  };

  if (Array.isArray(subjectNode)) {
    // No books, direct chapter list
    for (const ch of subjectNode) {
      if (matchChapter(ch)) {
        ch.table_id = tableName;
        updated = true;
      }
    }
  } else if (subjectNode && typeof subjectNode === "object") {
    // With books
    const bookKeysToSearch = bookName ? [bookName] : Object.keys(subjectNode);

    for (const bk of bookKeysToSearch) {
      const arr = subjectNode[bk];
      if (!Array.isArray(arr)) continue;

      for (const ch of arr) {
        if (matchChapter(ch)) {
          ch.table_id = tableName;
          updated = true;
        }
      }
    }
  }

  if (!updated) {
    console.warn(
      "⚠ No matching chapter found to update table_id:",
      { subjectKey, bookName, chapterTitle }
    );
  }

  return updated;
}

// High-level: update js/curriculum.js in ready4exam-class-<class>
async function updateCurriculumForChapter(meta, tableName) {
  const owner = process.env.GIT_OWNER;
  const token = process.env.GIT_TOKEN;
  const className = meta.class_name || "11";

  if (!owner || !token) {
    console.warn("⚠ GIT_OWNER or GIT_TOKEN missing in env; skipping curriculum.js update.");
    return;
  }

  const repo = `ready4exam-class-${className}`;
  const path = "js/curriculum.js";

  const file = await fetchGithubFile({ owner, repo, path, token });
  if (!file || !file.content || !file.sha) {
    console.warn("⚠ Unable to fetch curriculum.js from GitHub; skipping update.");
    return;
  }

  const originalText = Buffer.from(file.content, "base64").toString("utf8");
  const curriculumObj = parseCurriculumJsToObject(originalText);
  if (!curriculumObj) return;

  const changed = applyTableIdToCurriculum(curriculumObj, meta, tableName);
  if (!changed) {
    // No match → no commit to avoid noise
    return;
  }

  const newText = serializeCurriculumObjectToJs(curriculumObj);

  await updateGithubFile({
    owner,
    repo,
    path,
    token,
    content: newText,
    sha: file.sha,
    message: `chore: update table_id for "${meta.chapter}" -> ${tableName}`
  });
}

// =====================================================================
// MAIN HANDLER
// =====================================================================
export default async function handler(req, res) {
  // ---------------- CORS ----------------
  const origin = req.headers.origin || "*";
  Object.entries(getCorsHeaders(origin)).forEach(([k, v]) => res.setHeader(k, v));
  // Force GitHub Pages origin allowed
  res.setHeader("Access-Control-Allow-Origin", "https://ready4exam.github.io");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Only POST allowed" });
  }

  try {
    // ---------------- Parse Body ----------------
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { meta, csv } = body || {};

    // 🔹 CHANGED: stronger validation so failed LLM never creates tables/logs
    if (!meta || !Array.isArray(csv) || csv.length === 0) {
      console.error("❌ manageSupabase: empty or invalid CSV received", {
        hasMeta: !!meta,
        csvType: Array.isArray(csv) ? "array" : typeof csv,
        csvLength: Array.isArray(csv) ? csv.length : null
      });
      return res.status(400).json({
        ok: false,
        error: "EMPTY_CSV_NO_QUESTIONS"
      });
    }

    // ---------------- Init Supabase ----------------
    const supabaseUrl =
      process.env.SUPABASE_URL_11 || process.env.SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_KEY_11 || process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ ok: false, error: "Supabase config missing" });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // ---------------- Build Table Name ----------------
    const table = buildTableName(meta);

    // ---------------- Ensure Table Exists ----------------
    const exists = await supabase.rpc("ensure_table_exists", { table_name: table });
    if (exists.error) throw exists.error;

    // ---------------- RLS + Policies ----------------
    await supabase.rpc("exec_sql", {
      sql: `
        ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;

        DO $do$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies WHERE policyname = '${table}_select_policy'
          ) THEN
            EXECUTE 'CREATE POLICY ${table}_select_policy ON public.${table}
                     FOR SELECT TO anon, authenticated USING (true);';
          END IF;
        END $do$;

        GRANT USAGE ON SCHEMA public TO anon, authenticated;
        GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon, authenticated;
      `
    });

    // ---------------- Clear Existing Rows ----------------
    await supabase.from(table).delete().neq("id", 0);

    // ---------------- Insert Rows ----------------
    const rows = csv.map(r => ({
      difficulty:          normalizeDifficulty(r.difficulty),
      question_type:       normalizeQType(r.question_type),
      question_text:       (r.question_text || "").trim(),
      scenario_reason_text:(r.scenario_reason_text || "").trim(),
      option_a:            (r.option_a || "").trim(),
      option_b:            (r.option_b || "").trim(),
      option_c:            (r.option_c || "").trim(),
      option_d:            (r.option_d || "").trim(),
      correct_answer_key:  (r.correct_answer_key || "").trim().toUpperCase()
    }));

    const inserted = await supabase.from(table).insert(rows);
    if (inserted.error) throw inserted.error;

    // ---------------- Update usage_logs ----------------
    const lookup = await supabase
      .from("usage_logs")
      .select("refresh_count")
      .eq("table_name", table)
      .maybeSingle();

    if (lookup?.data) {
      await supabase
        .from("usage_logs")
        .update({
          refresh_count: (lookup.data.refresh_count || 0) + 1,
          inserted_count: rows.length,
          updated_at: new Date(),
          class_name: meta.class_name,
          subject: meta.subject,
          book: meta.book,
          chapter: meta.chapter
        })
        .eq("table_name", table);
    } else {
      await supabase
        .from("usage_logs")
        .insert({
          table_name: table,
          class_name: meta.class_name,
          subject: meta.subject,
          book: meta.book,
          chapter: meta.chapter,
          inserted_count: rows.length,
          refresh_count: 0,
          created_at: new Date(),
          updated_at: new Date()
        });
    }

    // ---------------- Update curriculum.js in GitHub ----------------
    // Overwrites table_id even if already present
    await updateCurriculumForChapter(meta, table);

    // ---------------- Response ----------------
    return res.status(200).json({
      ok: true,
      message: "Table updated, usage_logs updated, curriculum.js updated",
      table_name: table,
      inserted: rows.length
    });

  } catch (err) {
    console.error("❌ manageSupabase ERROR:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
