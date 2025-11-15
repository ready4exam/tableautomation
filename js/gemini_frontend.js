// js/gemini_frontend.js
// Frontend automation script (browser). AUTO_UPDATE = YES (it will call updateCurriculum automatically)

async function loadCurriculumForClass(classNum) {
  const url = `https://ready4exam.github.io/ready4exam-${classNum}/js/curriculum.js`;
  const module = await import(url).catch((e) => {
    console.error("Failed to import curriculum module:", e);
    throw e;
  });
  const curriculum = module.curriculum || module.default || null;
  if (!curriculum) throw new Error("Curriculum module did not export 'curriculum'.");
  return curriculum;
}

// UI helper (not prescriptive — adapt to your UI)
function showStatus(msg) {
  console.log("[TableAutomation]", msg);
  const el = document.getElementById("automation-status");
  if (el) el.innerText = msg;
}

async function postJSON(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || data.message || JSON.stringify(data));
  return data;
}

export async function runAutomation(options) {
  // options: { class: "9", subject: "Science", book: "Science Textbook", chapter: "Force and Laws of Motion", difficulty: "Medium" }
  try {
    showStatus("Loading curriculum...");
    const curriculum = await loadCurriculumForClass(options.class);

    // locate subject / book / chapter to get existing table_id (optional)
    const subjectKey = Object.keys(curriculum).find(k => k.toLowerCase().includes((options.subject || "").toLowerCase()));
    if (!subjectKey) {
      throw new Error(`Subject "${options.subject}" not found in curriculum for class ${options.class}`);
    }
    const books = curriculum[subjectKey];
    // if book provided, prefer it; otherwise take first book
    const bookKey = options.book ? Object.keys(books).find(b => b.toLowerCase().includes((options.book || "").toLowerCase())) : Object.keys(books)[0];
    const chapters = books[bookKey];
    const chapterObj = chapters.find(ch => ch.chapter_title.trim().toLowerCase() === options.chapter.trim().toLowerCase());
    if (!chapterObj) {
      throw new Error(`Chapter "${options.chapter}" not found under ${subjectKey} / ${bookKey}`);
    }

    const existingTableId = chapterObj.table_id || null;

    showStatus("Requesting Gemini to generate questions...");
    const geminiRes = await postJSON("/api/gemini", { meta: { class_name: options.class, subject: subjectKey, book: bookKey, chapter: options.chapter } });
    if (!geminiRes.ok) throw new Error(geminiRes.error || "Gemini failed");
    const questions = geminiRes.questions;

    showStatus(`Generated ${questions.length} questions. Uploading to Supabase...`);
    // Provide meta.table_id if we want to prefer existing curriculum table id
    const manageBody = {
      meta: { class_name: options.class, subject: subjectKey, book: bookKey, chapter: options.chapter, table_id: existingTableId },
      csv: questions
    };

    const manageRes = await postJSON("/api/manageSupabase", manageBody);
    if (!manageRes.ok) throw new Error(manageRes.error || "manageSupabase failed");

    const newTableId = manageRes.new_table_id || manageRes.table;

    showStatus(`Table updated: ${newTableId}. Updating curriculum in class repo...`);

    // AUTO_UPDATE: call updateCurriculum
    try {
      const updateBody = {
        class_name: options.class,
        subject: subjectKey,
        chapter: options.chapter,
        new_table_id: newTableId
      };
      const updateRes = await postJSON("/api/updateCurriculum", updateBody);
      if (!updateRes.ok) {
        console.warn("updateCurriculum returned not ok:", updateRes);
        showStatus(`Warning: curriculum update returned error. Proceeding to quiz.`);
      } else {
        showStatus(`Curriculum updated in repo ${updateRes.repo}.`);
      }
    } catch (err) {
      console.warn("Failed to update curriculum automatically:", err);
      showStatus("Warning: failed to auto-update curriculum. Proceeding to quiz.");
    }

    // Redirect to quiz engine
    const difficulty = options.difficulty || "Medium";
    const redirectUrl = `./quiz-engine.html?table=${encodeURIComponent(newTableId)}&difficulty=${encodeURIComponent(difficulty)}`;
    showStatus("Redirecting to quiz engine...");
    window.location.href = redirectUrl;

  } catch (err) {
    console.error("Automation failed:", err);
    showStatus("Automation failed: " + (err.message || err));
    alert("Automation failed: " + (err.message || err));
  }
}

// Example: Hook to a button (assumes page has UI for inputs)
document.addEventListener("DOMContentLoaded", function() {
  const runBtn = document.getElementById("run-automation");
  if (!runBtn) return;
  runBtn.addEventListener("click", async () => {
    const classInput = document.getElementById("input-class").value;
    const subjectInput = document.getElementById("input-subject").value;
    const bookInput = document.getElementById("input-book").value;
    const chapterInput = document.getElementById("input-chapter").value;
    const difficultyInput = document.getElementById("input-difficulty").value || "Medium";

    await runAutomation({
      class: classInput,
      subject: subjectInput,
      book: bookInput,
      chapter: chapterInput,
      difficulty: difficultyInput
    });
  });
});
