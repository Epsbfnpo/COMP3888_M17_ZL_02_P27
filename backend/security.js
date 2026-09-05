const crypto = require('node:crypto');
const db = require('./db');
const origin = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' };
const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');
function fail(status, message) { throw Object.assign(new Error(message), { status }); }
function id(value) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) fail(400, 'Invalid id or version');
  return n;
}
function loginRequired(req) { if (!req.user) fail(401, 'Sign in required'); }
async function session(req, res, next) {
  try {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.get('origin') && req.get('origin') !== origin) fail(403, 'Untrusted origin');
      if (!req.is('application/json')) fail(415, 'Use application/json');
    }
    const token = /(?:^|;\s*)wb_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
    if (token) {
      req.tokenHash = hash(token);
      const [[user]] = await db.execute(`SELECT u.id,u.username,u.email,u.created_at FROM sessions s
        JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>NOW()`, [req.tokenHash]);
      req.user = user;
    }
    next();
  } catch (error) { next(error); }
}
async function issueSession(req, res, userId) {
  if (req.tokenHash) await db.execute('DELETE FROM sessions WHERE token_hash=?', [req.tokenHash]);
  const token = crypto.randomBytes(32).toString('hex');
  await db.execute('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,DATE_ADD(NOW(), INTERVAL 7 DAY))', [hash(token), userId]);
  res.cookie('wb_session', token, { ...cookieOptions, maxAge: 7 * 86400000 });
}
function visible(alias = 'w') {
  return `(${alias}.visibility='public' OR ${alias}.owner_id=? OR EXISTS
    (SELECT 1 FROM world_members vm WHERE vm.world_id=${alias}.id AND vm.user_id=? AND vm.status='approved'))`;
}
async function access(conn, worldId, user, roles, lock = false) {
  const [[world]] = await conn.execute('SELECT * FROM worlds WHERE id=?' + (lock ? ' FOR UPDATE' : ''), [id(worldId)]);
  if (!world) fail(404, 'World not found');
  const [[member]] = user ? await conn.execute("SELECT role FROM world_members WHERE world_id=? AND user_id=? AND status='approved'", [world.id, user.id]) : [[]];
  const role = user?.id === world.owner_id ? 'owner' : member?.role || null;
  if (world.visibility !== 'public' && !role) fail(404, 'World not found');
  if (roles && !roles.includes(role)) fail(user ? 403 : 401, 'Permission denied');
  return { ...world, role };
}
const writers = ['owner', 'manager', 'author'];
const managers = ['owner', 'manager'];
function actions(role) {
  return { propose: writers.includes(role), edit: managers.includes(role), review: managers.includes(role),
    manageMembers: managers.includes(role), manageWorld: role === 'owner' };
}
async function transaction(work) {
  const c = await db.getConnection();
  try { await c.beginTransaction(); const result = await work(c); await c.commit(); return result; }
  catch (e) { await c.rollback(); throw e; } finally { c.release(); }
}
module.exports = { origin, cookieOptions, session, issueSession, fail, id, loginRequired, visible, access, writers, managers, actions, transaction };
