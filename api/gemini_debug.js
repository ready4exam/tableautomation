// File: debug.js
import dotenv from "dotenv";
dotenv.config();

const apiKey = process.env.google_api;

if (!apiKey) {
  console.error("❌ No Google API key found in environment variables.");
  process.exit(1);
}

console.log("✅ Google API key detected.");
console.log("Key length:", apiKey.length);
console.log("First 10 chars:", apiKey.slice(0, 10) + "**********");
