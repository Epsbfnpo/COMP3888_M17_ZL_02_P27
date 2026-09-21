const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeRelationships } = require('../relationships');
after(async () => {
  const db = require('../db');
  try { await db.query('SELECT 1'); } finally { await db.end(); }
});
const row = { targetEntityId: 1, type: '  Works   with & supports  ', description: '' };

test('custom relationship labels preserve case and punctuation without domain mappings', () => {
  assert.deepEqual(normalizeRelationships([row])[0], { ...row, type: 'Works with & supports', reverseName: null });
  assert.equal(normalizeRelationships([{ ...row, type: 'PARENT_OF' }])[0].reverseName, null);
  assert.equal(normalizeRelationships([{ ...row, type: 'Caf\u0065\u0301' }])[0].type, 'Caf\u00e9');
});
test('two-way labels can match or differ; null returns to one-way', () => {
  for (const reverseName of ['Works with & supports', 'Supported by', null]) {
    assert.equal(normalizeRelationships([{ ...row, reverseName }])[0].reverseName, reverseName);
  }
});
test('reject malformed names and case-insensitive duplicate links', () => {
  for (const reverseName of ['', ' ', true, {}, 'a\nb', 'x'.repeat(101)]) {
    assert.throws(() => normalizeRelationships([{ ...row, reverseName }]));
  }
  assert.throws(() => normalizeRelationships([{ ...row, type: 'a\u0000b' }]));
  assert.throws(() => normalizeRelationships([row, { ...row, type: 'works with & supports' }]));
});
