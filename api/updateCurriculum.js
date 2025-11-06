// -------------------- /api/updateCurriculum.js --------------------
import { corsHeaders } from "./_cors.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  const headers = { ...corsHeaders(origin), "Content-Type": "application/json" };
  res.set(headers);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST allowed" });

  try {
    const { className, chapterTitle, newId } = req.body || {};
    if (!className || !chapterTitle || !newId)
      return res.status(400).json({ error: "Missing required fields" });

    const repo =
      className === "11"
        ? process.env.GITHUB_REPO_11
        : process.env.GITHUB_REPO_9 || "ready4exam-ninth";
    const owner = process.env.GITHUB_OWNER || "ready4exam";
    const token = process.env.GITHUB_TOKEN;

    if (!token) throw new Error("Missing GitHub token");

    const filePath = `template/js/curriculum.js`;
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;

    const currResp = await fetch(apiUrl, {
      headers: { Authorization: `token ${token}`, Accept: "application/vnd.github.v3+json" },
    });

    const currData = await currResp.json();
    if (!currResp.ok) throw new Error(currData.message || "Failed to fetch curriculum.js");

    const content = atob(currData.content);
    const newLine = `  "${chapterTitle}": "${newId}",\n`;
    const updatedContent = content.replace(/};\s*$/, `${newLine}};`);

    const commitResp = await fetch(apiUrl, {
      method: "PUT",
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
      body: JSON.stringify({
        message: `Update curriculum for ${chapterTitle}`,
        content: Buffer.from(updatedContent).toString("base64"),
        sha: currData.sha,
      }),
    });

    const commitResult = await commitResp.json();
    if (!commitResp.ok) throw new Error(commitResult.message || "Commit failed");

    console.log(`✅ curriculum.js updated for ${chapterTitle}`);
    return res.status(200).json({ message: "curriculum updated", commitResult });
  } catch (err) {
    console.error("❌ updateCurriculum error:", err);
    return res.status(500).json({ error: err.message });
  }
}
