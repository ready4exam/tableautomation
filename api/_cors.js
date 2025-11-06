// -------------------- /api/_cors.js --------------------

// ✅ Define all allowed frontend origins
const allowedOrigins = [
  "https://ready4exam.github.io",
  "https://ready4exam.github.io/tableautomation",
  "https://ready4exam.github.io/ninth",
  "https://ready4exam.github.io/eleventh",
  "https://ready4exam-master-automation.vercel.app",
  "https://tableautomation-5iuc-git-main-ready4exams-projects.vercel.app",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
];

/**
 * Returns safe CORS headers for Vercel edge functions
 * allowing only approved origins
 */
export function corsHeaders(origin) {
  const matchedOrigin =
    allowedOrigins.find((allowed) => origin && origin.startsWith(allowed)) ||
    "https://ready4exam.github.io";

  return {
    "Access-Control-Allow-Origin": matchedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400", // cache preflight for 24h
  };
}
