const express = require('express');
const {
  dbPool,
  dbTransactionsStore,
  dbLeadsStore,
  dbAdsStore,
  dbCallActivitiesStore,
  dbNotificationsStore,
} = require('../db');
const { recordAuditLog, getAuditLogs } = require('../services/audit.service');
const { dispatchNotification, stripEmojis } = require('../services/notification.service');

const router = express.Router();

router.get('/reports/summary', async (req, res) => {
  let totalRevenue = 0;
  let totalLeads = 0;
  let totalSpend = 0;
  let qualifiedCount = 0;

  if (dbPool) {
    try {
      const [leadsRows] = await dbPool.query('SELECT COUNT(*) as count, SUM(CASE WHEN status = "QUALIFIED" THEN 1 ELSE 0 END) as qualified FROM leads');
      if (leadsRows && leadsRows[0]) {
        totalLeads = Number(leadsRows[0].count) || 0;
        qualifiedCount = Number(leadsRows[0].qualified) || 0;
      }

      const [adsRows] = await dbPool.query('SELECT SUM(spend) as spend FROM ads');
      if (adsRows && adsRows[0] && adsRows[0].spend) {
        totalSpend = Number(adsRows[0].spend) || 0;
      } else {
        const [cmpRows] = await dbPool.query('SELECT SUM(spend) as spend FROM campaigns');
        if (cmpRows && cmpRows[0] && cmpRows[0].spend) {
          totalSpend = Number(cmpRows[0].spend) || 0;
        }
      }

      const [txRows] = await dbPool.query('SELECT SUM(amount) as revenue FROM transactions');
      if (txRows && txRows[0] && txRows[0].revenue) {
        totalRevenue = Number(txRows[0].revenue) || 0;
      }
    } catch (e) {
      console.log('[MySQL Reports Notice]:', e.message);
    }
  }

  if (totalLeads === 0 && dbLeadsStore.length > 0) totalLeads = dbLeadsStore.length;
  if (totalSpend === 0 && dbAdsStore.length > 0) totalSpend = dbAdsStore.reduce((sum, a) => sum + Number(a.spend || 0), 0);
  if (totalRevenue === 0 && dbTransactionsStore.length > 0) totalRevenue = dbTransactionsStore.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  if (qualifiedCount === 0 && dbLeadsStore.length > 0) qualifiedCount = dbLeadsStore.filter((l) => l.status === 'QUALIFIED').length;

  const avgCpl = totalLeads > 0 ? (totalSpend / totalLeads).toFixed(2) : '0.00';
  const overallRoi = totalSpend > 0 ? (((totalRevenue - totalSpend) / totalSpend) * 100).toFixed(1) : '0.0';
  const qualificationRate = totalLeads > 0 ? ((qualifiedCount / totalLeads) * 100).toFixed(1) : '0.0';

  return res.json({
    totalRevenue,
    totalLeads,
    totalSpend,
    avgCpl,
    overallRoi: `${overallRoi}%`,
    qualificationRate: `${qualificationRate}%`,
  });
});

router.get('/performance/metrics', (req, res) => {
  return res.json({
    designerRatios: {
      averageCompletionHours: 0,
      approvalRatePct: 0,
      totalRevisions: 0,
      onTimeDeliveryPct: 0,
    },
    telecallingRatios: {
      connectRatePct: 0,
      qualificationRatePct: 0,
      avgCallDurationSeconds: 0,
      totalCallsToday: dbCallActivitiesStore.length,
    },
    marketingRatios: {
      targetLeadsAchievementPct: 0,
      cplVariancePct: 0,
      campaignRoiPct: 0,
    },
  });
});

router.get('/exports/:type', async (req, res) => {
  const { type } = req.params;
  const filename = `MarkOps_${type.toUpperCase()}_Export_${new Date().toISOString().split('T')[0]}.csv`;

  await recordAuditLog(dbPool, {
    actorId: 'usr_admin_01',
    actorEmail: 'admin@markops.io',
    action: `EXPORT_DOWNLOADED_${type.toUpperCase()}`,
    entityType: 'Export',
    entityId: type,
    ipAddress: req.ip || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'],
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(`ID,Name,Type,Status,Date\n1,Sample Record,${type},Active,2026-09-11`);
});

router.get('/notifications', async (req, res) => {
  const userId = req.user?.id;
  if (userId == null) return res.status(401).json({ error: 'Authentication required.' });
  const userIdString = String(userId).trim().toLowerCase();
  let finalItems = dbNotificationsStore
    .filter((item) => String(item.userId || '').trim().toLowerCase() === userIdString)
    .map((n) => ({
    ...n,
    title: stripEmojis(n.title),
    message: stripEmojis(n.message),
    targetRoute: n.targetRoute || null,
  }));

  if (dbPool.isConnected()) {
    const numericUserId = Number(userId);
    if (Number.isSafeInteger(numericUserId) && numericUserId > 0) {
      const [rows] = await dbPool.queryStrict(
        `SELECT id, user_id, title, message, type, target_route, is_read, created_at
         FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50`,
        [numericUserId]
      );
      const databaseItems = rows.map((row) => ({
        id: String(row.id),
        userId: String(row.user_id),
        title: stripEmojis(row.title),
        message: stripEmojis(row.message),
        type: row.type || 'INFO',
        targetRoute: row.target_route || null,
        isRead: Boolean(row.is_read),
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      }));
      const existingIds = new Set(finalItems.map((item) => String(item.id)));
      finalItems = [...finalItems, ...databaseItems.filter((item) => !existingIds.has(String(item.id)))];
    }
  }

  finalItems.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return res.json(finalItems);
});


router.post('/notifications', async (req, res) => {
  const { userId, title, message, type, targetRoute } = req.body;
  if (!title || !message) {
    return res.status(400).json({ error: 'Title and message are required.' });
  }
  if (!['ADMINISTRATOR', 'MARKETING_MANAGER'].includes(String(req.user?.role || '').toUpperCase())) {
    return res.status(403).json({ error: 'Only administrators and marketing managers can notify other users.' });
  }
  const recipientId = userId == null ? '' : String(userId).trim();
  if (!recipientId || recipientId.toUpperCase() === 'ALL') {
    return res.status(400).json({ error: 'A single recipient user ID is required.' });
  }
  if (dbPool.isConnected()) {
    const numericRecipientId = Number(recipientId);
    if (!Number.isSafeInteger(numericRecipientId) || numericRecipientId < 1) {
      return res.status(400).json({ error: 'Recipient user ID must be a valid user ID.' });
    }
    const [users] = await dbPool.queryStrict('SELECT id FROM users WHERE id = ? LIMIT 1', [numericRecipientId]);
    if (!users.length) return res.status(404).json({ error: 'Recipient user not found.' });
  }
  const created = await dispatchNotification({
    userIds: [recipientId],
    title,
    message,
    type: type || 'INFO',
    targetRoute: targetRoute || null,
  });
  return res.status(201).json(created[0] || { success: true });
});

router.patch('/notifications/:id/read', async (req, res) => {
  const notifId = req.params.id;
  const userId = req.user?.id;
  if (userId == null) return res.status(401).json({ error: 'Authentication required.' });
  const userIdString = String(userId).trim().toLowerCase();
  const notif = dbNotificationsStore.find(
    (item) =>
      String(item.id) === String(notifId) &&
      String(item.userId).trim().toLowerCase() === userIdString
  );
  if (dbPool.isConnected()) {
    const numericUserId = Number(userId);
    const numericNotificationId = Number(notifId);
    if (!Number.isSafeInteger(numericUserId) || !Number.isSafeInteger(numericNotificationId)) {
      return res.status(404).json({ error: 'Notification not found.' });
    }
    const [rows] = await dbPool.queryStrict(
      'SELECT id FROM notifications WHERE id = ? AND user_id = ? LIMIT 1',
      [numericNotificationId, numericUserId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Notification not found.' });
    await dbPool.queryStrict(
      'UPDATE notifications SET is_read = 1, read_at = NOW() WHERE id = ? AND user_id = ?',
      [numericNotificationId, numericUserId]
    );
  } else if (!notif) {
    return res.status(404).json({ error: 'Notification not found.' });
  }
  if (notif) notif.isRead = true;
  return res.json({ success: true, id: notifId, isRead: true });
});

router.patch('/notifications/read-all', async (req, res) => {
  const userId = req.user?.id;
  if (userId == null) return res.status(401).json({ error: 'Authentication required.' });
  const numericUserId = Number(userId);
  if (dbPool.isConnected() && (!Number.isSafeInteger(numericUserId) || numericUserId < 1)) {
    return res.status(401).json({ error: 'Authenticated user ID is invalid.' });
  }

  dbNotificationsStore.forEach((n) => {
    if (String(n.userId).trim().toLowerCase() === String(userId).trim().toLowerCase()) {
      n.isRead = true;
    }
  });

  if (dbPool.isConnected()) {
    await dbPool.queryStrict(
      'UPDATE notifications SET is_read = 1, read_at = NOW() WHERE user_id = ?',
      [numericUserId]
    );
  }

  return res.json({ success: true, message: 'All notifications marked as read.' });
});

router.get('/audit-logs', async (req, res) => {
  try {
    const logs = await getAuditLogs(dbPool);
    return res.json(logs);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to fetch audit logs' });
  }
});

module.exports = router;
