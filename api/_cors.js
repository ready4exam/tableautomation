// -------------------- /api/_cors.js --------------------
export function corsHeaders(origin) {
  const allowedOrigins = [
    "https://ready4exam.github.io",
    "https://ready4exam-master-automation.vercel.app",
    "https://tableautomation-5iuc-git-main-ready4exams-projects.vercel.app",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
  ];

  return {
    "Access-Control-Allow-Origin": allowedOrigins.includes(origin)
      ? origin
      : "https://ready4exam.github.io",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
