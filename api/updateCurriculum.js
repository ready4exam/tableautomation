export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(200).json({ message: "updateCurriculum API is live ✅ (GET request ok)" });
    }

    const { chapterTitle, newId } = req.body || {};

    return res.status(200).json({
      message: "updateCurriculum API working ✅ (POST request ok)",
      received: { chapterTitle, newId },
    });
  } catch (err) {
    console.error("API error:", err);
    return res.status(500).json({ error: err.message });
  }
}
