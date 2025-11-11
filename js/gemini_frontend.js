// static/js/gemini_frontend.js
// Minimal UI bindings; adapt selectors to your page
(async () => {
  // Utility
  function $qs(sel) { return document.querySelector(sel); }
  function $qsa(sel) { return Array.from(document.querySelectorAll(sel)); }

  // Replace these selectors with your actual UI elements
  const classInput = $qs("#className"); // input/select
  const subjectInput = $qs("#subject");
  const bookInput = $qs("#book");
  const chapterInput = $qs("#chapter");
  const numInput = $qs("#numQuestions") || { value: 20 };
  const difficultyInput = $qs("#difficulty") || { value: "medium" };
  const generateBtn = $qs("#generateBtn");
  const previewDiv = $qs("#preview");
  const uploadBtn = $qs("#uploadBtn");
  const statusDiv = $qs("#status");

  function setStatus(t) { if (statusDiv) statusDiv.innerText = t; else console.log(t); }

  // hold latest generated questions
  let lastQuestions = [];

  async function callGemini(meta) {
    setStatus("Requesting Gemini...");
    const r = await fetch("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meta }),
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || "Gemini failed");
    return j.questions;
  }

  async function uploadToSupabase(meta, csv) {
    setStatus("Uploading to Supabase...");
    const r = await fetch("/api/manageSupabase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meta, csv }),
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || "Upload failed");
    return j;
  }

  function renderPreview(items) {
    if (!previewDiv) return;
    previewDiv.innerHTML = "";
    items.slice(0, 10).forEach((q, idx) => {
      const el = document.createElement("div");
      el.className = "q-preview";
      el.innerHTML = `<strong>${idx+1}. ${q.question_text}</strong>
        <div>A) ${q.option_a}</div>
        <div>B) ${q.option_b}</div>
        <div>C) ${q.option_c}</div>
        <div>D) ${q.option_d}</div>
        <div><em>Answer: ${q.correct_answer_key}</em></div>
        <div class="reason">${q.scenario_reason_text}</div>
        <hr/>`;
      previewDiv.appendChild(el);
    });
  }

  if (generateBtn) generateBtn.addEventListener("click", async (e) => {
    try {
      setStatus("Gathering inputs...");
      const meta = {
        class_name: classInput.value,
        subject: subjectInput.value,
        book: bookInput.value || "",
        chapter: chapterInput.value,
        num: parseInt(numInput.value || 20, 10),
        difficulty: difficultyInput.value || "medium",
      };
      setStatus("Calling Gemini...");
      const questions = await callGemini(meta);
      lastQuestions = questions;
      renderPreview(questions);
      setStatus(`Generated ${questions.length} questions. Preview shown. Click Upload to save.`);
      if (uploadBtn) uploadBtn.disabled = false;
    } catch (err) {
      console.error(err);
      setStatus("Error: " + (err.message || err));
    }
  });

  if (uploadBtn) uploadBtn.addEventListener("click", async (e) => {
    try {
      if (!lastQuestions || lastQuestions.length === 0) {
        setStatus("No generated questions to upload.");
        return;
      }
      setStatus("Uploading...");
      const meta = {
        class_name: classInput.value,
        subject: subjectInput.value,
        book: bookInput.value || "",
        chapter: chapterInput.value,
        refresh: true,
      };
      const resp = await uploadToSupabase(meta, lastQuestions);
      setStatus(`Upload succeeded: ${resp.message}`);
      // show link to quiz viewer
      const table = resp.table;
      const link = document.createElement("a");
      link.href = `/static/quiz-engine.html?table=${encodeURIComponent(table)}`;
      link.innerText = "Open Quiz Viewer";
      previewDiv.appendChild(link);
    } catch (err) {
      console.error(err);
      setStatus("Upload failed: " + (err.message || err));
    }
  });

  // quick auto-fill for development
  document.addEventListener("DOMContentLoaded", () => {
    if (classInput) classInput.value = classInput.value || "class11";
    if (subjectInput) subjectInput.value = subjectInput.value || "Physics";
    if (chapterInput) chapterInput.value = chapterInput.value || "Motion in a Straight Line";
  });
})();
