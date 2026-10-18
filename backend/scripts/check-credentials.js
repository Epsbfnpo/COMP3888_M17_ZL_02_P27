const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const { getGeminiApiKey } = require('../ai-config');

try {
  getGeminiApiKey();
  console.log('GEMINI_API_KEY is configured. No API request was made; validity and quota were not checked.');
} catch {
  console.error('GEMINI_API_KEY is not configured. Set it in backend/.env or inject it into the backend environment.');
  process.exitCode = 1;
}
