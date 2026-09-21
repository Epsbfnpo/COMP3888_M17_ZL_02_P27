const { fail } = require('./security');

function normalizeRelationships(value) {
  if (!Array.isArray(value) || value.length > 50) fail(400, 'Use at most 50 outgoing relationships');
  const keys = new Set();
  return value.map(row => {
    if (!row || !Number.isSafeInteger(row.targetEntityId) || row.targetEntityId < 1 ||
      typeof row.type !== 'string' || typeof (row.description ?? '') !== 'string') fail(400, 'Invalid relationship');
    const type = relationshipName(row.type);
    const reverseName = row.reverseName == null ? null : relationshipName(row.reverseName);
    if ((row.description || '').length > 10000) fail(400, 'Invalid relationship description');
    const key = `${row.targetEntityId}:${type.toLowerCase()}`;
    if (keys.has(key)) fail(400, 'Duplicate relationship');
    keys.add(key);
    return { targetEntityId: row.targetEntityId, type, reverseName, description: row.description || '' };
  });
}

function relationshipName(value) {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/u.test(value)) fail(400, 'Invalid relationship name');
  const name = value.trim().normalize('NFC').replace(/\s+/gu, ' ');
  if (!name || name.length > 100) fail(400, 'Relationship names must contain 1 to 100 characters');
  return name;
}

async function outgoing(c, entityId, worldId) {
  const [rows] = await c.execute(`SELECT r.target_entity_id AS targetEntityId,r.relationship_type AS type,
    r.reverse_name AS reverseName,COALESCE(r.description,'') AS description,t.name AS targetName FROM relationships r
    JOIN entities t ON t.id=r.target_entity_id AND t.world_id=r.world_id
    WHERE r.source_entity_id=? AND r.world_id=? ORDER BY r.id`, [entityId, worldId]);
  return rows;
}

async function validateTargets(c, rows, worldId, sourceId) {
  if (rows === undefined) return;
  for (const row of rows) {
    if (row.targetEntityId === sourceId) fail(400, 'An entity cannot relate to itself');
    const [[target]] = await c.execute('SELECT id FROM entities WHERE id=? AND world_id=? AND deleted_at IS NULL', [row.targetEntityId, worldId]);
    if (!target) fail(409, `Relationship target #${row.targetEntityId} is unavailable in this world`);
  }
}

async function replaceOutgoing(c, rows, worldId, sourceId) {
  if (rows === undefined) return;
  await validateTargets(c, rows, worldId, sourceId);
  await c.execute('DELETE FROM relationships WHERE source_entity_id=? AND world_id=?', [sourceId, worldId]);
  for (const row of rows) {
    try {
      await c.execute(`INSERT INTO relationships
        (world_id,source_entity_id,target_entity_id,relationship_type,reverse_name,description) VALUES (?,?,?,?,?,?)`,
      [worldId, sourceId, row.targetEntityId, row.type, row.reverseName ?? null, row.description]);
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') fail(400, 'Duplicate relationship');
      throw error;
    }
  }
}

module.exports = { normalizeRelationships, outgoing, validateTargets, replaceOutgoing };
