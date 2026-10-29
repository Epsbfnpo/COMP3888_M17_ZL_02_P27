const { test } = require('node:test');
const assert = require('node:assert/strict');
// Normalization is pure. security.js imports db.js transitively; prevent a unit
// test from opening the configured application database merely on import.
const dbPath = require.resolve('../db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {} };
const { normalizeRelationships } = require('../relationships');
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
