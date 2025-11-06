// /api/updateCurriculum.js
export const config = { runtime: "nodejs" };

function maskToken(tok) {
  if (!tok) return "<no-token>";
  return tok.length > 10 ? `${tok.slice(0,6)}...${tok.slice(-4)}` : "<token>";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST requests allowed" });
  }

  try {
    const { chapterTitle, newId, classNumber } = req.body || {};
    if (!chapterTitle || !newId) {
      return res.status(400).json({ error: "Missing chapterTitle or newId" });
    }

    // accept either env var name (PAT or token)
    const token = process.env.GITHUB_TOKEN || process.env.PERSONAL_ACCESS_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    if (!token) {
      console.error("No GitHub token found in env (GITHUB_TOKEN or PERSONAL_ACCESS_TOKEN).");
      return res.status(500).json({ error: "Server misconfiguration: missing GitHub token" });
    }
    console.log("Using GitHub token:", maskToken(token));
    console.log("GITHUB_OWNER:", owner);

    // dynamic repo mapping
    let repo;
    switch (String(classNumber)) {
      case "9":
        repo = "ninth"; // your existing repo path under org: ready4exam/ninth
        break;
      case "10":
        repo = "ready4exam-10";
        break;
      case "11":
        repo = "ready4exam-11";
        break;
      case "12":
        repo = "ready4exam-12";
        break;
      default:
        repo = process.env.GITHUB_REPO || "ready4exam-test";
    }

    const filePath = "js/curriculum.js";
    const fetchUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
    console.log("Fetching:", fetchUrl);

    const fileRes = await fetch(fetchUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    });

    const fileText = await fileRes.text(); // intentionally not json() so we can log HTML errors
    if (!fileRes.ok) {
      console.error("GitHub fetch failed:", fileRes.status, fileRes.statusText, fileText);
      return res.status(500).json({
        error: `GitHub fetch failed: ${fileRes.status} ${fileRes.statusText}`,
        details: fileText.slice(0, 800), // return first 800 chars for visibility
      });
    }

    const fileData = JSON.parse(fileText);
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
          console.log("Matched chapter in curriculum:", titleText);
          return match.replace(/id:\s*["'`][^"'`]+["'`]/, `id: "${newId}"`);
        }
        return match;
      }
    );

    if (!found) {
      console.error("Chapter not found in curriculum:", chapterTitle);
      return res.status(404).json({ error: `Chapter "${chapterTitle}" not found in ${repo}` });
    }

    // commit
    const updateRes = await fetch(fetchUrl, {
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
    });

    const updateText = await updateRes.text();
    if (!updateRes.ok) {
      console.error("GitHub update failed:", updateRes.status, updateRes.statusText, updateText.slice(0, 1000));
      return res.status(500).json({
        error: `GitHub update failed: ${updateRes.status} ${updateRes.statusText}`,
        details: updateText.slice(0, 800),
      });
    }

    const updateData = JSON.parse(updateText);
    console.log("Commit successful:", updateData.commit?.sha);
    return res.status(200).json({
      message: "✅ curriculum.js updated successfully",
      commitSHA: updateData.commit?.sha || null,
      repoUsed: repo,
    });
  } catch (err) {
    console.error("updateCurriculum error:", err);
    return res.status(500).json({ error: err.message });
  }
}
