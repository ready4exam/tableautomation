// ============================================================================
// universal_logic.js — PRODUCTION READY & DEBUGGED
// ============================================================================

const API_BASE = "https://ready4exam-master-automation.vercel.app";
const el = (id) => document.getElementById(id);

// Global state
let ACTIVE_CURRICULUM = null;

function addLog(msg, type = 'info') {
    const time = new Date().toLocaleTimeString();
    const icon = type === 'error' ? '❌' : type === 'success' ? '✅' : '🔹';
    el('log').value = `${icon} [${time}] ${msg}\n` + el('log').value;
}

// 1. CONNECT & DYNAMIC LOAD
el('connectBtn').onclick = async () => {
    const repoSlug = el('repoSlug').value.trim();
    if (!repoSlug) return alert("Please enter the full repo slug (username/repo).");

    addLog(`🔗 Connecting to: ${repoSlug}...`);
    const curriculumUrl = `https://raw.githubusercontent.com/${repoSlug}/main/js/curriculum.js?v=${Date.now()}`;

    try {
        const response = await fetch(curriculumUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}: File not found.`);
        
        const text = await response.text();
        // Robust cleanup for different export styles
        const cleanJS = text
            .replace(/export const curriculum = /, "")
            .replace(/export default curriculum;/, "")
            .replace(/window\.curriculumData = /, "")
            .trim()
            .replace(/;$/, "");
        
        ACTIVE_CURRICULUM = new Function(`return ${cleanJS}`)();

        if (ACTIVE_CURRICULUM) {
            setupSyllabus(ACTIVE_CURRICULUM);
            el('selectionSection').classList.remove('opacity-50', 'pointer-events-none');
            addLog(`🎊 SUCCESS: ${Object.keys(ACTIVE_CURRICULUM).length} Subjects Loaded.`, 'success');
        }
    } catch (err) {
        addLog(`FAILED: ${err.message}`, 'error');
    }
};

// 2. DROPDOWN LOGIC (Handles Telangana Nesting)
function setupSyllabus(data) {
    el('subjectSelect').innerHTML = '<option value="">-- Select Subject --</option>' + 
        Object.keys(data).map(sub => `<option value="${sub}">${sub}</option>`).join('');
    
    el('subjectSelect').onchange = () => {
        const sub = el('subjectSelect').value;
        if (!sub) return;
        const node = data[sub];

        if (!Array.isArray(node)) {
            // DETECTED NESTED (Telangana/ICSE)
            el('bookContainer').classList.remove('hidden');
            el('bookSelect').innerHTML = '<option value="">-- Select Book/Section --</option>' + 
                Object.keys(node).map(b => `<option value="${b}">${b}</option>`).join('');
            el('chapterSelect').innerHTML = '<option value="">-- Select Book First --</option>';
            addLog(`📖 Subject "${sub}" detected as nested. Book/Section required.`);
        } else {
            // DETECTED FLAT (CBSE)
            el('bookContainer').classList.add('hidden');
            el('bookSelect').innerHTML = '';
            updateChapterList(node);
        }
    };

    el('bookSelect').onchange = () => {
        const sub = el('subjectSelect').value;
        const book = el('bookSelect').value;
        if (sub && book) updateChapterList(data[sub][book]);
    };
}

function updateChapterList(chapters) {
    el('chapterSelect').innerHTML = '<option value="">-- Select Chapter --</option>' + 
        chapters.map(ch => `<option value="${ch.chapter_title}">${ch.chapter_title}</option>`).join('');
    
    // Refresh Status Table
    el('bulkStatusTbody').innerHTML = chapters.map(ch => `
        <tr id="row-${slugify(ch.chapter_title)}">
            <td class="border p-3 font-medium">${ch.chapter_title}</td>
            <td class="border p-3 text-gray-400 font-mono">${slugify(ch.chapter_title)}</td>
            <td class="border p-3 status-cell"><span class="text-orange-500 font-bold uppercase">Pending</span></td>
        </tr>
    `).join('');
}

function slugify(t) { return t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }

// 3. EXECUTION LOGIC (The "Generate" Fix)
async function runChapterProcess(meta, rowId = null) {
    const row = rowId ? el(rowId) : null;
    const statusCell = row ? row.querySelector('.status-cell') : null;
    const updateUI = (txt, color) => { if(statusCell) statusCell.innerHTML = `<span class="${color} font-bold uppercase">${txt}</span>`; };

    try {
        updateUI("Working...", "text-blue-600");
        addLog(`🚀 Starting: ${meta.chapter}`);

        // Step 1: Gemini
        const gemRes = await fetch(`${API_BASE}/api/gemini`, { 
            method: 'POST', 
            body: JSON.stringify({ meta }) 
        });
        const gemData = await gemRes.json();
        if (!gemRes.ok) throw new Error(gemData.error || "Gemini Generation Failed");
        addLog(`✨ Gemini Generated ${gemData.questions.length} questions for ${meta.chapter}`);

        // Step 2: Supabase & GitHub
        const supRes = await fetch(`${API_BASE}/api/manageSupabase`, { 
            method: 'POST', 
            body: JSON.stringify({ meta, csv: gemData.questions }) 
        });
        const supData = await supRes.json();
        if (!supRes.ok) throw new Error(supData.error || "Database Upload Failed");

        addLog(`🏁 DONE: Table ${supData.table_name} is now live!`, 'success');
        updateUI("Success", "text-green-600");
    } catch (err) {
        addLog(`❌ ERROR [${meta.chapter}]: ${err.message}`, 'error');
        updateUI("Failed", "text-red-600");
    }
}

el('generateBtn').onclick = async () => {
    const meta = {
        class_name: el('repoSlug').value.split('-').pop(), // Extracts "9Telangana"
        subject: el('subjectSelect').value,
        book: el('bookSelect').value || "",
        chapter: el('chapterSelect').value
    };
    if (!meta.chapter) return alert("Please select a chapter first!");
    await runChapterProcess(meta, `row-${slugify(meta.chapter)}`);
};

el('bulkGenerateBtn').onclick = async () => {
    const sub = el('subjectSelect').value;
    const book = el('bookSelect').value;
    const chapters = book ? ACTIVE_CURRICULUM[sub][book] : ACTIVE_CURRICULUM[sub];
    
    if(!chapters || !confirm(`Start bulk for ${chapters.length} chapters?`)) return;
    
    el('bulkProgressContainer').classList.remove('hidden');
    let done = 0;
    for (const ch of chapters) {
        const meta = { 
            class_name: el('repoSlug').value.split('-').pop(), 
            subject: sub, 
            book: book || "", 
            chapter: ch.chapter_title 
        };
        await runChapterProcess(meta, `row-${slugify(ch.chapter_title)}`);
        done++;
        el('bulkProgressBarInner').style.width = `${(done/chapters.length)*100}%`;
        el('bulkProgressLabel').textContent = `${done} / ${chapters.length}`;
    }
};
