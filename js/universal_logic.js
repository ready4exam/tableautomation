// ============================================================================
// universal_logic.js — FINAL PRODUCTION VERSION (FIXED)
// ============================================================================

const API_BASE = "https://ready4exam-master-automation.vercel.app";
const el = (id) => document.getElementById(id);

// Global state
let ACTIVE_CURRICULUM = null;

// ---------------------------------------------------------
// LOGGING
// ---------------------------------------------------------
function addLog(msg, type = "info") {
  const time = new Date().toLocaleTimeString();
  const icon =
    type === "error" ? "❌" :
    type === "success" ? "✅" : "🔹";
  el("log").value = `${icon} [${time}] ${msg}\n` + el("log").value;
}

// ---------------------------------------------------------
// 1. CONNECT & LOAD CURRICULUM (REPO-AGNOSTIC)
// ---------------------------------------------------------
el("connectBtn").onclick = async () => {
  const repoSlug = el("repoSlug").value.trim();
  if (!repoSlug) return alert("Please enter the full repo slug (username/repo).");

  addLog(`🔗 Connecting to: ${repoSlug}...`);

  const curriculumUrl =
    `https://raw.githubusercontent.com/${repoSlug}/main/js/curriculum.js?v=${Date.now()}`;

  try {
    const response = await fetch(curriculumUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}: curriculum.js not found`);

    const text = await response.text();

    // Robust cleanup for all curriculum export styles
    const cleanJS = text
      .replace(/export\s+const\s+curriculum\s*=\s*/, "")
      .replace(/export\s+default\s+curriculum\s*;?/g, "")
      .replace(/window\.curriculumData\s*=\s*/, "")
      .trim()
      .replace(/;$/, "");

    ACTIVE_CURRICULUM = new Function(`return ${cleanJS}`)();

    setupSyllabus(ACTIVE_CURRICULUM);
    el("selectionSection").classList.remove("opacity-50", "pointer-events-none");

    addLog(
      `🎊 SUCCESS: ${Object.keys(ACTIVE_CURRICULUM).length} subjects loaded`,
      "success"
    );
  } catch (err) {
    addLog(`FAILED: ${err.message}`, "error");
  }
};

// ---------------------------------------------------------
// 2. DROPDOWN LOGIC (FLAT + NESTED SYLLABUS)
// ---------------------------------------------------------
function setupSyllabus(data) {
  el("subjectSelect").innerHTML =
    `<option value="">-- Select Subject --</option>` +
    Object.keys(data)
      .sort()
      .map(s => `<option value="${s}">${s}</option>`)
      .join("");

  el("subjectSelect").onchange = () => {
    const subject = el("subjectSelect").value;
    if (!subject) return;

    const node = data[subject];

    el("chapterSelect").innerHTML = "";
    el("bookSelect").innerHTML = "";

    if (Array.isArray(node)) {
      // FLAT (CBSE)
      el("bookContainer").classList.add("hidden");
      updateChapterList(node);
      addLog(`📘 Subject "${subject}" detected as flat syllabus`);
    } else {
      // NESTED (Telangana / ICSE / State Boards)
      el("bookContainer").classList.remove("hidden");
      el("bookSelect").innerHTML =
        `<option value="">-- Select Book / Section --</option>` +
        Object.keys(node).map(b => `<option value="${b}">${b}</option>`).join("");
      addLog(`📖 Subject "${subject}" detected as nested syllabus`);
    }
  };

  el("bookSelect").onchange = () => {
    const subject = el("subjectSelect").value;
    const book = el("bookSelect").value;
    if (!subject || !book) return;

    updateChapterList(data[subject][book]);
  };
}

function updateChapterList(chapters) {
  el("chapterSelect").innerHTML =
    `<option value="">-- Select Chapter --</option>` +
    chapters.map(c =>
      `<option value="${c.chapter_title}">${c.chapter_title}</option>`
    ).join("");

  // Status table
  el("bulkStatusTbody").innerHTML = chapters.map(c => `
    <tr id="row-${slugify(c.chapter_title)}">
      <td class="border p-3 font-medium">${c.chapter_title}</td>
      <td class="border p-3 text-gray-400 font-mono">${slugify(c.chapter_title)}</td>
      <td class="border p-3 status-cell">
        <span class="text-orange-500 font-bold uppercase">Pending</span>
      </td>
    </tr>
  `).join("");
}

function slugify(t) {
  return t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// ---------------------------------------------------------
// 3. CORE EXECUTION (GEMINI → SUPABASE)
// ---------------------------------------------------------
async function runChapterProcess(meta, rowId = null) {
  const row = rowId ? el(rowId) : null;
  const statusCell = row ? row.querySelector(".status-cell") : null;

  const updateUI = (txt, color) => {
    if (statusCell)
      statusCell.innerHTML =
        `<span class="${color} font-bold uppercase">${txt}</span>`;
  };

  try {
    updateUI("Working...", "text-blue-600");
    addLog(`🚀 Starting: ${meta.chapter}`);

    // -----------------------------
    // STEP 1: GEMINI (FIXED HEADERS)
    // -----------------------------
    const gemRes = await fetch(`${API_BASE}/api/gemini`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meta })
    });

    const gemData = await gemRes.json();
    if (!gemRes.ok)
      throw new Error(gemData.error || "Gemini generation failed");

    addLog(
      `✨ Gemini generated ${gemData.questions.length} questions`,
      "success"
    );

    // --------------------------------
    // STEP 2: SUPABASE + GITHUB UPDATE
    // --------------------------------
    const supRes = await fetch(`${API_BASE}/api/manageSupabase`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meta, csv: gemData.questions })
    });

    const supData = await supRes.json();
    if (!supRes.ok)
      throw new Error(supData.error || "Supabase upload failed");

    addLog(`🏁 DONE: ${supData.table_name} live`, "success");
    updateUI("Success", "text-green-600");
  } catch (err) {
    addLog(`❌ ERROR [${meta.chapter}]: ${err.message}`, "error");
    updateUI("Failed", "text-red-600");
  }
}

// ---------------------------------------------------------
// SINGLE GENERATE
// ---------------------------------------------------------
el("generateBtn").onclick = async () => {
  const meta = {
    class_name: el("repoSlug").value.split("-").pop(),
    subject: el("subjectSelect").value,
    book: el("bookSelect").value || "",
    chapter: el("chapterSelect").value
  };

  if (!meta.chapter)
    return alert("Please select a chapter first");

  await runChapterProcess(meta, `row-${slugify(meta.chapter)}`);
};

// ---------------------------------------------------------
// BULK GENERATE
// ---------------------------------------------------------
el("bulkGenerateBtn").onclick = async () => {
  const subject = el("subjectSelect").value;
  const book = el("bookSelect").value;

  const chapters = book
    ? ACTIVE_CURRICULUM[subject][book]
    : ACTIVE_CURRICULUM[subject];

  if (!chapters || !confirm(`Start bulk for ${chapters.length} chapters?`))
    return;

  el("bulkProgressContainer").classList.remove("hidden");

  let done = 0;
  for (const ch of chapters) {
    const meta = {
      class_name: el("repoSlug").value.split("-").pop(),
      subject,
      book: book || "",
      chapter: ch.chapter_title
    };

    await runChapterProcess(meta, `row-${slugify(ch.chapter_title)}`);
    done++;

    el("bulkProgressBarInner").style.width =
      `${(done / chapters.length) * 100}%`;
    el("bulkProgressLabel").textContent =
      `${done} / ${chapters.length}`;
  }
};
