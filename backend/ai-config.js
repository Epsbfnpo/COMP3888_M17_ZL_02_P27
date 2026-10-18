function getGeminiApiKey(env = process.env) {
  const value = env.GEMINI_API_KEY;
  if (typeof value !== 'string' || !value.trim()) {
    const error = new Error('Gemini is not configured. Set GEMINI_API_KEY in the backend environment.');
    error.code = 'AI_NOT_CONFIGURED';
    throw error;
  }
  return value.trim();
}

module.exports = { getGeminiApiKey };
