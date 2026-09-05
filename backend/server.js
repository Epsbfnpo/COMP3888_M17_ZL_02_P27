const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
require('dotenv').config();

const db = require('./db');
const security = require('./security');

const app = express();
const port = Number(process.env.PORT) || 3001;
const saltRounds = 10;

app.use(cors({ origin: security.origin, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(security.session);
app.use(require('./content-api'));
app.use(require('./proposal-api'));
app.get('/auth/me', (req, res) => {
  security.loginRequired(req);
  res.json({ user: req.user });
});
app.post('/logout', async (req, res) => {
  if (req.tokenHash) await db.execute('DELETE FROM sessions WHERE token_hash=?', [req.tokenHash]);
  res.clearCookie('wb_session', security.cookieOptions);
  res.json({ message: 'Signed out' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/register', async (req, res) => {
  const body = req.body || {};
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!username || !email || !password) {
    return res.status(400).json({
      error: 'Username, email and password are required',
    });
  }

  if (username.length > 50 || email.length > 100) {
    return res.status(400).json({
      error: 'Username or email is too long',
    });
  }

  try {
    const [existingUsers] = await db.execute(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [email]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, saltRounds);
    const [result] = await db.execute(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
      [username, email, passwordHash]
    );

    return res.status(201).json({
      message: 'Registration successful',
      user: {
        id: result.insertId,
        username,
        email,
      },
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    console.error('Registration failed:', error.message);
    return res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/login', async (req, res) => {
  const body = req.body || {};
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const [users] = await db.execute(
      'SELECT id, username, email, password_hash, created_at FROM users WHERE email = ? LIMIT 1',
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = users[0];
    const passwordMatches = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    await security.issueSession(req, res, user.id);
    return res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        created_at: user.created_at,
      },
    });
  } catch (error) {
    console.error('Login failed:', error.message);
    return res.status(500).json({ error: 'Login failed' });
  }
});


app.put('/api/users/:id/profile', async (req, res) => {
  security.loginRequired(req);
  const userId = Number(req.params.id);
  if (userId !== req.user.id) security.fail(403, 'Only your own profile can be updated');

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({
      error: 'Invalid user id',
    });
  }

  const body = req.body || {};

  const username =
    typeof body.username === 'string'
      ? body.username.trim()
      : '';

  const email =
    typeof body.email === 'string'
      ? body.email.trim().toLowerCase()
      : '';

  const password =
    typeof body.password === 'string'
      ? body.password
      : '';

  if (!username || !email || !password) {
    return res.status(400).json({
      error: 'Username, email and current password are required',
    });
  }

  if (username.length > 50 || email.length > 100) {
    return res.status(400).json({
      error: 'Username or email is too long',
    });
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(email)) {
    return res.status(400).json({
      error: 'Please enter a valid email address',
    });
  }

  try {
    const [users] = await db.execute(
      `SELECT
        id,
        username,
        email,
        password_hash,
        created_at
      FROM users
      WHERE id = ?
      LIMIT 1`,
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        error: 'User not found',
      });
    }

    const user = users[0];

    const passwordMatches = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        error: 'Current password is incorrect',
      });
    }

    const [existingUsers] = await db.execute(
      `SELECT id
       FROM users
       WHERE email = ?
         AND id <> ?
       LIMIT 1`,
      [email, userId]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({
        error: 'An account with this email already exists',
      });
    }

    await db.execute(
      `UPDATE users
       SET username = ?, email = ?
       WHERE id = ?`,
      [username, email, userId]
    );

    const [updatedUsers] = await db.execute(
      `SELECT
        id,
        username,
        email,
        created_at
      FROM users
      WHERE id = ?
      LIMIT 1`,
      [userId]
    );

    return res.json({
      message: 'Profile updated successfully',
      user: updatedUsers[0],
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        error: 'An account with this email already exists',
      });
    }

    console.error('Profile update failed:', error.message);

    return res.status(500).json({
      error: 'Profile update failed',
    });
  }
});


app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error.status || 500;
  if (status >= 500) console.error(error);
  res.status(status).json({ error: status >= 500 ? 'Internal server error' : error.message });
});

if (require.main === module) {
  const server = app.listen(port);
  server.on('listening', () => console.log(`Backend server is running at http://localhost:${port}`));
  server.on('error', async error => {
    console.error('Backend could not listen:', error.message);
    process.exitCode = 1;
    await db.end();
  });
}


module.exports = app;
