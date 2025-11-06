// File: /api/updateCurriculum.js
import { Octokit } from "@octokit/rest";

export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 200 });
  if (req.method !== "POST")
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405 });

  const { className, chapterTitle, newId } = await req.json();
  if (!className || !chapterTitle || !newId)
    return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400 });

  const token = process.env.PERSONAL_ACCESS_TOKEN;
  if (!token)
    return new Response(JSON.stringify({ error: "Missing GitHub token" }), { status: 500 });

  const owner = process.env.GITHUB_OWNER || "ready4exam";
  let repo = "ready4exam-test";

  // ✅ Choose repo based on class
  const c = parseInt(className);
  if (c === 9) repo = "ready4exam-ninth";
  else if (c === 11) repo = "ready4exam-eleventh";

  const octokit = new Octokit({ auth: token });

  try {
    const path = "js/curriculum.js";
    const { data: file } = await octokit.repos.getContent({ owner, repo, path });
    const content = Buffer.from(file.content, "base64").toString("utf-8");

    const updated = content.replace(
      /(\{[^}]*title:\s*['"`])([^'"`]+)(['"`]\s*,\s*id:\s*['"`])([^'"`]+)(['"`]\s*\})/gi,
      (m, p1, title, p3, id, p5) =>
        title === chapterTitle ? `${p1}${title}${p3}${newId}${p5}` : m
    );

    const commit = await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message: `Update ${chapterTitle} → ${newId}`,
      content: Buffer.from(updated, "utf-8").toString("base64"),
      sha: file.sha,
    });

    return new Response(JSON.stringify({ success: true, commit: commit.data.commit.sha }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
