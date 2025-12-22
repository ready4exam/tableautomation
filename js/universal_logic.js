// universal_logic.js
const repoInput = document.getElementById('repoSlug');
const connectBtn = document.getElementById('connectBtn');
const selectionSection = document.getElementById('selectionSection');
const subjectSelect = document.getElementById('subjectSelect');
const chapterSelect = document.getElementById('chapterSelect');
const logArea = document.getElementById('log');

function addLog(msg) {
    const time = new Date().toLocaleTimeString();
    logArea.value += `[${time}] ${msg}\n`;
    logArea.scrollTop = logArea.scrollHeight;
}

connectBtn.addEventListener('click', async () => {
    const repo = repoInput.value.trim();
    if (!repo) return alert("Please enter a repo slug (e.g., ready4exam/ready4exam-class-9Telangana)");

    addLog(`Attempting to fetch curriculum from: ${repo}...`);

    // We assume your manual curriculum.js is located at this path in every repo
    const curriculumUrl = `https://raw.githubusercontent.com/${repo}/main/js/curriculum.js`;

    try {
        const response = await fetch(curriculumUrl);
        if (!response.ok) throw new Error("Curriculum file not found in repo.");
        
        const scriptText = await response.text();
        
        // Safety check and execution
        // This evaluates your 'window.curriculumData = { ... }' logic
        const script = document.createElement('script');
        script.text = scriptText;
        document.head.appendChild(script);

        setTimeout(() => {
            if (window.curriculumData) {
                setupSyllabus(window.curriculumData);
                selectionSection.classList.remove('opacity-50', 'pointer-events-none');
                addLog(`Success! Loaded ${Object.keys(window.curriculumData).length} subjects.`);
            } else {
                addLog("Error: window.curriculumData not found in script.", "error");
            }
        }, 500);

    } catch (err) {
        addLog(`Connection Failed: ${err.message}`);
        alert("Could not load curriculum. Ensure the repo is public and the path /js/curriculum.js exists.");
    }
});

function setupSyllabus(data) {
    subjectSelect.innerHTML = Object.keys(data).map(sub => `<option value="${sub}">${sub}</option>`).join('');
    
    const updateChapters = () => {
        const sub = subjectSelect.value;
        const chapters = data[sub];
        chapterSelect.innerHTML = chapters.map(ch => `<option value="${ch}">${ch}</option>`).join('');
        
        // Update Status Table
        const tbody = document.getElementById('bulkStatusTbody');
        tbody.innerHTML = chapters.map(ch => `
            <tr>
                <td class="border p-2">${ch}</td>
                <td class="border p-2 text-gray-500">${ch.toLowerCase().replace(/\s+/g, '-')}</td>
                <td class="border p-2"><span class="text-orange-500">Pending</span></td>
            </tr>
        `).join('');
    };

    subjectSelect.addEventListener('change', updateChapters);
    updateChapters();
}
