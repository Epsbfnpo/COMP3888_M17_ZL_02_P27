const { test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');

test('registration validates email before database access and preserves valid account flows', async (t) => {
  const users = [];
  let queries = 0;
  const dbPath = require.resolve('../db');
  const previousDb = require.cache[dbPath];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
    async execute(sql, params) {
      queries++;
      if (sql.includes('FROM sessions')) return [[users[0]]];
      if (sql.includes('FROM users WHERE email')) {
        return [users.filter(user => user.email === params[0])];
      }
      if (sql.startsWith('INSERT INTO users')) {
        const user = { id: users.length + 1, username: params[0], email: params[1], password_hash: params[2] };
        users.push(user);
        return [{ insertId: user.id }];
      }
      if (sql.startsWith('INSERT INTO sessions')) return [{ affectedRows: 1 }];
      throw new Error('Unexpected database query');
    },
  } };
  const app = require('../server');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  async function request(route, body, method = 'POST', cookie) {
    const response = await fetch(base + route, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json(), headers: response.headers };
  }
  const account = { username: 'Synthetic user', email: 'author@example.com', password: 'Synthetic123!' };
  try {
    await t.test('malformed email returns 400 without querying or inserting users', async () => {
      for (const email of ['not-an-email', 'author@', '@example.com', 'author@example', 'a b@example.com', 'a@@example.com']) {
        const result = await request('/register', { ...account, email });
        assert.equal(result.status, 400, email);
        assert.equal(result.body.error, 'Please enter a valid email address');
      }
      assert.equal(queries, 0);
      assert.equal(users.length, 0);
    });
    await t.test('required fields and email length retain their validation', async () => {
      for (const email of ['', null, 123, 'a'.repeat(89) + '@example.com']) {
        assert.equal((await request('/register', { ...account, email })).status, 400);
      }
      assert.equal(queries, 0);
    });
    await t.test('valid email is normalized and password is hashed', async () => {
      const result = await request('/register', { ...account, email: '  Author@Example.COM  ' });
      assert.equal(result.status, 201);
      assert.equal(result.body.user.email, account.email);
      assert.equal(users.length, 1);
      assert.equal(await bcrypt.compare(account.password, users[0].password_hash), true);
      assert.equal(result.body.user.password_hash, undefined);
    });
    await t.test('duplicate account remains a conflict and valid login issues a session', async () => {
      assert.equal((await request('/register', account)).status, 409);
      assert.equal(users.length, 1);
      const result = await request('/login', account);
      assert.equal(result.status, 200);
      assert.match(result.headers.get('set-cookie'), /wb_session=.*HttpOnly/);
    });
    await t.test('profile rejects the same malformed address without updating the account', async () => {
      const result = await request('/api/users/1/profile', { ...account, email: 'not-an-email' }, 'PUT', 'wb_session=' + 'a'.repeat(64));
      assert.equal(result.status, 400);
      assert.equal(result.body.error, 'Please enter a valid email address');
      assert.equal(users[0].email, account.email);
    });
    await t.test('email at the 100-character limit remains accepted', async () => {
      const email = 'a'.repeat(88) + '@example.com';
      assert.equal(email.length, 100);
      assert.equal((await request('/register', { ...account, email })).status, 201);
    });
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    if (previousDb) require.cache[dbPath] = previousDb;
    else delete require.cache[dbPath];
  }
});
