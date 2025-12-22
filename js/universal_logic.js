const API_BASE = "https://ready4exam-master-automation.vercel.app";
const el = (id) => document.getElementById(id);
let ACTIVE_CURRICULUM = null;

function addLog(msg, type = "info") {
  const time = new Date().toLocaleTimeString();
  const icon = type === "error" ? "❌" : type === "success" ? "✅" : "🔹";
  el("log").value = `${icon} [${time}] ${msg}\n` + el("log").value;
}

el("connectBtn").onclick = async () => {
  const repoSlug = el("repoSlug").value.trim();
  if (!repoSlug) return alert("Enter repo slug");

  addLog(`🔗 Connecting: ${repoSlug}...`);
  const url = `https://raw.githubusercontent.com/${repoSlug}/main/js/curriculum.js?v=${Date.now()}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Repo not found");
    
    const text = await res.text();
    const cleanJS = text.replace(/export\s+const\s+curriculum\s*=\s*/, "")
                        .replace(/export\s+default\s+curriculum\s*;?/g, "")
                        .replace(/window\.curriculumData\s*=\s*/, "")
                        .trim().replace(/;$/, "");

    ACTIVE_CURRICULUM = new Function(`return ${cleanJS}`)();
    setupSyllabus(ACTIVE_CURRICULUM);
    el("selectionSection").classList.remove("opacity-50", "pointer-events-none");
    addLog(`✅ Loaded ${Object.keys(ACTIVE_CURRICULUM).length} subjects`, "success");
  } catch (err) {
    addLog(`Error: ${err.message}`, "error");
  }
};

function setupSyllabus(data) {
  el("subjectSelect").innerHTML = '<option value="">-- Select Subject --</option>' + 
    Object.keys(data).sort().map(s => `<option value="${s}">${s}</option>`).join("");

  el("subjectSelect").onchange = () => {
    const sub = el("subjectSelect").value;
    if (!sub) return;
    const node = data[sub];
    
    el("chapterSelect").innerHTML = "";
    el("bookSelect").innerHTML = "";

    if (Array.isArray(node)) {
      el("bookContainer").classList.add("hidden");
      updateChapterList(node);
    } else {
      el("bookContainer").classList.remove("hidden");
      el("bookSelect").innerHTML = '<option value="">-- Select Book --</option>' + 
        Object.keys(node).map(b => `<option value="${b}">${b}</option>`).join("");
    }
  };

  el("bookSelect").onchange = () => {
    const sub = el("subjectSelect").value;
    const book = el("bookSelect").value;
    if (sub && book) updateChapterList(data[sub][book]);
  };
}

function updateChapterList(chapters) {
  el("chapterSelect").innerHTML = '<option value="">-- Select Chapter --</option>' + 
    chapters.map(c => `<option value="${c.chapter_title}">${c.chapter_title}</option>`).join("");

  el("bulkStatusTbody").innerHTML = chapters.map(c => `
    <tr id="row-${slugify(c.chapter_title)}">
      <td class="border p-2 font-medium">${c.chapter_title}</td>
      <td class="border p-2 text-gray-400 font-mono">${slugify(c.chapter_title)}</td>
      <td class="border p-2 status-cell"><span class="text-orange-500 font-bold">PENDING</span></td>
    </tr>`).join("");
}

function slugify(t) { return t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); }

async function runChapterProcess(meta, rowId) {
  const cell = rowId ? el(rowId).querySelector(".status-cell") : null;
  const setStatus = (t, c) => { if (cell) cell.innerHTML = `<span class="${c} font-bold">${t}</span>`; };

  try {
    setStatus("WORKING", "text-blue-600");
    addLog(`🚀 Processing: ${meta.chapter}`);

    const gemRes = await fetch(`${API_BASE}/api/gemini`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meta })
    });
    const gemData = await gemRes.json();
    if (!gemRes.ok) throw new Error(gemData.error || "Gemini Failed");
    addLog(`✨ Generated ${gemData.questions.length} Qs`);

    const supRes = await fetch(`${API_BASE}/api/manageSupabase`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meta, csv: gemData.questions })
    });
    const supData = await supRes.json();
    if (!supRes.ok) throw new Error(supData.error || "Supabase Failed");

    addLog(`🏁 Live: ${supData.table_name}`, "success");
    setStatus("DONE", "text-green-600");
  } catch (err) {
    addLog(`❌ Error: ${err.message}`, "error");
    setStatus("FAIL", "text-red-600");
  }
}

el("generateBtn").onclick = async () => {
  const meta = {
    class_name: el("repoSlug").value.split("-").pop(),
    subject: el("subjectSelect").value,
    book: el("bookSelect").value || "",
    chapter: el("chapterSelect").value
  };
  if (!meta.chapter) return alert("Select Chapter");
  await runChapterProcess(meta, `row-${slugify(meta.chapter)}`);
};

el("bulkGenerateBtn").onclick = async () => {
  const sub = el("subjectSelect").value;
  const book = el("bookSelect").value;
  const chapters = book ? ACTIVE_CURRICULUM[sub][book] : ACTIVE_CURRICULUM[sub];
  
  if (!confirm(`Bulk generate ${chapters.length} chapters?`)) return;
  el("bulkProgressContainer").classList.remove("hidden");

  let done = 0;
  for (const ch of chapters) {
    const meta = {
      class_name: el("repoSlug").value.split("-").pop(),
      subject: sub, book: book || "", chapter: ch.chapter_title
    };
    await runChapterProcess(meta, `row-${slugify(ch.chapter_title)}`);
    done++;
    el("bulkProgressBarInner").style.width = `${(done / chapters.length) * 100}%`;
    el("bulkProgressLabel").textContent = `${done} / ${chapters.length}`;
  }
};
