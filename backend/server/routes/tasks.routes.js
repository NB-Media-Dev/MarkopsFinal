const express = require('express');
const fs = require('fs');
const path = require('path');
const { dbPool, dbTasksStore, dbUsersStore, dbNotificationsStore } = require('../db');
const { recordAuditLog } = require('../services/audit.service');
const { emitRealtimeEvent } = require('../events');
const { dispatchNotification, stripEmojis } = require('../services/notification.service');

const router = express.Router();

function saveBase64Attachment(dataUrl, fileName, subFolder = 'briefs') {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    return dataUrl || null;
  }
  try {
    const matches = dataUrl.match(/^data:([A-Za-z0-9-+\/.]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return dataUrl;
    }
    const buffer = Buffer.from(matches[2], 'base64');
    const safeName = (fileName || 'document.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
    const Finalname = safeName
    const targetDir = path.resolve(`uploads/${subFolder}`);
    fs.mkdirSync(targetDir, { recursive: true });
    const targetPath = path.join(targetDir, Finalname);
    fs.writeFileSync(targetPath, buffer);
    return `/uploads/${subFolder}/${Finalname}`;
  } catch (e) {
    console.error('[Attachment Error] Failed to write file to disk:', e?.message || e);
    return dataUrl;
  }
}

function formatDueDate(val) {
  if (!val) return '';
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val.trim())) return val.trim();
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
  } catch (e) {
    return '';
  }
}

function computeTaskProgress(status, dbProgress) {
  const s = String(status || '').toUpperCase().trim();
  switch (s) {
    case 'APPROVED':
    case 'COMPLETED':
    case 'PUBLISHED':
      return 100;
    case 'SUBMITTED':
    case 'UNDER_REVIEW':
    case 'RESUBMITTED':
      return 80;
    case 'IN_PROGRESS':
      return 50;
    case 'REDESIGN_REQUIRED':
    case 'REVISION_REQUIRED':
      return 50;
    case 'ACCEPTED':
      return 25;
    case 'ASSIGNED':
      return 10;
    case 'DRAFT':
      return 0;
    default:
      if (typeof dbProgress === 'number' && dbProgress >= 0 && dbProgress <= 100) {
        return dbProgress;
      }
      return 10;
  }
}

async function findTask(taskId) {
  if (taskId === undefined || taskId === null) return null;

  if (dbPool) {
    try {
      const [rows] = await dbPool.query(`
        SELECT t.*, u.full_name as assignee_full_name, c.full_name as creator_full_name, COALESCE(cr.code, 'ADMINISTRATOR') as creator_role
        FROM tasks t
        LEFT JOIN users u ON t.assigned_to = u.id
        LEFT JOIN users c ON t.created_by = c.id
        LEFT JOIN roles cr ON c.role_id = cr.id
        WHERE t.id = ?
        LIMIT 1
      `, [taskId]);

      if (Array.isArray(rows) && rows.length > 0) {
        const row = rows[0];
        const safeDueDate = formatDueDate(row.due_date);
        const detectedRole = row.creator_role || (row.creator_full_name && row.creator_full_name.toLowerCase().includes('bdm') ? 'BDM' : 'ADMINISTRATOR');

        let statusHistory = [];
        try {
          const [histRows] = await dbPool.query(`
            SELECT h.*, u.full_name as actor_name
            FROM task_status_history h
            LEFT JOIN users u ON h.actor_id = u.id
            WHERE h.task_id = ?
            ORDER BY h.created_at DESC
          `, [taskId]);
          if (Array.isArray(histRows)) {
            statusHistory = histRows.map((h) => ({
              id: h.id,
              taskId: h.task_id,
              actorId: h.actor_id,
              actorName: h.actor_name || 'User',
              previousStatus: h.previous_status,
              newStatus: h.new_status,
              remark: h.remark,
              createdAt: h.created_at ? new Date(h.created_at).toISOString() : new Date().toISOString(),
            }));
          }
        } catch (he) {}

        let versions = [];
        try {
          const [verRows] = await dbPool.query(`
            SELECT v.*, u.full_name as author_name
            FROM task_versions v
            LEFT JOIN users u ON v.submitted_by = u.id
            WHERE v.task_id = ?
            ORDER BY v.version_number DESC
          `, [taskId]);
          if (Array.isArray(verRows)) {
            versions = verRows.map((v) => ({
              id: v.id,
              taskId: v.task_id,
              versionNumber: v.version_number,
              submittedBy: v.submitted_by,
              submittedByName: v.author_name || 'Designer',
              fileName: v.file_name,
              filePath: v.file_path,
              fileSize: v.file_size,
              changelog: v.changelog,
              createdAt: v.created_at ? new Date(v.created_at).toISOString() : new Date().toISOString(),
            }));
          }
        } catch (ve) {}

        let comments = [];
        try {
          const [commRows] = await dbPool.query(`
            SELECT c.*, u.full_name as user_name, r.code as user_role
            FROM task_comments c
            LEFT JOIN users u ON c.user_id = u.id
            LEFT JOIN roles r ON u.role_id = r.id
            WHERE c.task_id = ?
            ORDER BY c.created_at ASC
          `, [taskId]);
          if (Array.isArray(commRows)) {
            comments = commRows.map((c) => ({
              id: c.id,
              taskId: c.task_id,
              userId: c.user_id,
              userName: c.user_name || 'User',
              userRole: c.user_role || 'ADMINISTRATOR',
              comment: c.comment,
              createdAt: c.created_at ? new Date(c.created_at).toISOString() : new Date().toISOString(),
            }));
          }
        } catch (ce) {}

        return {
          id: row.id,
          title: row.title || 'Untitled Task',
          packageName: row.package_name || '',
          description: row.description || '',
          content: row.content || '',
          attachmentUrl: row.attachment_url || '',
          attachmentName: row.attachment_name || '',
          reviewerFeedback: row.reviewer_feedback || '',
          status: row.status || 'ASSIGNED',
          priority: row.priority || 'MEDIUM',
          createdBy: row.created_by || 1,
          creatorName: row.creator_full_name || 'Manager',
          creatorRole: detectedRole,
          assignedTo: row.assigned_to || '',
          assigneeName: row.assignee_full_name || 'Designer',
          dueDate: safeDueDate,
          progressPercent: computeTaskProgress(row.status, row.progress_percent),
          createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
          updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
          versions,
          statusHistory,
          comments,
        };
      }
    } catch (e) {
      console.error('[MySQL DB Error] findTask failed:', e?.message || e);
    }
  }

  const targetIdStr = String(taskId).trim();
  const memTask = dbTasksStore.find((t) => String(t.id).trim() === targetIdStr);
  return memTask || null;
}

async function populateTaskRelations(tasksList) {
  if (!Array.isArray(tasksList) || tasksList.length === 0) return tasksList;
  if (!dbPool) return tasksList;

  const taskIds = tasksList.map(t => t.id).filter(id => id !== undefined && id !== null);
  if (taskIds.length === 0) return tasksList;

  try {
    const [verRows] = await dbPool.query(`
      SELECT v.*, u.full_name as author_name
      FROM task_versions v
      LEFT JOIN users u ON v.submitted_by = u.id
      WHERE v.task_id IN (?)
      ORDER BY v.version_number DESC
    `, [taskIds]);

    const versionsByTask = {};
    if (Array.isArray(verRows)) {
      verRows.forEach((v) => {
        const tid = String(v.task_id);
        if (!versionsByTask[tid]) versionsByTask[tid] = [];
        versionsByTask[tid].push({
          id: v.id,
          taskId: v.task_id,
          versionNumber: v.version_number,
          submittedBy: v.submitted_by,
          submittedByName: v.author_name || 'Designer',
          fileName: v.file_name,
          filePath: v.file_path,
          fileSize: v.file_size,
          changelog: v.changelog,
          createdAt: v.created_at ? new Date(v.created_at).toISOString() : new Date().toISOString(),
        });
      });
    }

    const [histRows] = await dbPool.query(`
      SELECT h.*, u.full_name as actor_name
      FROM task_status_history h
      LEFT JOIN users u ON h.actor_id = u.id
      WHERE h.task_id IN (?)
      ORDER BY h.created_at DESC
    `, [taskIds]);

    const historyByTask = {};
    if (Array.isArray(histRows)) {
      histRows.forEach((h) => {
        const tid = String(h.task_id);
        if (!historyByTask[tid]) historyByTask[tid] = [];
        historyByTask[tid].push({
          id: h.id,
          taskId: h.task_id,
          actorId: h.actor_id,
          actorName: h.actor_name || 'System',
          previousStatus: h.previous_status,
          newStatus: h.new_status,
          remark: h.remark,
          createdAt: h.created_at ? new Date(h.created_at).toISOString() : new Date().toISOString(),
        });
      });
    }

    for (const t of tasksList) {
      const tid = String(t.id);
      if (versionsByTask[tid]) {
        t.versions = versionsByTask[tid];
      }
      if (historyByTask[tid]) {
        t.statusHistory = historyByTask[tid];
      }
    }
  } catch (e) {
    console.error('[populateTaskRelations Error]:', e?.message || e);
  }
  return tasksList;
}


router.get('/tasks', async (req, res) => {
  const { status, assignedTo, createdBy, view } = req.query;
  const currentUserId = req.user?.id ? String(req.user.id) : null;
  const currentUserRole = req.user?.role;

  let targetCreatedBy = createdBy || null;
  let targetAssignedTo = assignedTo || null;

  if (view === 'my') {
    if (currentUserRole === 'DESIGNER') {
      targetAssignedTo = assignedTo || currentUserId;
    } else {
      targetCreatedBy = createdBy || currentUserId;
    }
  } else if (view === 'all') {
    targetCreatedBy = createdBy || null;
    targetAssignedTo = assignedTo || null;
  } else if (assignedTo) {
    targetAssignedTo = assignedTo;
  } else if (createdBy) {
    targetCreatedBy = createdBy;
  }

  if (dbPool) {
    try {
      let query = `
        SELECT t.*, u.full_name as assignee_full_name, c.full_name as creator_full_name, c.email as creator_email, COALESCE(cr.code, 'ADMINISTRATOR') as creator_role
        FROM tasks t
        LEFT JOIN users u ON t.assigned_to = u.id
        LEFT JOIN users c ON t.created_by = c.id
        LEFT JOIN roles cr ON c.role_id = cr.id
      `;
      const conditions = [];
      const params = [];

      if (status && status !== 'ALL') {
        conditions.push('t.status = ?');
        params.push(status);
      }
      if (targetAssignedTo) {
        conditions.push('t.assigned_to = ?');
        params.push(targetAssignedTo);
      }
      if (targetCreatedBy) {
        conditions.push('t.created_by = ?');
        params.push(targetCreatedBy);
      }
      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
      query += ' ORDER BY t.created_at DESC';

      const [rows] = await dbPool.query(query, params);
      if (Array.isArray(rows)) {
        const tasks = rows.map((row) => {
          const safeDueDate = formatDueDate(row.due_date);
          const detectedRole = row.creator_role || (row.creator_full_name && row.creator_full_name.toLowerCase().includes('bdm') ? 'BDM' : 'ADMINISTRATOR');
          return {
            id: row.id,
            title: row.title,
            packageName: row.package_name || '',
            description: row.description || '',
            content: row.content || '',
            attachmentUrl: row.attachment_url || '',
            attachmentName: row.attachment_name || '',
            reviewerFeedback: row.reviewer_feedback || '',
            status: row.status,
            priority: row.priority,
            createdBy: row.created_by,
            created_by: row.created_by,
            creatorName: row.creator_full_name || 'Manager',
            creatorEmail: row.creator_email || '',
            creatorRole: detectedRole,
            assignedTo: row.assigned_to || '',
            assigned_to: row.assigned_to || '',
            assigneeName: row.assignee_full_name || 'Designer',
            dueDate: safeDueDate,
            progressPercent: computeTaskProgress(row.status, row.progress_percent),
            createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
            updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
            versions: [],
            statusHistory: [],
            comments: [],
          };
        });
        await populateTaskRelations(tasks);
        return res.json(tasks);
      }
    } catch (e) {
      console.error('[MySQL DB Error] Failed to load tasks from DB:', e?.message || e);
    }
  }

 
  let filtered = [...dbTasksStore];
  if (status && status !== 'ALL') {
    filtered = filtered.filter((t) => t.status === status);
  }
  if (targetAssignedTo) {
    filtered = filtered.filter((t) => String(t.assignedTo) === String(targetAssignedTo));
  }
  if (targetCreatedBy) {
    filtered = filtered.filter((t) => String(t.createdBy || t.created_by) === String(targetCreatedBy));
  }

  return res.json(filtered);
});


router.get('/tasks/my', async (req, res) => {
  const currentUserId = req.user?.id;
  if (!currentUserId) {
    return res.status(401).json({ error: 'Authentication required. Please provide a valid JWT access token.' });
  }

  const currentUserRole = req.user?.role;
  const currentUserEmail = req.user?.email ? String(req.user.email).toLowerCase().trim() : '';
  const currentUserName = req.user?.fullName ? String(req.user.fullName).toLowerCase().trim() : '';
  const isDesigner = currentUserRole === 'DESIGNER';
  const { status, assignedTo, createdBy } = req.query;
  const numericUserId = parseInt(currentUserId, 10) || currentUserId;

  if (dbPool) {
    try {
      let whereClause = '';
      const params = [];

      if (isDesigner) {
        whereClause = '(t.assigned_to = ? OR LOWER(u.email) = ? OR LOWER(u.full_name) = ?)';
        params.push(numericUserId, currentUserEmail || '___none___', currentUserName || '___none___');
      } else if (currentUserRole === 'ADMINISTRATOR') {
        whereClause = '(t.created_by = ? OR LOWER(c.email) = ? OR t.created_by = 1 OR LOWER(c.full_name) LIKE ?)';
        params.push(numericUserId, currentUserEmail || '___none___', '%admin%');
      } else {
        whereClause = '(t.created_by = ? OR LOWER(c.email) = ? OR LOWER(c.full_name) = ?)';
        params.push(numericUserId, currentUserEmail || '___none___', currentUserName || '___none___');
      }

      let query = `
        SELECT t.*, u.full_name as assignee_full_name, u.email as assignee_email, c.full_name as creator_full_name, c.email as creator_email, COALESCE(cr.code, 'ADMINISTRATOR') as creator_role
        FROM tasks t
        LEFT JOIN users u ON t.assigned_to = u.id
        LEFT JOIN users c ON t.created_by = c.id
        LEFT JOIN roles cr ON c.role_id = cr.id
        WHERE ${whereClause}
      `;

      const conditions = [];
      if (status && status !== 'ALL') {
        conditions.push('t.status = ?');
        params.push(status);
      }
      if (assignedTo && !isDesigner) {
        conditions.push('t.assigned_to = ?');
        params.push(assignedTo);
      }
      if (createdBy && isDesigner) {
        conditions.push('t.created_by = ?');
        params.push(createdBy);
      }
      if (conditions.length > 0) {
        query += ' AND ' + conditions.join(' AND ');
      }
      query += ' ORDER BY t.created_at DESC';

      const [rows] = await dbPool.query(query, params);
      if (Array.isArray(rows)) {
        const tasks = rows.map((row) => {
          const safeDueDate = formatDueDate(row.due_date);
          const detectedRole = row.creator_role || (row.creator_full_name && row.creator_full_name.toLowerCase().includes('bdm') ? 'BDM' : 'ADMINISTRATOR');
          return {
            id: row.id,
            title: row.title,
            packageName: row.package_name || '',
            description: row.description || '',
            content: row.content || '',
            attachmentUrl: row.attachment_url || '',
            attachmentName: row.attachment_name || '',
            reviewerFeedback: row.reviewer_feedback || '',
            status: row.status,
            priority: row.priority,
            createdBy: row.created_by,
            created_by: row.created_by,
            creatorName: row.creator_full_name || 'Manager',
            creatorEmail: row.creator_email || '',
            creatorRole: detectedRole,
            assignedTo: row.assigned_to || '',
            assigned_to: row.assigned_to || '',
            assigneeName: row.assignee_full_name || 'Designer',
            dueDate: safeDueDate,
            progressPercent: computeTaskProgress(row.status, row.progress_percent),
            createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
            updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
            versions: [],
            statusHistory: [],
            comments: [],
          };
        });
        await populateTaskRelations(tasks);
        return res.json(tasks);
      }
    } catch (e) {
      console.error('[MySQL DB Error] Failed to load my tasks from DB:', e?.message || e);
    }
  }


  let filtered = dbTasksStore.filter((t) => {
    if (isDesigner) {
      const aId = String(t.assignedTo || t.assigned_to || '').toLowerCase().trim();
      const aEmail = String(t.assigneeEmail || '').toLowerCase().trim();
      const aName = String(t.assigneeName || '').toLowerCase().trim();
      return aId === String(currentUserId).toLowerCase().trim() ||
             (currentUserEmail && aEmail === currentUserEmail) ||
             (currentUserName && aName === currentUserName);
    } else {
      const cId = String(t.createdBy !== undefined ? t.createdBy : (t.created_by || '')).toLowerCase().trim();
      const cEmail = String(t.creatorEmail || '').toLowerCase().trim();
      const cName = String(t.creatorName || '').toLowerCase().trim();
      return cId === String(currentUserId).toLowerCase().trim() ||
             (currentUserEmail && cEmail === currentUserEmail) ||
             (currentUserRole === 'ADMINISTRATOR' && (cId === '1' || cId === 'usr_admin_01' || cName.includes('admin')));
    }
  });
  if (status && status !== 'ALL') {
    filtered = filtered.filter((t) => t.status === status);
  }
  if (assignedTo && !isDesigner) {
    filtered = filtered.filter((t) => String(t.assignedTo) === String(assignedTo));
  }
  return res.json(filtered);
});


router.delete('/tasks/:id', async (req, res) => {
  const currentUserId = req.user?.id;
  if (!currentUserId) {
    return res.status(401).json({ error: 'Authentication required. Please provide a valid JWT access token.' });
  }

  const taskId = req.params.id;
  if (!taskId) {
    return res.status(400).json({ error: 'Task ID parameter is required.' });
  }

  let task = null;
  if (dbPool) {
    try {
      const [rows] = await dbPool.query(
        'SELECT id, title, created_by FROM tasks WHERE id = ? LIMIT 1',
        [taskId]
      );
      if (Array.isArray(rows) && rows.length > 0) {
        task = rows[0];
      }
    } catch (e) {
      console.error('[MySQL DB Error] Failed to fetch task for deletion check:', e?.message || e);
    }
  }

  if (!task) {
    const memTask = dbTasksStore.find((t) => String(t.id).trim() === String(taskId).trim());
    if (memTask) {
      task = {
        id: memTask.id,
        title: memTask.title,
        created_by: memTask.createdBy || memTask.created_by,
      };
    }
  }

  if (!task) {
    return res.status(404).json({ error: 'Task record not found.' });
  }


  const taskCreatorId = String(task.created_by !== undefined ? task.created_by : task.createdBy).trim();
  const authUserId = String(currentUserId).trim();

 
  if (taskCreatorId !== authUserId) {
    return res.status(403).json({
      message: 'You can only delete tasks created by you.',
    });
  }

 
  if (dbPool) {
    try {
      await dbPool.query('DELETE FROM task_status_history WHERE task_id = ?', [taskId]);
      await dbPool.query('DELETE FROM task_versions WHERE task_id = ?', [taskId]);
      await dbPool.query('DELETE FROM task_comments WHERE task_id = ?', [taskId]);
      await dbPool.query('DELETE FROM task_assignments WHERE task_id = ?', [taskId]);
      await dbPool.query('DELETE FROM task_attachments WHERE task_id = ?', [taskId]);
      await dbPool.query('DELETE FROM task_progress_history WHERE task_id = ?', [taskId]);
      await dbPool.query('DELETE FROM tasks WHERE id = ?', [taskId]);
    } catch (e) {
      console.error('[MySQL DB Error] Failed to delete task:', e?.message || e);
      return res.status(500).json({ error: 'Failed to delete task from database.' });
    }
  }

  const memIdx = dbTasksStore.findIndex((t) => String(t.id).trim() === String(taskId).trim());
  if (memIdx !== -1) {
    dbTasksStore.splice(memIdx, 1);
  }

  await recordAuditLog(dbPool, {
    actorId: currentUserId,
    actorEmail: req.user?.email || 'user@markops.io',
    action: 'DELETE_TASK',
    entityType: 'Task',
    entityId: String(taskId),
    previousState: { title: task.title, createdBy: taskCreatorId },
  });

  emitRealtimeEvent('task:deleted', { taskId });

  return res.json({ success: true, message: 'Task deleted successfully.' });
});


router.get('/tasks/:id', async (req, res) => {
  const task = await findTask(req.params.id);
  if (!task) {
    return res.status(404).json({ error: 'Task record not found.' });
  }
  return res.json(task);
});


router.post('/tasks', async (req, res) => {
  const userRole = String(req.headers['x-user-role'] || req.user?.role || req.body.creatorRole || '').toUpperCase();
  if (userRole && !['ADMINISTRATOR', 'MARKETING_MANAGER', 'BDM'].includes(userRole)) {
    return res.status(403).json({ error: 'Permission Denied: Only Admin, Marketing Manager, and BDM can create tasks.' });
  }

  const { title, description, content, attachmentUrl, attachmentName, campaignId, campaignName, priority, assignedTo, dueDate, creatorId, creatorName, creatorEmail, packageName } = req.body;
  if (!title || !priority) {
    return res.status(400).json({ error: 'Task Title and Priority are required fields.' });
  }

  const authUserId = req.user?.id ? (parseInt(req.user.id, 10) || req.user.id) : null;
  let numericCreatorId = typeof creatorId === 'number' ? creatorId : (parseInt(creatorId, 10) || (typeof authUserId === 'number' ? authUserId : 1));
  const numericAssignedTo = assignedTo ? (typeof assignedTo === 'number' ? assignedTo : (parseInt(assignedTo, 10) || null)) : null;

  if (dbPool) {
    try {
     
      let creatorFullName = creatorName || req.user?.fullName || req.headers['x-user-name'] || 'Manager';
      let creatorUserEmail = creatorEmail || req.user?.email || '';
      let assigneeFullName = req.body.assigneeName || 'Designer';

      try {
        const [users] = await dbPool.query('SELECT id, full_name, email, role_id FROM users WHERE id IN (?, ?) OR email = ?', [
          numericCreatorId,
          numericAssignedTo,
          creatorUserEmail || '___none___'
        ]);
        if (Array.isArray(users)) {
          const cUser = users.find((u) => u.id === numericCreatorId || (creatorUserEmail && u.email === creatorUserEmail));
          const aUser = users.find((u) => u.id === numericAssignedTo);
          if (cUser) {
            creatorFullName = cUser.full_name;
            numericCreatorId = cUser.id;
          }
          if (aUser) {
            assigneeFullName = aUser.full_name;
         
            if (aUser.role_id !== 4) {
              return res.status(400).json({ error: 'Tasks can only be assigned to users with the DESIGNER role.' });
            }
          }
        }
      } catch (ue) {}

      const safeDueDate = formatDueDate(dueDate);
      const safePackageName = packageName ? String(packageName).trim() : 'Careermate';
      const savedAttachmentUrl = saveBase64Attachment(attachmentUrl, attachmentName, 'briefs');

      const [result] = await dbPool.query(
        `INSERT INTO tasks (title, description, content, attachment_url, attachment_name, package_name, status, priority, created_by, assigned_to, due_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          String(title).trim(),
          (description && !String(description).startsWith('Document File:')) ? String(description).trim() : null,
          content || null,
          savedAttachmentUrl || null,
          attachmentName || null,
          safePackageName,
          numericAssignedTo ? 'ASSIGNED' : 'DRAFT',
          String(priority),
          numericCreatorId,
          numericAssignedTo,
          safeDueDate || null,
        ]
      );

      if (result && result.insertId) {
        const newTaskId = result.insertId;

      
        await dbPool.query(
          `INSERT INTO task_status_history (task_id, actor_id, previous_status, new_status, remark, created_at)
           VALUES (?, ?, NULL, ?, ?, NOW())`,
          [newTaskId, numericCreatorId, numericAssignedTo ? 'ASSIGNED' : 'DRAFT', `Task created and assigned to ${assigneeFullName}.`]
        );

        const dbTask = await findTask(newTaskId);
        if (dbTask) {
          if (packageName) dbTask.packageName = packageName;
          if (content) dbTask.content = content;
          if (savedAttachmentUrl) dbTask.attachmentUrl = savedAttachmentUrl;
          if (attachmentName) dbTask.attachmentName = attachmentName;

          if (attachmentName || savedAttachmentUrl) {
            try {
              await dbPool.query(
                `INSERT INTO task_attachments (task_id, file_name, file_path, file_size, uploaded_by, created_at)
                 VALUES (?, ?, ?, ?, ?, NOW())`,
                [newTaskId, attachmentName || 'Document.pdf', savedAttachmentUrl || '', 1024, numericCreatorId]
              );
            } catch (attErr) {}
          }

          dbTasksStore.unshift(dbTask);
          emitRealtimeEvent('task:assigned', dbTask);

          if (numericAssignedTo) {
            await dispatchNotification({
              userIds: [numericAssignedTo],
              title: `Task Assigned: ${dbTask.title}`,
              message: `You have been assigned to task "${dbTask.title}". Priority: ${dbTask.priority || 'MEDIUM'}. Due date: ${dbTask.dueDate || 'Flexible'}.`,
              type: 'INFO',
              targetRoute: '/designer-tasks',
            });
            if (numericCreatorId && numericCreatorId !== numericAssignedTo) {
              await dispatchNotification({
                userIds: [numericCreatorId],
                title: `Task Assigned Successfully`,
                message: `Task "${dbTask.title}" has been assigned to ${assigneeFullName}.`,
                type: 'INFO',
                targetRoute: `/tasks?view=my&taskId=${newTaskId}`,
              });
            }
          }

          await recordAuditLog(dbPool, {
            actorId: numericCreatorId,
            actorEmail: creatorEmail || 'admin@markops.io',
            action: 'TASK_CREATED',
            entityType: 'Task',
            entityId: newTaskId,
            newState: { title: dbTask.title, status: dbTask.status, assignedTo: dbTask.assignedTo },
            ipAddress: req.ip || req.socket.remoteAddress,
            userAgent: req.headers['user-agent'],
          });

          return res.status(201).json(dbTask);
        }
      }
    } catch (e) {
      console.error('[MySQL DB Error] Task INSERT failed:', e?.message || e);
    }
  }

 
  const taskId = `task_${Math.random().toString(36).substring(2, 11)}`;
  const now = new Date().toISOString();
  const targetUser = dbUsersStore.find((u) => String(u.id) === String(assignedTo));
  const assigneeName = targetUser ? targetUser.fullName : (req.body.assigneeName || 'Assigned User');

  const newTask = {
    id: taskId,
    title: String(title).trim(),
    packageName: packageName || req.body.packageName || '',
    description: description ? String(description).trim() : '',
    content: content ? String(content).trim() : '',
    attachmentUrl: attachmentUrl || '',
    attachmentName: attachmentName || '',
    campaignId: campaignId || '',
    campaignName: campaignName || '',
    status: assignedTo ? 'ASSIGNED' : 'DRAFT',
    priority: String(priority),
    createdBy: creatorId || req.headers['x-user-id'] || 'usr_admin_01',
    creatorName: creatorName || req.headers['x-user-name'] || 'System Administrator',
    creatorRole: userRole || 'ADMINISTRATOR',
    assignedTo: assignedTo || '',
    assigneeName,
    progressPercent: computeTaskProgress(assignedTo ? 'ASSIGNED' : 'DRAFT', 10),
    dueDate: dueDate || new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
    createdAt: now,
    updatedAt: now,
    versions: [],
    statusHistory: [
      {
        id: `hist_${Math.random().toString(36).substring(2, 9)}`,
        taskId,
        actorId: creatorId || req.headers['x-user-id'] || 'usr_admin_01',
        actorName: creatorName || req.headers['x-user-name'] || 'System Administrator',
        previousStatus: null,
        newStatus: assignedTo ? 'ASSIGNED' : 'DRAFT',
        remark: `Task created and assigned to ${assigneeName}.`,
        createdAt: now,
      },
    ],
    comments: [],
  };

  dbTasksStore.unshift(newTask);
  emitRealtimeEvent('task:assigned', newTask);

  if (newTask.assignedTo) {
    dispatchNotification({
      userIds: [newTask.assignedTo],
      title: `Task Assigned: ${newTask.title}`,
      message: `You have been assigned to task "${newTask.title}". Priority: ${newTask.priority || 'MEDIUM'}. Due date: ${newTask.dueDate || 'Flexible'}.`,
      type: 'INFO',
      targetRoute: '/designer-tasks',
    }).catch(() => {});

    if (newTask.createdBy && String(newTask.createdBy) !== String(newTask.assignedTo)) {
      dispatchNotification({
        userIds: [newTask.createdBy],
        title: `Task Assigned Successfully`,
        message: `Task "${newTask.title}" has been assigned to ${assigneeName}.`,
        type: 'INFO',
        targetRoute: `/tasks?view=my&taskId=${newTask.id}`,
      }).catch(() => {});
    }
  }

  return res.status(201).json(newTask);
});


async function handleStatusTransition(req, res) {
  const { status, remark, actorId, actorName, actorEmail } = req.body;
  const taskId = req.params.id;

  const task = await findTask(taskId);
  if (!task) {
    return res.status(404).json({ error: `Task #${taskId} not found.` });
  }

  const previousStatus = task.status;
  const newStatus = String(status);

 
  const validTransitions = {
    ASSIGNED: ['IN_PROGRESS'],
    IN_PROGRESS: ['SUBMITTED'],
    SUBMITTED: ['APPROVED', 'REDESIGN_REQUIRED', 'REVISION_REQUIRED'],
    REDESIGN_REQUIRED: ['IN_PROGRESS'],
    REVISION_REQUIRED: ['IN_PROGRESS'],
    APPROVED: [], 
  };

  if (validTransitions[previousStatus] && !validTransitions[previousStatus].includes(newStatus)) {
    return res.status(400).json({
      error: `Invalid task status transition: Cannot transition task from "${previousStatus}" to "${newStatus}". Allowed next: [${(validTransitions[previousStatus] || []).join(', ')}]`,
    });
  }


  if (newStatus === 'APPROVED' || newStatus === 'REDESIGN_REQUIRED' || newStatus === 'REVISION_REQUIRED') {
    const userId = req.user?.id ? String(req.user.id).trim() : (req.headers['x-user-id'] ? String(req.headers['x-user-id']).trim() : null);
    const userEmail = req.user?.email ? String(req.user.email).toLowerCase().trim() : null;
    const taskCreatorId = String(task.createdBy || task.created_by || '').trim();
    const taskCreatorEmail = String(task.creatorEmail || task.creator_email || '').toLowerCase().trim();

    const isCreator = (userId && taskCreatorId && userId === taskCreatorId) ||
                      (userEmail && taskCreatorEmail && userEmail === taskCreatorEmail);

    if (!isCreator) {
      return res.status(403).json({
        error: `Permission Denied: Only the user who created this task can ${newStatus === 'APPROVED' ? 'approve' : 'request redesign for'} it.`,
      });
    }
  }

  const now = new Date().toISOString();
  task.status = newStatus;
  task.updatedAt = now;
  if (remark) {
    task.reviewerFeedback = remark;
  }

  const computedProgress = computeTaskProgress(newStatus);
  task.progressPercent = computedProgress;

  const effectiveActorId = req.user?.id || actorId || req.headers['x-user-id'] || 1;
  const effectiveActorName = req.user?.fullName || actorName || req.headers['x-user-name'] || 'User';

  const historyEntry = {
    id: `hist_${Math.random().toString(36).substring(2, 9)}`,
    taskId,
    actorId: effectiveActorId,
    actorName: effectiveActorName,
    previousStatus,
    newStatus,
    remark: remark || `Transitioned status from ${previousStatus} to ${newStatus}`,
    createdAt: now,
  };

  const lastHistory = task.statusHistory && task.statusHistory.length > 0 ? task.statusHistory[0] : null;
  const isDuplicateHistory = Boolean(
    lastHistory &&
    lastHistory.newStatus === newStatus &&
    (new Date(now).getTime() - new Date(lastHistory.createdAt).getTime() < 15000)
  );

  if (!isDuplicateHistory) {
    if (!task.statusHistory) task.statusHistory = [];
    task.statusHistory.unshift(historyEntry);
  }

  emitRealtimeEvent('task:status_changed', task);
  emitRealtimeEvent(`task:${newStatus.toLowerCase()}`, task);
  emitRealtimeEvent('task:updated', task);
  emitRealtimeEvent('task:progress_updated', { taskId, progressPercent: task.progressPercent });

  
  if (newStatus === 'IN_PROGRESS') {
    const isRedesign = previousStatus === 'REDESIGN_REQUIRED' || previousStatus === 'REVISION_REQUIRED';
    const creatorId = task.createdBy || task.created_by;
    const assignedId = task.assignedTo || task.assigned_to;

    if (creatorId) {
      await dispatchNotification({
        userIds: [creatorId],
        title: isRedesign ? `Redesign Started: ${task.title}` : `Work Started: ${task.title}`,
        message: isRedesign
          ? `${effectiveActorName} has started working on the requested redesign for "${task.title}".`
          : `${effectiveActorName} has started working on task "${task.title}". Status is now IN PROGRESS.`,
        type: 'INFO',
        targetRoute: `/tasks?view=my&taskId=${task.id}`,
      });
    }

    if (assignedId) {
      await dispatchNotification({
        userIds: [assignedId],
        title: isRedesign ? `Redesign In Progress: ${task.title}` : `Work Started: ${task.title}`,
        message: `You started work on "${task.title}". Status updated to IN PROGRESS.`,
        type: 'INFO',
        targetRoute: '/designer-tasks',
      });
    }
  }
 
  else if (newStatus === 'REDESIGN_REQUIRED' || newStatus === 'REVISION_REQUIRED') {
    const assignedId = task.assignedTo || task.assigned_to;
    const creatorId = task.createdBy || task.created_by || effectiveActorId;

    if (assignedId) {
      await dispatchNotification({
        userIds: [assignedId],
        title: `Redesign Requested: ${task.title}`,
        message: `Redesign requested on "${task.title}". Feedback: "${remark || 'Please review feedback remarks and upload revision'}".`,
        type: 'WARNING',
        targetRoute: '/revisions',
      });
    }

    if (creatorId && String(creatorId) === String(effectiveActorId)) {
      await dispatchNotification({
        userIds: [creatorId],
        title: `Redesign Feedback Submitted`,
        message: `Redesign request sent for "${task.title}". Designer has been notified.`,
        type: 'INFO',
        targetRoute: `/tasks?view=my&taskId=${task.id}`,
      });
    }
  }

  else if (newStatus === 'APPROVED') {
    const assignedId = task.assignedTo || task.assigned_to;
    const creatorId = task.createdBy || task.created_by || effectiveActorId;

    if (assignedId) {
      await dispatchNotification({
        userIds: [assignedId],
        title: `Creative Design Approved!`,
        message: `Congratulations! Your creative design for "${task.title}" has been approved by ${effectiveActorName}.`,
        type: 'SUCCESS',
        targetRoute: '/submissions',
      });
    }

    if (creatorId) {
      await dispatchNotification({
        userIds: [creatorId],
        title: `Task Approved: ${task.title}`,
        message: `Task "${task.title}" has been approved and marked as completed (100%).`,
        type: 'SUCCESS',
        targetRoute: `/tasks?view=my&taskId=${task.id}`,
      });
    }
  }

  else if (newStatus === 'ASSIGNED') {
    const assignedId = task.assignedTo || task.assigned_to;
    if (assignedId) {
      await dispatchNotification({
        userIds: [assignedId],
        title: `Task Assigned: ${task.title}`,
        message: `You have been assigned to task "${task.title}". Priority: ${task.priority || 'MEDIUM'}.`,
        type: 'INFO',
        targetRoute: '/designer-tasks',
      });
    }
  }
 
  else if (newStatus === 'SUBMITTED' || newStatus === 'RESUBMITTED' || newStatus === 'UNDER_REVIEW') {
    const creatorId = task.createdBy || task.created_by;
    const assignedId = task.assignedTo || task.assigned_to;

    if (creatorId) {
      await dispatchNotification({
        userIds: [creatorId],
        title: `Design Uploaded for Review: ${task.title}`,
        message: `${effectiveActorName} submitted creative design for task "${task.title}". Ready for your review.`,
        type: 'INFO',
        targetRoute: `/tasks?view=my&taskId=${task.id}`,
      });
    }

    if (assignedId) {
      await dispatchNotification({
        userIds: [assignedId],
        title: `Design Submitted: ${task.title}`,
        message: `Creative design for "${task.title}" has been submitted for review.`,
        type: 'SUCCESS',
        targetRoute: '/submissions',
      });
    }
  }

  if (dbPool) {
    try {
      const numericTaskId = typeof taskId === 'number' ? taskId : (parseInt(taskId, 10) || null);
      let numericActorId = typeof effectiveActorId === 'number' ? effectiveActorId : parseInt(effectiveActorId, 10);
      if (isNaN(numericActorId) || !numericActorId) numericActorId = 1;

      if (numericTaskId) {
        await dbPool.query(
          `UPDATE tasks SET status = ?, reviewer_feedback = ?, updated_at = NOW() WHERE id = ?`,
          [newStatus, remark || null, numericTaskId]
        );
        if (!isDuplicateHistory) {
          await dbPool.query(
            `INSERT INTO task_status_history (task_id, actor_id, previous_status, new_status, remark, created_at)
             VALUES (?, ?, ?, ?, ?, NOW())`,
            [numericTaskId, numericActorId, previousStatus, newStatus, remark || null]
          );
        }
        try {
          await dbPool.query(
            `INSERT INTO task_progress_history (task_id, actor_id, progress_percent, notes, created_at)
             VALUES (?, ?, ?, ?, NOW())`,
            [numericTaskId, numericActorId, computedProgress, remark || `Status changed to ${newStatus}`]
          );
        } catch (pe) {}
      }
    } catch (e) {
      console.error('[MySQL DB Error] Task status UPDATE failed:', e?.message || e);
    }
  }


  const memIndex = dbTasksStore.findIndex((t) => String(t.id) === String(taskId));
  if (memIndex !== -1) {
    dbTasksStore[memIndex] = { ...dbTasksStore[memIndex], ...task };
  }

  await recordAuditLog(dbPool, {
    actorId: effectiveActorId,
    actorEmail: actorEmail || req.user?.email || 'admin@markops.io',
    action: `TASK_STATUS_${newStatus}`,
    entityType: 'Task',
    entityId: taskId,
    previousState: { status: previousStatus },
    newState: { status: newStatus, remark },
    ipAddress: req.ip || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'],
  });

  return res.json(task);
}

async function handleVersionSubmission(req, res, targetTask) {
  const { fileName, changelog, fileSize, filePath, fileContent, submittedBy, submittedByName, submittedByEmail } = req.body;
  const taskId = req.params.id;

  const task = targetTask || (await findTask(taskId));
  if (!task) {
    return res.status(404).json({ error: 'Task not found.' });
  }

  if (task.status === 'ASSIGNED' || task.status === 'REDESIGN_REQUIRED' || task.status === 'REVISION_REQUIRED') {
    task.status = 'IN_PROGRESS';
  }

  if (task.status !== 'IN_PROGRESS') {
    return res.status(400).json({
      error: `Invalid task status transition: Cannot submit design when task status is "${task.status}". Expected "IN_PROGRESS".`,
    });
  }

  if (!task.versions) task.versions = [];
  const newVersionNumber = task.versions.length + 1;
  const now = new Date().toISOString();

  const effectiveUser = req.user?.id || submittedBy || req.headers['x-user-id'] || 'usr_admin_01';
  const effectiveUserName = req.user?.fullName || submittedByName || req.headers['x-user-name'] || 'Designer';

  let savedFilePath = filePath;
  if (filePath && typeof filePath === 'string' && filePath.startsWith('data:')) {
    savedFilePath = saveBase64Attachment(filePath, fileName, 'creatives');
  } else if (fileContent && typeof fileContent === 'string' && fileContent.startsWith('data:')) {
    savedFilePath = saveBase64Attachment(fileContent, fileName, 'creatives');
  }
  if (!savedFilePath || (typeof savedFilePath === 'string' && savedFilePath.startsWith('data:'))) {
    savedFilePath = `/uploads/creatives/${fileName || `version_${newVersionNumber}.png`}`;
  }

  const safeFileSize = typeof fileSize === 'number' ? Math.round(fileSize) : 2048000;

  const newVersion = {
    id: `ver_${Math.random().toString(36).substring(2, 9)}`,
    taskId,
    versionNumber: newVersionNumber,
    submittedBy: effectiveUser,
    submittedByName: effectiveUserName,
    fileName: fileName || `creative_version_v${newVersionNumber}.png`,
    filePath: savedFilePath,
    fileSize: safeFileSize,
    changelog: changelog || `Version ${newVersionNumber}.0 creative asset submission.`,
    fileContent: fileContent || changelog || '',
    createdAt: now,
  };

  task.versions.unshift(newVersion);

  const creatorId = task.createdBy || task.created_by;
  const assignedId = task.assignedTo || task.assigned_to || effectiveUser;


  if (creatorId) {
    await dispatchNotification({
      userIds: [creatorId],
      title: `Design Uploaded for Review: ${task.title}`,
      message: `${effectiveUserName} uploaded creative version v${newVersionNumber}.0 (${newVersion.fileName}) for task "${task.title}". Ready for review.`,
      type: 'INFO',
      targetRoute: `/tasks?view=my&taskId=${task.id}`,
    });
  }


  if (assignedId) {
    await dispatchNotification({
      userIds: [assignedId],
      title: `Design Uploaded Successfully: ${task.title}`,
      message: `Creative version v${newVersionNumber}.0 (${newVersion.fileName}) for "${task.title}" has been submitted for review.`,
      type: 'SUCCESS',
      targetRoute: '/submissions',
    });
  }

  const previousStatus = task.status;
  const nextStatus = 'SUBMITTED';
  task.status = nextStatus;
  task.progressPercent = computeTaskProgress(nextStatus);
  task.updatedAt = now;

  if (!task.statusHistory) task.statusHistory = [];
  task.statusHistory.unshift({
    id: `hist_${Math.random().toString(36).substring(2, 9)}`,
    taskId,
    actorId: effectiveUser,
    actorName: effectiveUserName,
    previousStatus,
    newStatus: nextStatus,
    remark: `Uploaded Creative Version ${newVersionNumber}.0 (${newVersion.fileName})`,
    createdAt: now,
  });

  if (dbPool) {
    try {
      const numericTaskId = typeof taskId === 'number' ? taskId : (parseInt(taskId, 10) || null);
      let numericSubmittedBy = typeof effectiveUser === 'number' ? effectiveUser : parseInt(effectiveUser, 10);
      if (isNaN(numericSubmittedBy) || !numericSubmittedBy) {
        if (task.assignedTo) {
          numericSubmittedBy = typeof task.assignedTo === 'number' ? task.assignedTo : parseInt(task.assignedTo, 10);
        }
      }
      if (isNaN(numericSubmittedBy) || !numericSubmittedBy) numericSubmittedBy = 1;

      if (numericTaskId) {
        await dbPool.query(
          `INSERT INTO task_versions (task_id, version_number, submitted_by, file_name, file_path, storage_key, file_size, mime_type, changelog, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            numericTaskId,
            newVersionNumber,
            numericSubmittedBy,
            newVersion.fileName,
            savedFilePath,
            newVersion.fileName,
            safeFileSize,
            'image/png',
            newVersion.changelog,
          ]
        );
        await dbPool.query(
          `UPDATE tasks SET status = ?, updated_at = NOW() WHERE id = ?`,
          [nextStatus, numericTaskId]
        );
        await dbPool.query(
          `INSERT INTO task_status_history (task_id, actor_id, previous_status, new_status, remark, created_at)
           VALUES (?, ?, ?, ?, ?, NOW())`,
          [numericTaskId, numericSubmittedBy, previousStatus, nextStatus, `Uploaded Creative Version ${newVersionNumber}.0 (${newVersion.fileName})`]
        );
        try {
          await dbPool.query(
            `INSERT INTO task_progress_history (task_id, actor_id, progress_percent, notes, created_at)
             VALUES (?, ?, ?, ?, NOW())`,
            [numericTaskId, numericSubmittedBy, computeTaskProgress(nextStatus), `Uploaded Creative Version ${newVersionNumber}.0 (${newVersion.fileName})`]
          );
        } catch (pe) {}
      }
    } catch (e) {
      console.error('[MySQL DB Error] Version INSERT failed:', e?.message || e);
    }
  }


  const memIndex = dbTasksStore.findIndex((t) => String(t.id) === String(taskId));
  if (memIndex !== -1) {
    dbTasksStore[memIndex] = { ...dbTasksStore[memIndex], ...task };
  }

  emitRealtimeEvent('task:updated', task);
  emitRealtimeEvent('task:version:added', { taskId, version: newVersion });
  emitRealtimeEvent('task:submitted', task);

  await recordAuditLog(dbPool, {
    actorId: effectiveUser,
    actorEmail: submittedByEmail || 'admin@markops.io',
    action: 'TASK_VERSION_SUBMITTED',
    entityType: 'Task',
    entityId: newVersion.id,
    newState: { versionNumber: newVersionNumber, fileName: newVersion.fileName },
    ipAddress: req.ip || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'],
  });

  return res.status(201).json({ task, version: newVersion });
}


router.post('/tasks/:id/start', async (req, res) => {
  const taskId = req.params.id;
  const task = await findTask(taskId);
  if (!task) return res.status(404).json({ error: `Task #${taskId} not found.` });

  const userRole = String(req.user?.role || req.headers['x-user-role'] || '').toUpperCase();
  if (userRole !== 'DESIGNER' && userRole !== 'ADMINISTRATOR') {
    return res.status(403).json({ error: 'Permission Denied: Only assigned designer can start work.' });
  }

  if (task.status !== 'ASSIGNED') {
    return res.status(400).json({
      error: `Invalid task status transition: Cannot start work on task with status "${task.status}". Expected "ASSIGNED".`,
    });
  }

  req.body.status = 'IN_PROGRESS';
  req.body.remark = 'Designer started working on this task.';
  return handleStatusTransition(req, res);
});

router.post('/tasks/:id/submit', async (req, res) => {
  const taskId = req.params.id;
  const task = await findTask(taskId);
  if (!task) return res.status(404).json({ error: `Task #${taskId} not found.` });

  const userRole = String(req.user?.role || req.headers['x-user-role'] || '').toUpperCase();
  if (userRole !== 'DESIGNER' && userRole !== 'ADMINISTRATOR') {
    return res.status(403).json({ error: 'Permission Denied: Only assigned designer can submit designs.' });
  }

  if (task.status === 'ASSIGNED' || task.status === 'REDESIGN_REQUIRED' || task.status === 'REVISION_REQUIRED') {
    task.status = 'IN_PROGRESS';
  }

  if (task.status !== 'IN_PROGRESS') {
    return res.status(400).json({
      error: `Invalid task status transition: Cannot submit design when task status is "${task.status}". Expected "IN_PROGRESS".`,
    });
  }

  return handleVersionSubmission(req, res, task);
});


router.post('/tasks/:id/approve', async (req, res) => {
  const taskId = req.params.id;
  const task = await findTask(taskId);
  if (!task) return res.status(404).json({ error: `Task #${taskId} not found.` });

  const userId = req.user?.id ? String(req.user.id).trim() : null;
  const userEmail = req.user?.email ? String(req.user.email).toLowerCase().trim() : null;
  const taskCreatorId = String(task.createdBy || task.created_by || '').trim();
  const taskCreatorEmail = String(task.creatorEmail || task.creator_email || '').toLowerCase().trim();

  const isCreator = (userId && taskCreatorId && userId === taskCreatorId) ||
                    (userEmail && taskCreatorEmail && userEmail === taskCreatorEmail);

  if (!isCreator) {
    return res.status(403).json({ error: 'Permission Denied: Only the user who created this task can approve designs.' });
  }

  if (task.status !== 'SUBMITTED') {
    return res.status(400).json({
      error: `Invalid task status transition: Cannot approve design when task status is "${task.status}". Expected "SUBMITTED".`,
    });
  }

  const approverName = req.user?.fullName || req.headers['x-user-name'] || 'Creator';
  req.body.status = 'APPROVED';
  req.body.remark = `Design approved by ${approverName}.`;
  return handleStatusTransition(req, res);
});


router.post('/tasks/:id/redesign', async (req, res) => {
  const taskId = req.params.id;
  const task = await findTask(taskId);
  if (!task) return res.status(404).json({ error: `Task #${taskId} not found.` });

  const userId = req.user?.id ? String(req.user.id).trim() : null;
  const userEmail = req.user?.email ? String(req.user.email).toLowerCase().trim() : null;
  const taskCreatorId = String(task.createdBy || task.created_by || '').trim();
  const taskCreatorEmail = String(task.creatorEmail || task.creator_email || '').toLowerCase().trim();

  const isCreator = (userId && taskCreatorId && userId === taskCreatorId) ||
                    (userEmail && taskCreatorEmail && userEmail === taskCreatorEmail);

  if (!isCreator) {
    return res.status(403).json({ error: 'Permission Denied: Only the user who created this task can request redesign.' });
  }

  if (task.status !== 'SUBMITTED') {
    return res.status(400).json({
      error: `Invalid task status transition: Cannot request redesign when task status is "${task.status}". Expected "SUBMITTED".`,
    });
  }

  const reason = (req.body.reason || req.body.remark || '').trim();
  if (!reason) {
    return res.status(400).json({
      error: 'Redesign reason/message is mandatory. Please explain what needs to be changed.',
    });
  }

  req.body.status = 'REDESIGN_REQUIRED';
  req.body.remark = reason;
  return handleStatusTransition(req, res);
});


router.post('/tasks/:id/start-redesign', async (req, res) => {
  const taskId = req.params.id;
  const task = await findTask(taskId);
  if (!task) return res.status(404).json({ error: `Task #${taskId} not found.` });

  const userRole = String(req.user?.role || req.headers['x-user-role'] || '').toUpperCase();
  if (userRole !== 'DESIGNER' && userRole !== 'ADMINISTRATOR') {
    return res.status(403).json({ error: 'Permission Denied: Only assigned designer can start redesign.' });
  }

  if (task.status !== 'REDESIGN_REQUIRED' && task.status !== 'REVISION_REQUIRED') {
    return res.status(400).json({
      error: `Invalid task status transition: Cannot start redesign when task status is "${task.status}". Expected "REDESIGN_REQUIRED".`,
    });
  }

  req.body.status = 'IN_PROGRESS';
  req.body.remark = 'Designer started working on the requested redesign.';
  return handleStatusTransition(req, res);
});


router.post('/tasks/:id/status', handleStatusTransition);
router.put('/tasks/:id/status', handleStatusTransition);
router.patch('/tasks/:id/status', handleStatusTransition);


router.post('/tasks/:id/versions', handleVersionSubmission);


router.post('/tasks/:id/comments', async (req, res) => {
  const { comment, userId, userName, userRole } = req.body;
  const taskId = req.params.id;

  const task = await findTask(taskId);
  if (!task) {
    return res.status(404).json({ error: 'Task not found.' });
  }

  if (!comment) {
    return res.status(400).json({ error: 'Comment body cannot be empty.' });
  }

  const detectedUserId = userId || req.user?.id || req.headers['x-user-id'] || 'usr_admin_01';
  const detectedUserName = userName || req.user?.fullName || req.headers['x-user-name'] || 'System Administrator';
  const detectedUserRole = userRole || req.user?.role || req.headers['x-user-role'] || 'ADMINISTRATOR';

  const newComment = {
    id: `comm_${Math.random().toString(36).substring(2, 9)}`,
    taskId,
    userId: detectedUserId,
    userName: detectedUserName,
    userRole: detectedUserRole,
    comment: String(comment).trim(),
    createdAt: new Date().toISOString(),
  };

  if (!task.comments) task.comments = [];
  task.comments.push(newComment);
  emitRealtimeEvent('task:comment', { taskId, comment: newComment });

  if (dbPool) {
    try {
      const numericTaskId = typeof taskId === 'number' ? taskId : (parseInt(taskId, 10) || null);
      const numericUserId = typeof newComment.userId === 'number' ? newComment.userId : (parseInt(newComment.userId, 10) || 1);
      if (numericTaskId) {
        const [result] = await dbPool.query(
          `INSERT INTO task_comments (task_id, user_id, comment, created_at)
           VALUES (?, ?, ?, NOW())`,
          [numericTaskId, numericUserId, newComment.comment]
        );
        if (result && result.insertId) {
          newComment.id = result.insertId;
        }
      }
    } catch (e) {
      console.error('[MySQL DB Error] Comment INSERT failed:', e?.message || e);
    }
  }


  const memIndex = dbTasksStore.findIndex((t) => String(t.id) === String(taskId));
  if (memIndex !== -1) {
    dbTasksStore[memIndex] = { ...dbTasksStore[memIndex], ...task };
  }

 
  const taskCreatorId = task.createdBy || task.created_by;
  const taskAssigneeId = task.assignedTo || task.assigned_to;
  const commenterId = String(detectedUserId);

  if (taskAssigneeId && String(taskAssigneeId) !== commenterId) {
    dispatchNotification({
      userIds: [taskAssigneeId],
      title: `Task Comment: ${task.title}`,
      message: `${detectedUserName}: "${newComment.comment}"`,
      type: 'INFO',
      targetRoute: '/designer-tasks',
    }).catch(() => {});
  }

  if (taskCreatorId && String(taskCreatorId) !== commenterId) {
    dispatchNotification({
      userIds: [taskCreatorId],
      title: `Task Comment: ${task.title}`,
      message: `${detectedUserName}: "${newComment.comment}"`,
      type: 'INFO',
      targetRoute: `/tasks?view=my&taskId=${task.id}`,
    }).catch(() => {});
  }

  return res.status(201).json(newComment);
});


router.get('/tasks/:id/history', async (req, res) => {
  const task = await findTask(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  return res.json(task.statusHistory || []);
});

router.get('/tasks/:id/submissions', async (req, res) => {
  const task = await findTask(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  return res.json(task.versions || []);
});


router.get('/tasks/:id/messages', async (req, res) => {
  const task = await findTask(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  return res.json(task.comments || []);
});


router.post('/tasks/:id/messages', async (req, res) => {
  const { message, comment, userId, userName, userRole } = req.body;
  req.body.comment = message || comment;
  const taskId = req.params.id;

  const task = await findTask(taskId);
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  if (!req.body.comment) return res.status(400).json({ error: 'Message body cannot be empty.' });

  const detectedUserId = userId || req.user?.id || req.headers['x-user-id'] || 1;
  const detectedUserName = userName || req.user?.fullName || req.headers['x-user-name'] || 'User';
  const detectedUserRole = userRole || req.user?.role || req.headers['x-user-role'] || 'ADMINISTRATOR';

  const newComment = {
    id: `comm_${Math.random().toString(36).substring(2, 9)}`,
    taskId,
    userId: detectedUserId,
    userName: detectedUserName,
    userRole: detectedUserRole,
    comment: String(req.body.comment).trim(),
    createdAt: new Date().toISOString(),
  };

  if (!task.comments) task.comments = [];
  task.comments.push(newComment);
  emitRealtimeEvent('task:comment', { taskId, comment: newComment });

  if (dbPool) {
    try {
      const numericTaskId = typeof taskId === 'number' ? taskId : (parseInt(taskId, 10) || null);
      const numericUserId = typeof newComment.userId === 'number' ? newComment.userId : (parseInt(newComment.userId, 10) || 1);
      if (numericTaskId) {
        await dbPool.query(
          `INSERT INTO task_comments (task_id, user_id, comment, created_at) VALUES (?, ?, ?, NOW())`,
          [numericTaskId, numericUserId, newComment.comment]
        );
      }
    } catch (e) {}
  }

  return res.status(201).json(newComment);
});



router.get('/designer/dashboard-metrics', async (req, res) => {
  const targetUserId = req.query.userId || req.headers['x-user-id'];
  let designerTasks = [];

  if (dbPool) {
    try {
      let query = `
        SELECT t.*, u.full_name as assignee_full_name, c.full_name as creator_full_name, COALESCE(cr.code, 'ADMINISTRATOR') as creator_role
        FROM tasks t
        LEFT JOIN users u ON t.assigned_to = u.id
        LEFT JOIN users c ON t.created_by = c.id
        LEFT JOIN roles cr ON c.role_id = cr.id
      `;
      const params = [];
      if (targetUserId) {
        query += ' WHERE t.assigned_to = ?';
        params.push(targetUserId);
      }
      query += ' ORDER BY t.created_at DESC';

      const [rows] = await dbPool.query(query, params);
      if (Array.isArray(rows) && rows.length > 0) {
        designerTasks = await Promise.all(rows.map(async (row) => {
          const safeDueDate = formatDueDate(row.due_date);
          const detectedRole = row.creator_role || (row.creator_full_name && row.creator_full_name.toLowerCase().includes('bdm') ? 'BDM' : 'ADMINISTRATOR');

          let versions = [];
          try {
            const [verRows] = await dbPool.query(`SELECT * FROM task_versions WHERE task_id = ? ORDER BY version_number DESC`, [row.id]);
            if (Array.isArray(verRows)) {
              versions = verRows.map((v) => ({
                id: v.id,
                taskId: v.task_id,
                versionNumber: v.version_number,
                fileName: v.file_name,
                filePath: v.file_path,
                fileSize: v.file_size,
                changelog: v.changelog,
                createdAt: v.created_at ? new Date(v.created_at).toISOString() : new Date().toISOString(),
              }));
            }
          } catch (e) {}

          let statusHistory = [];
          try {
            const [histRows] = await dbPool.query(`
              SELECT h.*, u.full_name as actor_name
              FROM task_status_history h
              LEFT JOIN users u ON h.actor_id = u.id
              WHERE h.task_id = ?
              ORDER BY h.created_at DESC
            `, [row.id]);
            if (Array.isArray(histRows)) {
              statusHistory = histRows.map((h) => ({
                id: h.id,
                taskId: h.task_id,
                actorId: h.actor_id,
                actorName: h.actor_name || 'User',
                previousStatus: h.previous_status,
                newStatus: h.new_status,
                remark: h.remark,
                createdAt: h.created_at ? new Date(h.created_at).toISOString() : new Date().toISOString(),
              }));
            }
          } catch (e) {}

          return {
            id: row.id,
            title: row.title || 'Untitled Task',
            packageName: row.package_name || '',
            description: row.description || '',
            content: row.content || '',
            attachmentUrl: row.attachment_url || '',
            attachmentName: row.attachment_name || '',
            reviewerFeedback: row.reviewer_feedback || '',
            status: row.status || 'ASSIGNED',
            priority: row.priority || 'MEDIUM',
            createdBy: row.created_by,
            creatorName: row.creator_full_name || 'Manager',
            creatorRole: detectedRole,
            assignedTo: row.assigned_to || '',
            assigneeName: row.assignee_full_name || 'Designer',
            dueDate: safeDueDate,
            progressPercent: computeTaskProgress(row.status, row.progress_percent),
            createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
            updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
            versions,
            statusHistory,
            comments: [],
          };
        }));
      }
    } catch (e) {
      console.error('[MySQL DB Error] Failed to fetch designer metrics:', e?.message || e);
    }
  }

  if (designerTasks.length === 0) {
    designerTasks = targetUserId
      ? dbTasksStore.filter((t) => String(t.assignedTo) === String(targetUserId))
      : dbTasksStore;
  }

  const todayStr = new Date().toISOString().split('T')[0];

  const assignedToday = designerTasks.filter((t) => (t.createdAt && t.createdAt.startsWith(todayStr)) || t.status === 'ASSIGNED');
  const inProgress = designerTasks.filter((t) => t.status === 'IN_PROGRESS' || t.status === 'ACCEPTED');
  const dueToday = designerTasks.filter((t) => t.dueDate === todayStr);
  const overdue = designerTasks.filter((t) => t.dueDate && t.dueDate < todayStr && t.status !== 'COMPLETED' && t.status !== 'APPROVED');
  const submittedWaiting = designerTasks.filter((t) => t.status === 'SUBMITTED' || t.status === 'RESUBMITTED' || t.status === 'UNDER_REVIEW');
  const revisionRequired = designerTasks.filter((t) => t.status === 'REVISION_REQUIRED');
  const completed = designerTasks.filter((t) => t.status === 'APPROVED' || t.status === 'PUBLISHED' || t.status === 'COMPLETED');

  let totalRevisions = 0;
  designerTasks.forEach((t) => {
    if (t.versions && t.versions.length > 1) {
      totalRevisions += t.versions.length - 1;
    }
  });

  const totalEvaluated = completed.length + revisionRequired.length;
  const approvalRatePct = totalEvaluated > 0 ? Math.round((completed.length / totalEvaluated) * 100) : 0;

  const recentSubmissions = [];
  designerTasks.forEach((t) => {
    if (t.versions && t.versions.length > 0) {
      const latestVer = t.versions[0];
      const lastHistory = t.statusHistory && t.statusHistory.length > 0 ? t.statusHistory[0] : null;
      recentSubmissions.push({
        id: latestVer.id,
        taskTitle: t.title,
        versionNumber: latestVer.versionNumber,
        fileName: latestVer.fileName,
        submittedAt: latestVer.createdAt,
        status: t.status,
        reviewerRemark: lastHistory?.remark || 'Awaiting managerial review.',
      });
    }
  });

  const activityTimeline = [];
  designerTasks.forEach((t) => {
    if (t.statusHistory) {
      t.statusHistory.forEach((h) => {
        activityTimeline.push({
          id: h.id,
          action: `${h.previousStatus ? `${h.previousStatus} ➔ ` : ''}${h.newStatus}`,
          taskTitle: t.title,
          actorName: h.actorName || 'User',
          timestamp: h.createdAt,
        });
      });
    }
  });
  activityTimeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return res.json({
    assignedTodayCount: assignedToday.length,
    inProgressCount: inProgress.length,
    dueTodayCount: dueToday.length,
    overdueCount: overdue.length,
    submittedWaitingReviewCount: submittedWaiting.length,
    revisionRequiredCount: revisionRequired.length,
    completedThisMonthCount: completed.length,
    avgCompletionHours: 0,
    approvalRatePct,
    totalRevisionsCount: totalRevisions,
    activityTimeline: activityTimeline.slice(0, 8),
    recentSubmissions: recentSubmissions.slice(0, 5),
  });
});

module.exports = router;
