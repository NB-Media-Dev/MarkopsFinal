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
const { resolveUserAliases, dispatchNotification, stripEmojis } = require('../services/notification.service');

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
  const userId = req.headers['x-user-id'] || req.query.userId;
  const userRole = (req.headers['x-user-role'] || req.query.role || '').toUpperCase();
  const userName = (req.headers['x-user-name'] || req.query.name || '').toLowerCase();
  const userEmail = (req.headers['x-user-email'] || req.query.email || '').toLowerCase();

  const userAliases = resolveUserAliases(userId, userRole, userEmail, userName);
  const isTelecaller = userRole === 'TELECALLER' || userAliases.has('telecaller') || userAliases.has('6') || userAliases.has('raj');

 
  if (Array.isArray(dbNotificationsStore)) {
    for (let i = dbNotificationsStore.length - 1; i >= 0; i--) {
      const item = dbNotificationsStore[i];
      const t = String(item.title || '').toLowerCase();
      const m = String(item.message || '').toLowerCase();
      if (
        String(item.id).startsWith('notif_raj_leads_assigned_') ||
        t.includes('30 leads') ||
        m.includes('total leads: 30')
      ) {
        dbNotificationsStore.splice(i, 1);
      }
    }
  }

 
  const seenKeys = new Set();
  const dedupedStore = [];
  dbNotificationsStore.forEach((n) => {
    const key = `${n.userId || ''}_${stripEmojis(n.title)}_${stripEmojis(n.message)}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      dedupedStore.push(n);
    }
  });

 
  let memoryMatched = dedupedStore.filter((n) => {
    if (!n.userId) return false;
    const nUid = String(n.userId).toLowerCase().trim();
    return userAliases.has(nUid);
  });

  const isDesigner = userRole === 'DESIGNER' || userAliases.has('designer') || userAliases.has('5');

  let finalItems = memoryMatched.map((n) => ({
    ...n,
    title: stripEmojis(n.title),
    message: stripEmojis(n.message),
    targetRoute: n.targetRoute || null,
  }));

 
  if (dbPool) {
    try {
      const numericIds = [];
      userAliases.forEach((alias) => {
        const num = parseInt(alias, 10);
        if (!isNaN(num) && !numericIds.includes(num)) {
          numericIds.push(num);
        }
      });

      if (numericIds.length > 0) {
        const [rows] = await dbPool.query(
          `SELECT id, user_id, title, message, type, target_route, is_read, created_at
           FROM notifications
           WHERE user_id IN (?)
           ORDER BY id DESC
           LIMIT 50`,
          [numericIds]
        );

        if (Array.isArray(rows) && rows.length > 0) {
          const dbItems = rows.map((r) => ({
            id: String(r.id),
            userId: String(r.user_id),
            title: stripEmojis(r.title),
            message: stripEmojis(r.message),
            type: r.type || 'INFO',
            targetRoute: r.target_route || null,
            isRead: Boolean(r.is_read),
            createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
          }));

          const existingKeys = new Set(finalItems.map((n) => `${n.title}_${n.message}`));
          const uniqueDbItems = dbItems.filter((d) => !existingKeys.has(`${d.title}_${d.message}`));
          finalItems = [...finalItems, ...uniqueDbItems];
        }
      }
    } catch (e) {

      try {
        const numericIds = [];
        userAliases.forEach((alias) => {
          const num = parseInt(alias, 10);
          if (!isNaN(num) && !numericIds.includes(num)) numericIds.push(num);
        });
        if (numericIds.length > 0) {
          const [rows2] = await dbPool.query(
            `SELECT id, user_id, title, message, type, is_read, created_at
             FROM notifications
             WHERE user_id IN (?)
             ORDER BY id DESC
             LIMIT 50`,
            [numericIds]
          );
          if (Array.isArray(rows2) && rows2.length > 0) {
            const dbItems2 = rows2.map((r) => ({
              id: String(r.id),
              userId: String(r.user_id),
              title: stripEmojis(r.title),
              message: stripEmojis(r.message),
              type: r.type || 'INFO',
              isRead: Boolean(r.is_read),
              createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
            }));
            const existingKeys = new Set(finalItems.map((n) => `${n.title}_${n.message}`));
            const uniqueDbItems = dbItems2.filter((d) => !existingKeys.has(`${d.title}_${d.message}`));
            finalItems = [...finalItems, ...uniqueDbItems];
          }
        }
      } catch (innerE) {}
    }
  }


  if (isDesigner) {
    finalItems = finalItems.filter((n) => {
      const t = (n.title || '').toLowerCase();
      const m = (n.message || '').toLowerCase();
      const tr = (n.targetRoute || '').toLowerCase();
      if (
        t.includes('lead') ||
        m.includes('lead') ||
        t.includes('telecall') ||
        m.includes('telecall') ||
        t.includes('call logged') ||
        m.includes('call logged') ||
        t.includes('interested') ||
        m.includes('interested') ||
        t.includes('qualified') ||
        m.includes('qualified') ||
        t.includes('campaign') ||
        m.includes('campaign') ||
        t.includes('target') ||
        m.includes('target') ||
        tr.includes('/leads') ||
        tr.includes('/telecalling') ||
        tr.includes('/targets') ||
        tr.includes('dept=telecalling')
      ) {
        return false;
      }
      return true;
    });
  } else if (isTelecaller) {
    finalItems = finalItems.filter((n) => {
      const t = (n.title || '').toLowerCase();
      const m = (n.message || '').toLowerCase();
      const tr = (n.targetRoute || '').toLowerCase();
      if (
        t.includes('task approved') ||
        t.includes('design uploaded') ||
        t.includes('redesign') ||
        t.includes('submission') ||
        t.includes('creative design') ||
        t.includes('creative brief') ||
        tr.includes('/designer-tasks') ||
        tr.includes('/submissions') ||
        tr.includes('/revisions') ||
        tr.includes('dept=designer')
      ) {
        return false;
      }
      return true;
    });
  }

 
  finalItems.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return res.json(finalItems);
});


router.post('/notifications', async (req, res) => {
  const { userId, title, message, type, targetRoute } = req.body;
  if (!title || !message) {
    return res.status(400).json({ error: 'Title and message are required.' });
  }
  const created = await dispatchNotification({
    userIds: [userId || 'ALL'],
    title,
    message,
    type: type || 'INFO',
    targetRoute: targetRoute || null,
  });
  return res.status(201).json(created[0] || { success: true });
});

router.patch('/notifications/:id/read', async (req, res) => {
  const notifId = req.params.id;
  const notif = dbNotificationsStore.find((n) => String(n.id) === String(notifId));
  if (notif) {
    notif.isRead = true;
  }

  if (dbPool) {
    try {
      const numId = parseInt(notifId, 10);
      if (!isNaN(numId)) {
        await dbPool.query('UPDATE notifications SET is_read = 1, read_at = NOW() WHERE id = ?', [numId]);
      }
    } catch (e) {
      console.error('[MySQL DB Error] UPDATE notification read state failed:', e?.message || e);
    }
  }

  return res.json({ success: true, id: notifId, isRead: true });
});

router.patch('/notifications/read-all', async (req, res) => {
  const userId = req.headers['x-user-id'] || req.query.userId;
  const userRole = (req.headers['x-user-role'] || req.query.role || '').toUpperCase();
  const userAliases = resolveUserAliases(userId, userRole);

  dbNotificationsStore.forEach((n) => {
    if (!userId || !n.userId || userAliases.has(String(n.userId).toLowerCase())) {
      n.isRead = true;
    }
  });

  if (dbPool) {
    try {
      const numericIds = [];
      userAliases.forEach((alias) => {
        const num = parseInt(alias, 10);
        if (!isNaN(num) && !numericIds.includes(num)) numericIds.push(num);
      });
      if (numericIds.length > 0) {
        await dbPool.query('UPDATE notifications SET is_read = 1, read_at = NOW() WHERE user_id IN (?)', [numericIds]);
      }
    } catch (e) {
      console.error('[MySQL DB Error] UPDATE read-all notifications failed:', e?.message || e);
    }
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
