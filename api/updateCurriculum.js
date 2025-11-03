// File: /api/updateCurriculum.js
// Vercel Serverless function to update js/curriculum.js in ready4exam/ninth repo.
// Expects POST JSON: { chapterTitle: "...", newId: "..." }
// Requires environment variable GITHUB_TOKEN (personal access token).

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Only POST allowed" });
    return;
  }

  const { chapterTitle, newId } = req.body || {};
  if (!chapterTitle || !newId) {
    res.status(400).json({ error: "Missing chapterTitle or newId" });
    return;
  }

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  if (!GITHUB_TOKEN) {
    res.status(500).json({ error: "Server misconfiguration: missing GITHUB_TOKEN" });
    return;
  }

  const owner = "ready4exam";
  const repo = "ninth";
  const branch = "main";
  const path = "js/curriculum.js";
  const apiBase = "https://api.github.com";

  try {
    // 1) Get current file metadata (sha) and content
    const getUrl = `${apiBase}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${branch}`;
    const getResp = await fetch(getUrl, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        "User-Agent": "ready4exam-updater",
        Accept: "application/vnd.github.v3+json"
      }
    });

    if (!getResp.ok) {
      const text = await getResp.text();
      return res.status(500).json({ error: "Failed to fetch existing file", details: text });
    }

    const fileMeta = await getResp.json();
    const currentSha = fileMeta.sha;
    const originalContent = Buffer.from(fileMeta.content, "base64").toString("utf8");

    // 2) Prepare safe search/replace
    // Make chapterTitle lowercase and strip "chapter N:" prefixes for matching ease
    const tidyTitle = chapterTitle.replace(/Chapter\s*\d+\s*:?\s*/i, "").trim();
    const safeTitle = tidyTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Regex looks for object { id: "old", title: "Chapter X: Title" } or { id:"old", title:"Title" }
    const regex = new RegExp(
      `(id\\s*:\\s*"(.*?)"\\s*,\\s*title\\s*:\\s*"(?:Chapter\\s*\\d+[:\\-]?\\s*)?${safeTitle}"\\s*)`,
      "i"
    );

    let updatedContent = originalContent;
    let updated = false;

    updatedContent = updatedContent.replace(regex, (match) => {
      const idMatch = match.match(/id\s*:\s*"(.*?)"/i);
      if (!idMatch) return match;
      const oldId = idMatch[1];
      if (oldId === newId) return match;
      updated = true;
      return match.replace(`id: "${oldId}"`, `id: "${newId}"`);
    });

    // Fallback: slightly different object formatting
    if (!updated) {
      const fallbackRegex = new RegExp(
        `\\{\\s*id\\s*:\\s*"(.*?)"\\s*,\\s*title\\s*:\\s*"(?:Chapter\\s*\\d+[:\\-]?\\s*)?${safeTitle}"\\s*\\}`,
        "i"
      );
      updatedContent = updatedContent.replace(fallbackRegex, (match) => {
        const idMatch = match.match(/id\s*:\s*"(.*?)"/i);
        if (!idMatch) return match;
        const oldId = idMatch[1];
        if (oldId === newId) return match;
        updated = true;
        return match.replace(`id: "${oldId}"`, `id: "${newId}"`);
      });
    }

    if (!updated) {
      return res.status(404).json({ error: "Chapter title not located in curriculum.js" });
    }

    // 3) Commit change back to GitHub
    const newContentBase64 = Buffer.from(updatedContent, "utf8").toString("base64");
    const putUrl = `${apiBase}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
    const commitMessage = `Automation: set id for "${chapterTitle}" -> ${newId}`;

    const putResp = await fetch(putUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        "User-Agent": "ready4exam-updater",
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: commitMessage,
        committer: { name: "ready4exam automation", email: "no-reply@ready4exam" },
        content: newContentBase64,
        sha: currentSha,
        branch
      })
    });

    const putJson = await putResp.json();
    if (!putResp.ok) {
      return res.status(500).json({ error: "Failed to commit updated file", details: putJson });
    }

    return res.status(200).json({ ok: true, commit: putJson.commit?.sha || putJson });

  } catch (err) {
    console.error("updateCurriculum error:", err);
    return res.status(500).json({ error: err.message });
  }
}
updateCurriculum.js
