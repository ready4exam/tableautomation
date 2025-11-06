export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST requests allowed" });
  }

  try {
    const { chapterTitle, newId, className } = req.body;
    if (!chapterTitle || !newId || !className) {
      return res.status(400).json({
        error: "Missing required fields: chapterTitle, newId, className",
      });
    }

    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    const repo = `ready4exam-${className.toLowerCase()}`; // 👈 dynamic repo selection
    const filePath = "js/curriculum.js";

    const fileRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!fileRes.ok) {
      throw new Error(`GitHub fetch failed: ${fileRes.statusText}`);
    }

    const fileData = await fileRes.json();
    const content = Buffer.from(fileData.content, "base64").toString("utf-8");

    const normalizedTitle = chapterTitle
      .replace(/chapter\s*\d*[:\-]*/i, "")
      .trim()
      .toLowerCase();

    let found = false;
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
      throw new Error(`Chapter title "${chapterTitle}" not found in curriculum.js`);
    }

    const updateRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: `Auto-update ID for "${chapterTitle}" → "${newId}"`,
          content: Buffer.from(updatedContent).toString("base64"),
          sha: fileData.sha,
        }),
      }
    );

    if (!updateRes.ok) {
      throw new Error(`GitHub update failed: ${updateRes.statusText}`);
    }

    const updateData = await updateRes.json();
    return res.status(200).json({
      message: "✅ curriculum.js updated successfully",
      commitSHA: updateData.commit?.sha || null,
    });
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
