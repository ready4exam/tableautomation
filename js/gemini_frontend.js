// gemini_frontend.js — Phase-2 Working Version (Fixed for ES Module Loading)

import { ENV } from "./config.js";

console.log("🚀 tableautomation: gemini_frontend.js loaded");

// Render UI
document.getElementById("app").innerHTML = `
  <div class="space-y-4">
    <label class="block">
      <span class="font-semibold">Select Class</span>
      <select id="classSelect" class="border p-2 rounded w-full">
        <option value="">-- Choose Class --</option>
        <option>class11</option>
        <option>class12</option>
      </select>
    </label>

    <label class="block">
      <span class="font-semibold">Subject</span>
      <select id="subjectSelect" class="border p-2 rounded w-full"></select>
    </label>

    <label class="block">
      <span class="font-semibold">Book</span>
      <select id="bookSelect" class="border p-2 rounded w-full"></select>
    </label>

    <label class="block">
      <span class="font-semibold">Chapter</span>
      <select id="chapterSelect" class="border p-2 rounded w-full"></select>
    </label>

    <button id="generateBtn" class="bg-blue-600 text-white px-4 py-2 rounded">
      Generate & Upload
    </button>

    <pre id="logBox" class="bg-gray-100 p-3 h-64 overflow-auto text-sm"></pre>
  </div>
`;

// Log helper
const log = (m) => {
  document.getElementById("logBox").textContent += m + "\n";
};

// Dropdown references
const classSelect = document.getElementById("classSelect");
const subjectSelect = document.getElementById("subjectSelect");
const bookSelect = document.getElementById("bookSelect");
const chapterSelect = document.getElementById("chapterSelect");
const generateBtn = document.getElementById("generateBtn");

// Load curriculum JSON
classSelect.addEventListener("change", async () => {
  const cls = classSelect.value;

  if (!cls) return;

  log("📚 Loading subjects...");

  const res = await fetch(
    `${ENV.BACKEND_API}/static_curriculum/${cls}/curriculum.json`
  );

  const curriculum = await res.json();
  window._curriculum = curriculum;

  subjectSelect.innerHTML = Object.keys(curriculum)
    .map((s) => `<option>${s}</option>`)
    .join("");

  log("📘 Subjects loaded.");
});

// Subject → Books
subjectSelect.addEventListener("change", () => {
  const subj = subjectSelect.value;
  const books = Object.keys(window._curriculum[subj]);

  bookSelect.innerHTML = books
    .map((b) => `<option>${b}</option>`)
    .join("");

  log("📚 Books loaded.");
});

// Book → Chapters
bookSelect.addEventListener("change", () => {
  const subj = subjectSelect.value;
  const book = bookSelect.value;

  const chapters = window._curriculum[subj][book] || [];

  chapterSelect.innerHTML = chapters
    .map((c) => `<option>${c.chapter_title}</option>`)
    .join("");

  log("📖 Chapters loaded.");
});

// Generate + Upload
generateBtn.addEventListener("click", async () => {
  const cls = classSelect.value;
  const subj = subjectSelect.value;
  const book = bookSelect.value;
  const chapter = chapterSelect.value;

  log("⚙️ Generating question set via Gemini...");

  const body = { className: cls, subject: subj, book, chapter };

  // Gemini call
  const genRes = await fetch(`${ENV.BACKEND_API}/api/gemini`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ENV.GEMINI_API_KEY,
    },
    body: JSON.stringify(body),
  });

  const genData = await genRes.json();
  log(`✅ Gemini generated ${genData.count} questions.`);

  // Supabase insert
  log("📤 Uploading to Supabase...");

  const upRes = await fetch(`${ENV.BACKEND_API}/api/manageSupabase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      className: cls,
      tableName: genData.table,
      rows: genData.rows,
    }),
  });

  const upData = await upRes.json();
  log(`✅ Supabase upload complete: ${upData.inserted} rows inserted`);

  log("🎉 Full automation flow completed successfully.");
});
