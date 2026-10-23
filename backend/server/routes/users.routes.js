const crypto = require('node:crypto');
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const { dbPool, dbUsersStore, ROLE_MAP } = require('../db');
const { recordAuditLog } = require('../services/audit.service');

const router = express.Router();
const AVATAR_REGEX = /^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/;

function resolveAvatarExtension(rawExt) {
  if (rawExt === 'jpeg') return 'jpg';
  if (rawExt === 'svg+xml') return 'svg';
  return rawExt;
}

function saveAvatarImage(avatarDataUrl, userId) {
  if (!avatarDataUrl || typeof avatarDataUrl !== 'string') return null;
  if (!avatarDataUrl.startsWith('data:image/')) {
    return avatarDataUrl;
  }
  try {
    const matches = AVATAR_REGEX.exec(avatarDataUrl);
    if (!matches) return null;
    const ext = resolveAvatarExtension(matches[1].toLowerCase());
    const imageBuffer = Buffer.from(matches[2], 'base64');
    const fileName = `avatar_${String(userId).replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}.${ext}`;
    const relativeUrl = `/uploads/avatars/${fileName}`;

    const targetDirs = [
      path.resolve(__dirname, '../../frontend/public/uploads/avatars'),
      path.resolve(__dirname, '../uploads/avatars'),
      path.resolve('public/uploads/avatars'),
      path.resolve('uploads/avatars'),
    ];

    for (const dir of targetDirs) {
      try {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, fileName), imageBuffer);
      } catch (e) {
        console.log('Avatar write notice:', e?.message || e);
      }
    }
    return relativeUrl;
  } catch (err) {
    console.error('Failed to parse avatar image:', err?.message || err);
    return null;
  }
}

router.get('/users', async (_req, res) => {
  if (!dbPool) {
    return res.json(dbUsersStore);
  }
  try {
    const [rows] = await dbPool.query(
      `SELECT u.id, u.email, u.full_name, u.role_id, u.is_active, u.avatar_url, u.created_at,
              r.name as role_name, r.code as role_code
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       ORDER BY u.id ASC`
    );
    const users = rows.map((r) => {
      const roleName = r.role_name || (r.role_code ? r.role_code.replaceAll('_', ' ') : 'Designer');
      return {
        id: String(r.id),
        email: r.email,
        fullName: r.full_name,
        role: roleName,
        department: r.role_code ? r.role_code.replaceAll('_', ' ') : 'Operations',
        isActive: Boolean(r.is_active),
        avatarUrl: r.avatar_url || undefined,
        lastLoginAt: 'Recently',
        createdAt: r.created_at ? new Date(r.created_at).toISOString().split('T')[0] : '2025-01-01',
      };
    });
    return res.json(users);
  } catch (e) {
    console.error('[MySQL DB Error] GET /users query failed, falling back to memory store:', e?.message || e);
    return res.json(dbUsersStore);
  }
});

router.get('/roles', async (_req, res) => {
  if (!dbPool) {
    return res.json(Object.values(ROLE_MAP));
  }
  try {
    const [rows] = await dbPool.query('SELECT id, name, code, description FROM roles ORDER BY id ASC');
    return res.json(rows);
  } catch (e) {
    console.error('[MySQL DB Error] GET /roles query failed, falling back to memory store:', e?.message || e);
    return res.json(Object.values(ROLE_MAP));
  }
});

function resolveRoleId(role) {
  if (!role) return 1;
  const normalized = String(role).toUpperCase().trim().replace(/[\s-]+/g, '_');
  if (ROLE_MAP[normalized]) return ROLE_MAP[normalized].id;
  const found = Object.values(ROLE_MAP).find(
    (r) => r.code === normalized || r.name.toUpperCase() === String(role).toUpperCase()
  );
  return found ? found.id : 1;
}

async function checkUserConflict(normalizedEmail) {
  if (dbPool) {
    try {
      const [existing] = await dbPool.query('SELECT id, email FROM users WHERE LOWER(email) = ?', [normalizedEmail]);
      if (Array.isArray(existing) && existing.length > 0) {
        return true;
      }
    } catch (e) {
      console.error('[MySQL DB Error] Check existing user query failed:', e?.message || e);
    }
  }
  return dbUsersStore.some((u) => u.email && u.email.toLowerCase() === normalizedEmail);
}

async function insertUserToDb(userData) {
  if (!dbPool) return null;
  const [insertRes] = await dbPool.query(
    `INSERT INTO users (email, password_hash, full_name, role_id, is_active, avatar_url)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userData.normalizedEmail, userData.hashedPassword, userData.fullName, userData.targetRoleId, userData.userActive ? 1 : 0, userData.savedAvatar]
  );
  if (!insertRes?.insertId) return null;

  const insertedUserId = insertRes.insertId;
  console.log(`[MySQL DB] Successfully inserted new user ${userData.normalizedEmail} (ID: ${insertedUserId}) into table 'users'.`);
  try {
    await dbPool.query(
      `INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
       VALUES (?, ?, ?, ?, 0, NOW())`,
      [insertedUserId, 'Welcome to MarkOps Platform', `Your ${userData.role} user account has been successfully provisioned.`, 'SUCCESS']
    );
  } catch (notifErr) {
    console.error('[MySQL DB Notice] Notification insert skipped:', notifErr?.message || notifErr);
  }
  return insertedUserId;
}

router.post('/users', async (req, res) => {
  const { email, fullName, role, department, isActive, password, avatarUrl, avatarDataUrl } = req.body;
  if (!email || !fullName || !role) {
    return res.status(400).json({ error: 'Email, Full Name, and Role are required fields.' });
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  if (normalizedEmail === 'admin@markops.io') {
    return res.status(400).json({ error: 'Cannot create a user with the System Administrator email (admin@markops.io).' });
  }

  const hasConflict = await checkUserConflict(normalizedEmail);
  if (hasConflict) {
    return res.status(409).json({ error: `A user with email "${normalizedEmail}" already exists. Please use a unique email address.` });
  }

  const userDept = String(department || 'General Operations').trim();
  const userActive = isActive !== undefined ? Boolean(isActive) : true;
  const targetRoleId = resolveRoleId(role);
  const savedAvatar = saveAvatarImage(avatarDataUrl, normalizedEmail.split('@')[0]) || avatarUrl || null;
  const rawPassword = password && String(password).length >= 1 ? String(password) : 'admin123';
  const hashedPassword = await bcrypt.hash(rawPassword, 10);

  let insertedUserId = null;
  try {
    insertedUserId = await insertUserToDb({
      normalizedEmail,
      hashedPassword,
      fullName: String(fullName).trim(),
      targetRoleId,
      userActive,
      savedAvatar,
      role: String(role)
    });
  } catch (e) {
    console.error('[MySQL DB Error] INSERT user query failed:', e?.message || e);
    if (e.code === 'ER_DUP_ENTRY' || e.errno === 1062) {
      return res.status(409).json({ error: `A user with email "${normalizedEmail}" already exists.` });
    }
    return res.status(500).json({ error: 'Failed to insert user into database.' });
  }

  const finalId = insertedUserId ? String(insertedUserId) : `usr_${crypto.randomBytes(5).toString('hex')}`;
  const newUser = {
    id: finalId,
    email: normalizedEmail,
    fullName: String(fullName).trim(),
    role: String(role),
    department: userDept,
    isActive: userActive,
    avatarUrl: savedAvatar || undefined,
    lastLoginAt: 'Never',
    createdAt: new Date().toISOString().split('T')[0],
  };

  dbUsersStore.push(newUser);

  await recordAuditLog(dbPool, {
    actorId: '1',
    actorEmail: 'admin@markops.io',
    action: 'USER_CREATED',
    entityType: 'User',
    entityId: finalId,
    newState: { email: normalizedEmail, fullName: newUser.fullName, role: newUser.role, department: userDept, isActive: userActive },
    ipAddress: req.ip || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'],
  });

  return res.status(201).json(newUser);
});

router.delete('/users/:id', async (req, res) => {
  const userId = req.params.id;

  if (userId === 'usr_admin_01' || userId === '1') {
    return res.status(403).json({ error: 'System Administrator account cannot be deleted.' });
  }

  const index = dbUsersStore.findIndex((u) => String(u.id) === String(userId));
  const deletedUser = index !== -1 ? dbUsersStore.splice(index, 1)[0] : { id: userId };

  if (dbPool) {
    try {
      const numId = Number.parseInt(userId, 10);
      if (!Number.isNaN(numId)) {
        await dbPool.query('DELETE FROM users WHERE id = ?', [numId]);
        console.log(`[MySQL DB] Deleted user ID ${numId} from table 'users'.`);
      } else {
        await dbPool.query('DELETE FROM users WHERE email = ?', [userId]);
        console.log(`[MySQL DB] Deleted user by key/email ${userId} from table 'users'.`);
      }
    } catch (e) {
      console.error('[MySQL DB Error] DELETE user failed:', e?.message || e);
    }
  }

  await recordAuditLog(dbPool, {
    actorId: '1',
    actorEmail: 'admin@markops.io',
    action: 'USER_DELETED',
    entityType: 'User',
    entityId: userId,
    previousState: deletedUser,
    newState: null,
    ipAddress: req.ip || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'],
  });

  return res.json({ id: userId, message: 'User deleted successfully' });
});

router.patch('/users/:id/toggle-status', async (req, res) => {
  const userId = req.params.id;

  if (userId === 'usr_admin_01' || userId === '1') {
    return res.status(403).json({ error: 'System Administrator account cannot be deactivated.' });
  }

  const user = dbUsersStore.find((u) => String(u.id) === String(userId));
  const previousActiveState = user ? user.isActive : true;
  const newActiveState = !previousActiveState;

  if (user) {
    user.isActive = newActiveState;
  }

  if (dbPool) {
    try {
      const numId = Number.parseInt(userId, 10);
      const sqlVal = newActiveState ? 1 : 0;
      if (!Number.isNaN(numId)) {
        await dbPool.query('UPDATE users SET is_active = ? WHERE id = ?', [sqlVal, numId]);
      } else {
        await dbPool.query('UPDATE users SET is_active = ? WHERE email = ?', [sqlVal, userId]);
      }
      console.log(`[MySQL DB] Toggled is_active to ${sqlVal} for user ${userId}.`);
    } catch (e) {
      console.error('[MySQL DB Error] PATCH toggle-status failed:', e?.message || e);
    }
  }

  await recordAuditLog(dbPool, {
    actorId: '1',
    actorEmail: 'admin@markops.io',
    action: 'STATUS_CHANGED',
    entityType: 'User',
    entityId: userId,
    previousState: { isActive: previousActiveState },
    newState: { isActive: newActiveState },
    ipAddress: req.ip || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'],
  });

  return res.json({ id: userId, isActive: newActiveState });
});

async function applyUserMemoryUpdate(user, updateData) {
  if (!user) return;
  if (updateData.email) user.email = String(updateData.email).toLowerCase().trim();
  if (updateData.fullName) user.fullName = String(updateData.fullName).trim();
  if (updateData.role) user.role = String(updateData.role);
  if (updateData.department) user.department = String(updateData.department).trim();
  if (updateData.isActive !== undefined) user.isActive = Boolean(updateData.isActive);
  if (updateData.savedAvatar !== undefined) user.avatarUrl = updateData.savedAvatar;
  if (updateData.password && String(updateData.password).length >= 1) {
    user.rawPassword = String(updateData.password);
    user.passwordHash = await bcrypt.hash(String(updateData.password), 10);
  }
}

async function applyUserDbUpdate(userId, updateData) {
  if (!dbPool) return;
  try {
    const numId = Number.parseInt(userId, 10);
    const targetRoleId = resolveRoleId(updateData.role);
    let sql = 'UPDATE users SET full_name = ?, email = ?, role_id = ?, department = ?, is_active = ?';
    const params = [updateData.fullName, updateData.email, targetRoleId, updateData.department, updateData.isActive ? 1 : 0];

    if (updateData.savedAvatar !== undefined) {
      sql += ', avatar_url = ?';
      params.push(updateData.savedAvatar);
    }
    if (updateData.password && updateData.password.length >= 6) {
      const hash = await bcrypt.hash(updateData.password, 10);
      sql += ', password_hash = ?';
      params.push(hash);
    }
    if (!Number.isNaN(numId)) {
      sql += ' WHERE id = ?';
      params.push(numId);
    } else {
      sql += ' WHERE email = ?';
      params.push(userId);
    }

    await dbPool.query(sql, params);
    console.log(`[MySQL DB] Updated user ${userId} in database.`);
  } catch (e) {
    console.error('[MySQL DB Error] PUT update failed:', e?.message || e);
  }
}

router.put('/users/:id', async (req, res) => {
  const userId = req.params.id;
  const { email, fullName, role, department, isActive, password, avatarUrl, avatarDataUrl } = req.body;

  const user = dbUsersStore.find((u) => String(u.id) === String(userId));
  const previousState = user ? { ...user } : null;
  const savedAvatar = saveAvatarImage(avatarDataUrl, userId) || (avatarUrl !== undefined ? avatarUrl : undefined);

  const updateData = { email, fullName, role, department, isActive, password, savedAvatar };
  await applyUserMemoryUpdate(user, updateData);
  await applyUserDbUpdate(userId, updateData);

  await recordAuditLog(dbPool, {
    actorId: '1',
    actorEmail: 'admin@markops.io',
    action: password ? 'USER_UPDATED_AND_PASSWORD_CHANGED' : 'USER_UPDATED',
    entityType: 'User',
    entityId: userId,
    previousState,
    newState: { email, fullName, role, department, isActive },
    ipAddress: req.ip || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'],
  });

  return res.json({ id: userId, message: 'User updated successfully' });
});

module.exports = router;
