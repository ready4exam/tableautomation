// /api/updateCurriculum.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST requests allowed" });
  }

  try {
    const { className, chapterTitle, newId } = req.body;
    if (!className || !chapterTitle || !newId) {
      return res.status(400).json({
        error: "Missing required fields: className, chapterTitle, or newId",
      });
    }

    // 🧩 Pick correct repo dynamically based on class
    const owner = process.env.GITHUB_OWNER || "ready4exam";
    let repo;

    switch (String(className).trim()) {
      case "9":
      case "09":
      case "class9":
      case "Class 9":
        repo = "ninth";
        break;
      case "11":
      case "Class 11":
      case "eleventh":
        repo = "eleventh";
        break;
      case "12":
      case "Class 12":
      case "twelfth":
        repo = "twelfth";
        break;
      default:
        repo = process.env.GITHUB_REPO; // fallback
        break;
    }

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error("Missing GITHUB_TOKEN in environment");
    }

    const filePath = "js/curriculum.js"; // ✅ fixed standard path

    console.log(`🪶 Updating ${owner}/${repo}/${filePath} ...`);

    // 1️⃣ Fetch existing curriculum.js
    const fileRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!fileRes.ok) {
      const errText = await fileRes.text();
      throw new Error(`GitHub fetch failed: ${fileRes.statusText} (${errText})`);
    }

    const fileData = await fileRes.json();
    const content = Buffer.from(fileData.content, "base64").toString("utf-8");

    // 2️⃣ Normalize title
    const normalizedTitle = chapterTitle
      .replace(/chapter\s*\d*[:\-]*/i, "")
      .trim()
      .toLowerCase();

    let found = false;

    // 3️⃣ Replace old ID with new table name
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

    // 4️⃣ Push commit
    const updateRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: `Auto-update for "${chapterTitle}" → "${newId}" (Class ${className})`,
          content: Buffer.from(updatedContent).toString("base64"),
          sha: fileData.sha,
        }),
      }
    );

    if (!updateRes.ok) {
      const text = await updateRes.text();
      throw new Error(`GitHub update failed: ${updateRes.statusText} - ${text}`);
    }

    const updateData = await updateRes.json();
    console.log("✅ curriculum.js updated successfully:", updateData.commit?.sha);

    return res.status(200).json({
      message: "✅ curriculum.js updated successfully",
      commitSHA: updateData.commit?.sha || null,
    });
  } catch (error) {
    console.error("❌ updateCurriculum error:", error.message);
    return res.status(500).json({ error: error.message });
  }
}
