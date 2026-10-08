const express = require('express');
const bcrypt = require('bcryptjs');
const { dbPool, dbUsersStore, ROLE_MAP } = require('../db');
const { recordAuditLog } = require('../services/audit.service');

const router = express.Router();


router.get('/users', async (req, res) => {
  if (dbPool) {
    try {
      const [rows] = await dbPool.query(`
        SELECT u.id, u.email, u.full_name as fullName, COALESCE(r.code, 'ADMINISTRATOR') as role, u.department, u.is_active as isActive, u.last_login_at as lastLoginAt, u.created_at as createdAt
        FROM users u
        LEFT JOIN roles r ON u.role_id = r.id
        ORDER BY u.id ASC
      `);
      if (Array.isArray(rows) && rows.length > 0) {
        const formatted = rows.map((r) => ({
          id: String(r.id),
          email: r.email,
          fullName: r.fullName,
          role: r.role,
          department: r.department || 'General Operations',
          isActive: Boolean(r.isActive),
          lastLoginAt: r.lastLoginAt ? String(r.lastLoginAt) : 'Never',
          createdAt: r.createdAt ? String(r.createdAt).split('T')[0] : '2026-01-10',
        }));
        return res.json(formatted);
      }
    } catch (e) {
      console.log('MySQL query notice (using fallback memory store):', e?.message || e);
    }
  }

  if (!dbUsersStore.some((u) => u.id === '1' || u.id === 'usr_admin_01' || u.email === 'admin@markops.io')) {
    dbUsersStore.unshift({
      id: '1',
      email: 'admin@markops.io',
      fullName: 'System Administrator',
      role: 'ADMINISTRATOR',
      department: 'Executive Operations',
      isActive: true,
      lastLoginAt: 'Just now',
      createdAt: '2026-01-10',
    });
  }
  return res.json(dbUsersStore);
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

router.post('/users', async (req, res) => {
  const { email, fullName, role, department, isActive, password } = req.body;
  if (!email || !fullName || !role) {
    return res.status(400).json({ error: 'Email, Full Name, and Role are required fields.' });
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  const userDept = String(department || 'General Operations').trim();
  const userActive = isActive !== undefined ? Boolean(isActive) : true;
  const targetRoleId = resolveRoleId(role);


  if (normalizedEmail === 'admin@markops.io') {
    return res.status(400).json({ error: 'Cannot create a user with the System Administrator email (admin@markops.io).' });
  }


  if (dbPool) {
    try {
      const [existing] = await dbPool.query('SELECT id, email FROM users WHERE LOWER(email) = ?', [normalizedEmail]);
      if (Array.isArray(existing) && existing.length > 0) {
        return res.status(409).json({ error: `A user with email "${normalizedEmail}" already exists. Please use a unique email address.` });
      }
    } catch (e) {
      console.error('[MySQL DB Error] Check existing user query failed:', e?.message || e);
    }
  }


  if (dbUsersStore.some((u) => u.email && u.email.toLowerCase() === normalizedEmail)) {
    return res.status(409).json({ error: `A user with email "${normalizedEmail}" already exists. Please use a unique email address.` });
  }

  const rawPassword = password && String(password).length >= 1 ? String(password) : 'admin123';
  const hashedPassword = await bcrypt.hash(rawPassword, 10);

  let insertedUserId = null;

  if (dbPool) {
    try {
      const [insertRes] = await dbPool.query(
        `INSERT INTO users (email, password_hash, full_name, role_id, department, is_active)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [normalizedEmail, hashedPassword, String(fullName).trim(), targetRoleId, userDept, userActive ? 1 : 0]
      );
      
      if (insertRes && insertRes.insertId) {
        insertedUserId = insertRes.insertId;
      }

      if (insertedUserId) {
        console.log(`[MySQL DB] Successfully inserted new user ${normalizedEmail} (ID: ${insertedUserId}) into table 'users'.`);

        try {
          await dbPool.query(
            `INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
             VALUES (?, ?, ?, ?, 0, NOW())`,
            [
              insertedUserId,
              'Welcome to MarkOps Platform',
              `Your ${role} user account has been successfully provisioned.`,
              'SUCCESS',
            ]
          );
        } catch (notifErr) {
          console.error('[MySQL DB Notice] Notification insert skipped:', notifErr?.message || notifErr);
        }
      }
    } catch (e) {
      console.error('[MySQL DB Error] INSERT user query failed:', e?.message || e);
      if (e.code === 'ER_DUP_ENTRY' || e.errno === 1062) {
        return res.status(409).json({ error: `A user with email "${normalizedEmail}" already exists.` });
      }
      return res.status(500).json({ error: 'Failed to insert user into database.' });
    }
  }

  const finalId = insertedUserId ? String(insertedUserId) : `usr_${Math.random().toString(36).substring(2, 11)}`;
  const newUser = {
    id: finalId,
    email: normalizedEmail,
    fullName: String(fullName).trim(),
    role: String(role),
    department: userDept,
    isActive: userActive,
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
      const numId = parseInt(userId, 10);
      if (!isNaN(numId)) {
        await dbPool.query('DELETE FROM task_assignments WHERE user_id = ?', [numId]);
        await dbPool.query('DELETE FROM notifications WHERE user_id = ?', [numId]);
        await dbPool.query('DELETE FROM users WHERE id = ?', [numId]);
      } else {
        await dbPool.query('DELETE FROM users WHERE email = ?', [userId]);
      }
      console.log(`[MySQL DB] Successfully deleted user ${userId} from table 'users'.`);
    } catch (e) {
      console.error('[MySQL DB Error] DELETE query failed:', e?.message || e);
    }
  }

  await recordAuditLog(dbPool, {
    actorId: '1',
    actorEmail: 'admin@markops.io',
    action: 'USER_DELETED',
    entityType: 'User',
    entityId: userId,
    previousState: deletedUser,
    ipAddress: req.ip || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'],
  });

  return res.json({ message: 'User successfully deleted from database.', user: deletedUser });
});


router.patch('/users/:id/status', async (req, res) => {
  const userId = req.params.id;
  const user = dbUsersStore.find((u) => String(u.id) === String(userId));

  let newActiveState = true;
  let previousActiveState = false;
  if (user) {
    previousActiveState = user.isActive;
    user.isActive = !user.isActive;
    newActiveState = user.isActive;
  }

  if (dbPool) {
    try {
      const numId = parseInt(userId, 10);
      if (!isNaN(numId)) {
        if (!user) {
          const [rows] = await dbPool.query('SELECT is_active FROM users WHERE id = ?', [numId]);
          if (Array.isArray(rows) && rows.length > 0) {
            previousActiveState = Boolean(rows[0].is_active);
            newActiveState = !previousActiveState;
          }
        }
        await dbPool.query('UPDATE users SET is_active = ? WHERE id = ?', [newActiveState ? 1 : 0, numId]);
      } else {
        await dbPool.query('UPDATE users SET is_active = ? WHERE email = ?', [newActiveState ? 1 : 0, userId]);
      }
      console.log(`[MySQL DB] Updated user ${userId} status to ${newActiveState}.`);
    } catch (e) {
      console.error('[MySQL DB Error] UPDATE query failed:', e?.message || e);
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


router.put('/users/:id', async (req, res) => {
  const userId = req.params.id;
  const { email, fullName, role, department, isActive, password } = req.body;

  const user = dbUsersStore.find((u) => String(u.id) === String(userId));
  const previousState = user ? { ...user } : null;

  if (user) {
    if (email) user.email = String(email).toLowerCase().trim();
    if (fullName) user.fullName = String(fullName).trim();
    if (role) user.role = String(role);
    if (department) user.department = String(department).trim();
    if (isActive !== undefined) user.isActive = Boolean(isActive);
    if (password && String(password).length >= 1) {
      user.rawPassword = String(password);
      user.passwordHash = await bcrypt.hash(String(password), 10);
    }
  }

  if (dbPool) {
    try {
      const numId = parseInt(userId, 10);
      const targetRoleId = resolveRoleId(role);
      let sql = 'UPDATE users SET full_name = ?, email = ?, role_id = ?, department = ?, is_active = ?';
      const params = [fullName, email, targetRoleId, department, isActive ? 1 : 0];

      if (password && password.length >= 6) {
        const hash = await bcrypt.hash(password, 10);
        sql += ', password_hash = ?';
        params.push(hash);
      }

      if (!isNaN(numId)) {
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
