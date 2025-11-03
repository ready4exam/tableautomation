// /api/updateCurriculum.js
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
    const filePath = "js/curriculum.js"; // ✅ Adjust if file path changes

    // 1️⃣ Fetch current curriculum.js from GitHub
    const fileRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!fileRes.ok) {
      throw new Error(`GitHub fetch failed: ${fileRes.statusText}`);
    }

    const fileData = await fileRes.json();
    const content = Buffer.from(fileData.content, "base64").toString("utf-8");

    // 2️⃣ Find the chapter block containing the given title (flexible search)
    const regex = new RegExp(
      `\\{[^\\}]*title:\\s*["'\`][^"'\`]*${chapterTitle}[^"'\`]*["'\`][^\\}]*\\}`,
      "i"
    );

// Title-agnostic and case-insensitive replacement
const updatedContent = content.replace(
  new RegExp(
    `\\{\\s*id:\\s*["'\`][^"'\`]+["'\`],\\s*title:\\s*["'\`][^"'\`]*${chapterTitle}[^"'\`]*["'\`]`,
    "i"
  ),
  (match) => {
    // Replace only the id inside the matched object
    return match.replace(/id:\s*["'`][^"'`]+["'`]/, `id: "${newId}"`);
  }
);

// If nothing changed, throw an explicit error
if (updatedContent === content) {
  throw new Error(
    `Chapter title "${chapterTitle}" not found in curriculum.js`
  );
}

    // 3️⃣ Commit the updated content back to GitHub
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

    return res
      .status(200)
      .json({ message: "✅ curriculum.js updated successfully" });
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
