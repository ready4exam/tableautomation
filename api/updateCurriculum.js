// /api/updateCurriculum.js

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST requests allowed" });
  }

  try {
    const { chapterTitle, newId } = req.body;
    if (!chapterTitle || !newId) {
      return res.status(400).json({ error: "Missing chapterTitle or newId" });
    }

    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const filePath = "js/curriculum.js"; // ✅ correct path

    console.log("📂 Fetching current curriculum.js from GitHub...");

    const fileRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
      }
    );

    if (!fileRes.ok) {
      const text = await fileRes.text();
      console.error("❌ GitHub fetch failed:", text);
      throw new Error(`GitHub fetch failed: ${fileRes.status} ${fileRes.statusText}`);
    }

    const fileData = await fileRes.json();
    const content = Buffer.from(fileData.content, "base64").toString("utf-8");

    const normalizedTitle = chapterTitle
      .replace(/chapter\s*\d*[:\-]*/i, "")
      .trim()
      .toLowerCase();

    let found = false;

    console.log(`🪶 Updating curriculum for: ${chapterTitle} → ${newId}`);

    const updatedContent = content.replace(
      /\{\s*id:\s*["'`][^"'`]+["'`],\s*title:\s*["'`]([^"'`]+)["'`]\s*\}/g,
      (match, titleText) => {
        const normalizedCurrTitle = titleText
          .replace(/chapter\s*\d*[:\-]*/i, "")
          .trim()
          .toLowerCase();

        if (normalizedCurrTitle.includes(normalizedTitle)) {
          found = true;
          console.log(`✅ Found match: ${titleText}`);
          return match.replace(/id:\s*["'`][^"'`]+["'`]/, `id: "${newId}"`);
        }
        return match;
      }
    );

    if (!found) {
      throw new Error(`Chapter title "${chapterTitle}" not found in curriculum.js`);
    }

    console.log("💾 Committing updated curriculum.js...");

    const updateRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/vnd.github+json",
        },
        body: JSON.stringify({
          message: `Auto-update ID for "${chapterTitle}" → "${newId}"`,
          content: Buffer.from(updatedContent).toString("base64"),
          sha: fileData.sha,
        }),
      }
    );

    const updateText = await updateRes.text();
    let updateData;
    try {
      updateData = JSON.parse(updateText);
    } catch {
      console.error("❌ GitHub response not JSON:", updateText);
      throw new Error("GitHub update response invalid JSON");
    }

    if (!updateRes.ok) {
      console.error("❌ GitHub update failed:", updateData);
      throw new Error(`GitHub update failed: ${updateRes.status} ${updateRes.statusText}`);
    }

    console.log("✅ curriculum.js updated successfully");
    return res.status(200).json({
      message: "✅ curriculum.js updated successfully",
      commitSHA: updateData.commit?.sha || null,
    });
  } catch (error) {
    console.error("❌ updateCurriculum error:", error);
    return res.status(500).json({ error: error.message });
  }
}
