import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Initialize Firebase Admin (Only once)
if (!getApps().length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || "{}");
  initializeApp({
    credential: cert(serviceAccount),
  });
}

const db = getFirestore();

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { meta, data } = req.body;

    // Extract fields: grade, subject, topic
    const grade = meta.classId || "9"; // Default if missing
    const subject = meta.subject || "unknown";
    const topic = meta.topicSlug || meta.chapter || "unknown";

    // Standardize Document ID
    // 1. Subject Slug: Lowercase, take first word (e.g., "Social Science" -> "social")
    const subjectSlug = subject.toLowerCase().split(" ")[0];

    // 2. Topic Slug: Lowercase, replace spaces with underscores (e.g., "The French Revolution" -> "the_french_revolution")
    // Note: meta.topicSlug might already be slugified by frontend, but we ensure it here.
    const topicSlug = topic.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

    const docId = `${grade}_${subjectSlug}_${topicSlug}`;

    console.log(`Storing summary for ${docId}`);

    // Store in Firestore
    await db.collection("ncert_summaries").doc(docId).set(data, { merge: true });

    return res.status(200).json({ success: true, id: docId });
  } catch (error) {
    console.error("Error storing summary:", error);
    return res.status(500).json({ error: error.message });
  }
}
