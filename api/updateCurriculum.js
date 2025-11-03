import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({
      message: "updateCurriculum API is live ✅ (GET request ok)"
    });
  }

  if (req.method === "POST") {
    try {
      const { chapterTitle, newId } = req.body || {};

      if (!chapterTitle || !newId) {
        return res.status(400).json({
          error: "Missing required fields: chapterTitle or newId"
        });
      }

      const token = process.env.GITHUB_TOKEN;
      const owner = process.env.TARGET_OWNER;
      const repo = process.env.TARGET_REPO;
      const filePath = "js/curriculum.js";

      // Step 1: Fetch the current curriculum.js content from GitHub
      const fileResp = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`, {
        headers: { Authorization: `token ${token}` }
      });
      const fileData = await fileResp.json();
      const content = Buffer.from(fileData.content, "base64").toString("utf-8");

      // Step 2: Update the matching chapter’s id (match partial title)
      const lines = content.split("\n");
      let updated = false;

      const newLines = lines.map((line) => {
        if (line.includes("title:") && line.toLowerCase().includes(chapterTitle.toLowerCase())) {
          updated = true;
          return line; // keep title line
        }
        if (updated && line.includes("id:")) {
          updated = false;
          return line.replace(/id:\s*["'][^"']+["']/, `id: "${newId}"`);
        }
        return line;
      });

      const newContent = newLines.join("\n");

      if (newContent === content) {
        return res.status(404).json({
          message: `❌ No matching chapter found for: ${chapterTitle}`
        });
      }

      // Step 3: Commit updated content back to GitHub
      const updateResp = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`, {
        method: "PUT",
        headers: {
          Authorization: `token ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: `updateCurriculum: Updated id for ${chapterTitle}`,
          content: Buffer.from(newContent).toString("base64"),
          sha: fileData.sha
        })
      });

      if (!updateResp.ok) {
        const errText = await updateResp.text();
        throw new Error(`GitHub update failed: ${errText}`);
      }

      return res.status(200).json({
        message: "✅ curriculum.js updated successfully!",
        chapterTitle,
        newId
      });
    } catch (err) {
      console.error("API error:", err);
      return res.status(500).json({
        error: err.message
      });
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}
