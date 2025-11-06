// -------------------- /api/updateCurriculum.js --------------------
import { corsHeaders } from "./_cors.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  res.set(corsHeaders(origin));

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  try {
    const { className, chapterTitle, newId } = req.body || {};
    if (!className || !chapterTitle || !newId) {
      return res.status(400).json({
        error: "Missing required fields: className, chapterTitle, newId",
      });
    }

    // 🧭 Choose correct repo based on class
    let repoName;
    switch (String(className)) {
      case "5":
        repoName = "fifth";
        break;
      case "6":
        repoName = "sixth";
        break;
      case "7":
        repoName = "seventh";
        break;
      case "8":
        repoName = "eighth";
        break;
      case "9":
        repoName = "ninth";
        break;
      case "10":
        repoName = "tenth";
        break;
      case "11":
        repoName = "eleventh";
        break;
      case "12":
        repoName = "twelfth";
        break;
      default:
        repoName = "ready4exam-test"; // fallback
    }

    const GITHUB_OWNER = process.env.GITHUB_OWNER || "ready4exam";
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.PERSONAL_ACCESS_TOKEN;
    if (!GITHUB_TOKEN) {
      throw new Error("Missing GitHub token in environment");
    }

    const filePath = "js/curriculum.js"; // assumed consistent structure

    // 1️⃣ Fetch current curriculum.js
    const getUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${repoName}/contents/${filePath}`;
    const getResp = await fetch(getUrl, {
      headers: { Authorization: `Bearer ${GITHUB_TOKEN}` },
    });

    if (!getResp.ok) {
      throw new Error(`Failed to fetch existing curriculum.js: ${getResp.statusText}`);
    }

    const fileData = await getResp.json();
    const decoded = Buffer.from(fileData.content, "base64").toString("utf-8");

    // 2️⃣ Add or update chapter entry
    const newLine = `  "${chapterTitle}": "${newId}",`;
    let updatedContent = decoded;

    const existingPattern = new RegExp(`"${chapterTitle}"\\s*:\\s*".*?"`, "i");
    if (existingPattern.test(decoded)) {
      updatedContent = decoded.replace(existingPattern, `"${chapterTitle}": "${newId}"`);
    } else {
      updatedContent = decoded.replace(/(\{)([\s\S]*)(\})/, `$1$2\n${newLine}\n$3`);
    }

    const updatedBase64 = Buffer.from(updatedContent).toString("base64");

    // 3️⃣ Commit update
    const putUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${repoName}/contents/${filePath}`;
    const commitResp = await fetch(putUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: `Update curriculum.js: ${chapterTitle} → ${newId}`,
        content: updatedBase64,
        sha: fileData.sha,
      }),
    });

    const commitResult = await commitResp.json();

    if (!commitResp.ok) {
      throw new Error(commitResult.message || "GitHub commit failed");
    }

    console.log(`✅ curriculum.js updated for ${chapterTitle} in ${repoName}`);
    return res.status(200).json({
      success: true,
      repo: repoName,
      commit: commitResult.commit?.sha || null,
    });
  } catch (err) {
    console.error("❌ updateCurriculum error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
