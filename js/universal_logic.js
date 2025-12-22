// ============================================================================
// universal_logic.js — REPO-AGNOSTIC LOAD & AUTOMATION
// ============================================================================

const repoInput = document.getElementById('repoSlug');
const connectBtn = document.getElementById('connectBtn');
const selectionSection = document.getElementById('selectionSection');
const subjectSelect = document.getElementById('subjectSelect');
const chapterSelect = document.getElementById('chapterSelect');
const logArea = document.getElementById('log');

// Global state to hold the parsed curriculum
let ACTIVE_CURRICULUM = null;

function addLog(msg) {
    const time = new Date().toLocaleTimeString();
    logArea.value = `[${time}] ${msg}\n` + logArea.value;
    logArea.scrollTop = 0;
}

connectBtn.addEventListener('click', async () => {
    const repoSlug = repoInput.value.trim(); // e.g., ready4exam/ready4exam-class-9Telangana
    if (!repoSlug) return alert("Please enter the full repo slug.");

    addLog(`🔗 Connecting to: ${repoSlug}...`);

    // Fetch from Raw GitHub to bypass module restrictions
    const curriculumUrl = `https://raw.githubusercontent.com/${repoSlug}/main/js/curriculum.js?v=${Date.now()}`;

    try {
        const response = await fetch(curriculumUrl);
        if (!response.ok) throw new Error("Curriculum file not found. Check repo privacy and path.");
        
        const text = await response.text();
        
        // UNIVERSAL PARSING: Handles 'export const curriculum = { ... }' or 'window.curriculumData = { ... }'
        const cleanJS = text
            .replace(/export const curriculum = /, "")
            .replace(/export default curriculum;/, "")
            .replace(/window\.curriculumData = /, "")
            .trim()
            .replace(/;$/, "");
        
        // Convert string to actual Object
        ACTIVE_CURRICULUM = new Function(`return ${cleanJS}`)();

        if (ACTIVE_CURRICULUM) {
            setupSyllabus(ACTIVE_CURRICULUM);
            selectionSection.classList.remove('opacity-50', 'pointer-events-none');
            addLog(`✅ SUCCESS: Loaded ${Object.keys(ACTIVE_CURRICULUM).length} main subjects.`);
        }

    } catch (err) {
        addLog(`❌ CONNECTION FAILED: ${err.message}`);
        alert("Could not load curriculum. Ensure path is /js/curriculum.js");
    }
});

function setupSyllabus(data) {
    // Populate Subjects
    subjectSelect.innerHTML = '<option value="">-- Select Subject --</option>' + 
        Object.keys(data).map(sub => `<option value="${sub}">${sub}</option>`).join('');
    
    subjectSelect.onchange = () => {
        const sub = subjectSelect.value;
        if (!sub) return;

        const node = data[sub];
        let chapters = [];

        // DRY RUN LOGIC: Check if it's nested (Telangana) or flat (CBSE)
        if (Array.isArray(node)) {
            // Flat Array (CBSE style)
            chapters = node;
        } else {
            // Nested Object (Telangana/ICSE style)
            // Flatten all sub-books into one list for the status table
            chapters = Object.values(node).flat();
        }

        // Update Chapter Dropdown
        chapterSelect.innerHTML = chapters.map(ch => 
            `<option value="${ch.chapter_title}">${ch.chapter_title}</option>`
        ).join('');
        
        // Update Status Table with Universal Slug logic
        const tbody = document.getElementById('bulkStatusTbody');
        tbody.innerHTML = chapters.map(ch => {
            const title = ch.chapter_title;
            // Generate slug: "Matter Around Us" -> "matter-around-us"
            const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
            
            return `
                <tr class="hover:bg-gray-50">
                    <td class="border p-2 font-medium">${title}</td>
                    <td class="border p-2 text-gray-500 font-mono">${slug}</td>
                    <td class="border p-2">
                        <span class="px-2 py-1 rounded-full text-[10px] bg-orange-100 text-orange-700 font-bold uppercase">Pending</span>
                    </td>
                </tr>
            `;
        }).join('');

        addLog(`📂 Subject "${sub}" ready with ${chapters.length} chapters.`);
    };
}
