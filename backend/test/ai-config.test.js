const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getGeminiApiKey } = require('../ai-config');

test('missing, empty and non-string credentials are rejected without exposing values', () => {
  for (const value of [undefined, '', '  ', null, 123, {}]) {
    assert.throws(() => getGeminiApiKey({ GEMINI_API_KEY: value }), {
      code: 'AI_NOT_CONFIGURED',
      message: 'Gemini is not configured. Set GEMINI_API_KEY in the backend environment.',
    });
  }
});

test('reads only the server-side Gemini variable and trims surrounding whitespace', () => {
  assert.equal(getGeminiApiKey({ GEMINI_API_KEY: '  synthetic-test-value  ' }), 'synthetic-test-value');
  assert.throws(() => getGeminiApiKey({ VITE_GEMINI_API_KEY: 'synthetic-test-value' }));
  assert.throws(() => getGeminiApiKey({ GOOGLE_API_KEY: 'synthetic-test-value' }));
});

test('reads current environment values without caching credentials', () => {
  const previous = process.env.GEMINI_API_KEY;
  try {
    process.env.GEMINI_API_KEY = 'synthetic-first-value';
    assert.equal(getGeminiApiKey(), 'synthetic-first-value');
    process.env.GEMINI_API_KEY = 'synthetic-rotated-value';
    assert.equal(getGeminiApiKey(), 'synthetic-rotated-value');
  } finally {
    if (previous === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previous;
  }
});
