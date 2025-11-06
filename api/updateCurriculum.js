// File: /api/updateCurriculum.js

export const config = {
  runtime: "nodejs",
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST requests allowed" });
  }

  try {
    const { chapterTitle, newId, className } = req.body;
    if (!chapterTitle || !newId || !className) {
      return res.status(400).json({ error: "Missing required fields: chapterTitle, newId, className" });
    }

    // ✅ Decide which repo to update based on class
    let repo;
    if (className === "9") {
      repo = "ninth";
    } else if (className === "11") {
      repo = "ready4exam-11";
    } else {
      throw new Error(`Unsupported class: ${className}`);
    }

    // ✅ Environment variables
    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    const filePath = "js/curriculum.js";

    if (!token || !owner) {
      throw new Error("Missing GITHUB_TOKEN or GITHUB_OWNER in environment variables");
    }

    // 🪶 1️⃣ Fetch the current curriculum.js from GitHub
    const fileRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    if (!fileRes.ok) {
      const text = await fileRes.text();
      throw new Error(`GitHub fetch failed: ${fileRes.status} ${fileRes.statusText} - ${text}`);
    }

    const fileData = await fileRes.json();
    const content = Buffer.from(fileData.content, "base64").toString("utf-8");

    // 🧠 2️⃣ Normalize chapter title for matching
    const normalizedTitle = chapterTitle
      .replace(/chapter\s*\d*[:\-]*/i, "")
      .trim()
      .toLowerCase();

    let found = false;

    // 🔍 3️⃣ Update the matching chapter’s ID
    const updatedContent = content.replace(
      /\{\s*id:\s*["'`][^"'`]+["'`],\s*title:\s*["'`]([^"'`]+)["'`]\s*\}/g,
      (match, titleText) => {
        const normalizedCurrTitle = titleText
          .replace(/chapter\s*\d*[:\-]*/i, "")
          .trim()
          .toLowerCase();

        if (normalizedCurrTitle.includes(normalizedTitle)) {
          found = true;
          return match.replace(/id:\s*["'`][^"'`]+["'`]/, `id: "${newId}"`);
        }
        return match;
      }
    );

    if (!found) {
      throw new Error(`Chapter "${chapterTitle}" not found in curriculum.js`);
    }

    // 💾 4️⃣ Commit updated content back to GitHub
    const updateRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/vnd.github.v3+json",
        },
        body: JSON.stringify({
          message: `Auto-update: "${chapterTitle}" → "${newId}"`,
          content: Buffer.from(updatedContent).toString("base64"),
          sha: fileData.sha,
        }),
      }
    );

    if (!updateRes.ok) {
      const text = await updateRes.text();
      throw new Error(`GitHub update failed: ${updateRes.status} ${updateRes.statusText} - ${text}`);
    }

    const updateData = await updateRes.json();

    console.log(`✅ curriculum.js updated successfully in ${repo}`);

    return res.status(200).json({
      message: `✅ curriculum.js updated successfully in ${repo}`,
      commitSHA: updateData.commit?.sha || null,
    });
  } catch (error) {
    console.error("❌ Error updating curriculum:", error.message);
    return res.status(500).json({ error: error.message });
  }
}
