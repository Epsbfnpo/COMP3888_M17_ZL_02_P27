const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
require('dotenv').config();

const db = require('./db');

const app = express();
const port = Number(process.env.PORT) || 3001;
const saltRounds = 10;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Development/testing route. It deliberately excludes password_hash.
app.get('/users', async (req, res) => {
  try {
    const [users] = await db.execute(
      'SELECT id, username, email, created_at FROM users'
    );
    res.json(users);
  } catch (error) {
    console.error('Could not fetch users:', error.message);
    res.status(500).json({ error: 'Could not fetch users' });
  }
});

app.get('/api/worlds', async (req, res) => {
  try {
    const [worlds] = await db.execute(`
      SELECT
        w.id,
        w.name,
        w.description,
        w.updated_at,
        u.id AS owner_id,
        u.username AS owner_username,
        COUNT(e.id) AS entity_count
      FROM worlds w
      JOIN users u ON u.id = w.owner_id
      LEFT JOIN entities e ON e.world_id = w.id
      GROUP BY
        w.id,
        w.name,
        w.description,
        w.updated_at,
        u.id,
        u.username
      ORDER BY w.updated_at DESC
    `);

    return res.json({ worlds });
  } catch (error) {
    console.error('Could not fetch worlds:', error.message);
    return res.status(500).json({ error: 'Could not fetch worlds' });
  }
});

app.get('/api/tags', async (req, res) => {
  try {
    const [tags] = await db.execute(
      'SELECT name FROM tags ORDER BY name ASC'
    );
    return res.json({ tags: tags.map((tag) => tag.name) });
  } catch (error) {
    console.error('Could not fetch tags:', error.message);
    return res.status(500).json({ error: 'Could not fetch tags' });
  }
});

app.get('/api/entities/search', async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const tag = typeof req.query.tag === 'string' ? req.query.tag.trim() : '';

  try {
    const keyword = `%${query}%`;
    const tagFilter = `%${tag}%`;
    const [entities] = await db.execute(
      `SELECT
        e.id,
        e.name,
        e.entity_type AS type,
        e.description,
        w.id AS world_id,
        w.name AS world_name,
        GROUP_CONCAT(DISTINCT t.name ORDER BY t.name SEPARATOR ',') AS tag_names
      FROM entities e
      JOIN worlds w ON w.id = e.world_id
      LEFT JOIN entity_tags et ON et.entity_id = e.id
      LEFT JOIN tags t ON t.id = et.tag_id
      WHERE
        (? = '' OR e.name LIKE ? OR e.description LIKE ? OR e.entity_type LIKE ? OR t.name LIKE ? OR w.name LIKE ?)
        AND (? = '' OR EXISTS (
          SELECT 1
          FROM entity_tags selected_et
          JOIN tags selected_t ON selected_t.id = selected_et.tag_id
          WHERE selected_et.entity_id = e.id AND selected_t.name LIKE ?
        ))
      GROUP BY e.id, e.name, e.entity_type, e.description, w.id, w.name
      ORDER BY e.updated_at DESC, e.name ASC`,
      [query, keyword, keyword, keyword, keyword, keyword, tag, tagFilter]
    );

    return res.json({
      results: entities.map((entity) => ({
        id: entity.id,
        name: entity.name,
        type: entity.type,
        description: entity.description || '',
        tags: entity.tag_names ? entity.tag_names.split(',') : [],
        world: {
          id: entity.world_id,
          name: entity.world_name,
        },
      })),
    });
  } catch (error) {
    console.error('Entity search failed:', error.message);
    return res.status(500).json({ error: 'Could not search entities' });
  }
});

app.get('/api/entities/:id', async (req, res) => {
  const entityId = Number(req.params.id);

  // Check whether the id is valid
  if (!Number.isInteger(entityId) || entityId <= 0) {
    return res.status(400).json({ error: 'Invalid entity id' });
  }

  try {
    const [entities] = await db.execute(
      `SELECT
        e.id,
        e.name,
        e.entity_type AS type,
        e.description,
        e.created_at,
        e.updated_at,

        w.id AS world_id,
        w.name AS world_name,

        u.id AS creator_id,
        u.username AS creator_username,

        GROUP_CONCAT(
          DISTINCT t.name
          ORDER BY t.name
          SEPARATOR ','
        ) AS tag_names

      FROM entities e

      JOIN worlds w
        ON w.id = e.world_id

      LEFT JOIN users u
        ON u.id = e.created_by

      LEFT JOIN entity_tags et
        ON et.entity_id = e.id

      LEFT JOIN tags t
        ON t.id = et.tag_id

      WHERE e.id = ?

      GROUP BY
        e.id,
        e.name,
        e.entity_type,
        e.description,
        e.created_at,
        e.updated_at,
        w.id,
        w.name,
        u.id,
        u.username

      LIMIT 1`,
      [entityId]
    );

    if (entities.length === 0) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    const entity = entities[0];

    // Fetch all relationships connected to this entity
    const [relationships] = await db.execute(
      `SELECT
        r.id,
        r.relationship_type,
        r.description,

        r.source_entity_id,
        source.name AS source_name,
        source.entity_type AS source_type,

        r.target_entity_id,
        target.name AS target_name,
        target.entity_type AS target_type

      FROM relationships r

      JOIN entities source
        ON source.id = r.source_entity_id

      JOIN entities target
        ON target.id = r.target_entity_id

      WHERE r.source_entity_id = ?
        OR r.target_entity_id = ?

      ORDER BY r.created_at ASC`,
      [entityId, entityId]
    );

    const formattedRelationships = relationships.map((relationship) => {
      const isOutgoing = relationship.source_entity_id === entityId;

      return {
        id: relationship.id,
        type: relationship.relationship_type,
        description: relationship.description || '',
        direction: isOutgoing ? 'outgoing' : 'incoming',

        entity: isOutgoing
          ? {
              id: relationship.target_entity_id,
              name: relationship.target_name,
              type: relationship.target_type,
            }
          : {
              id: relationship.source_entity_id,
              name: relationship.source_name,
              type: relationship.source_type,
            },
      };
    });
    return res.json({
      entity: {
        id: entity.id,
        name: entity.name,
        type: entity.type,
        description: entity.description || '',
        created_at: entity.created_at,
        updated_at: entity.updated_at,

        world: {
          id: entity.world_id,
          name: entity.world_name,
        },

        creator: entity.creator_id
          ? {
              id: entity.creator_id,
              username: entity.creator_username,
            }
          : null,

        tags: entity.tag_names
          ? entity.tag_names.split(',')
          : [],
        relationships: formattedRelationships,
      },
    });
  } catch (error) {
    console.error('Could not fetch entity:', error.message);
    return res.status(500).json({
      error: 'Could not fetch entity',
    });
  }
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
  const userId = Number(req.params.id);

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


app.listen(port, () => {
  console.log(`Backend server is running at http://localhost:${port}`);
});
