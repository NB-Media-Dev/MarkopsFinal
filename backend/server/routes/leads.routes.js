function resolveLeadRowStatus(row) {
  if (row.assigned_to && (!row.status || row.status === 'NEW' || row.status === 'CONNECTED')) {
    return 'ASSIGNED';
  }
  if (row.status === 'QUALIFIED' || row.status === 'CONVERTED') {
    return 'PAID';
  }
  return row.status;
}

function resolveCalledAt(r) {
  const raw = r.called_at || r.calledAt;
  return raw ? new Date(raw).toISOString() : new Date().toISOString();
}

const PUNCT_CHARS = new Set(['<', '(', '[', '{', '"', "'", '>', ']', '}', ')', '.', ',', ';', ':']);
function extractFirstEmail(text) {
  if (!text?.includes('@')) return '';
  const tokens = String(text).split(/\s+/);
  for (const token of tokens) {
    let clean = token.trim();
    while (clean.length > 0 && PUNCT_CHARS.has(clean[0])) {
      clean = clean.slice(1);
    }
    while (clean.length > 0 && PUNCT_CHARS.has(clean.at(-1))) {
      clean = clean.slice(0, -1);
    }
    const atIdx = clean.indexOf('@');
    const lastDot = clean.lastIndexOf('.');
    if (atIdx > 0 && lastDot > atIdx + 1 && lastDot < clean.length - 1) {
      return clean;
    }
  }
  return '';
}

const crypto = require('node:crypto');
const express = require('express');
const {
  dbPool,
  dbLeadsStore,
  dbUsersStore,
  dbAdsStore,
  dbCallActivitiesStore,
  dbFollowUpsStore,
  dbCommonTargetStore,
  dbTelecallerTargetsStore,
  dbNotificationsStore,
} = require('../db');
const { recordAuditLog } = require('../services/audit.service');
const { emitRealtimeEvent } = require('../events');
const { dispatchNotification } = require('../services/notification.service');
const { requireRole } = require('../middleware/auth.middleware');
const router = express.Router();

function resolveCurrentUserId(req) {
  if (req.user?.id) return String(req.user.id);
  if (req.headers['x-user-id']) return String(req.headers['x-user-id']);
  return null;
}

function resolveLeadCreatorId(lead) {
  if (lead.creator_id !== undefined && lead.creator_id !== null) return String(lead.creator_id);
  if (lead.creatorId !== undefined && lead.creatorId !== null) return String(lead.creatorId);
  return '';
}

function resolvePackageProductName(pkgName, customProductName) {
  if (customProductName) return customProductName;
  const lower = String(pkgName || '').toLowerCase();
  if (lower.includes('class')) return 'Classmate';
  if (lower.includes('jesus')) return 'Jesus the messanger';
  return 'Careermate';
}

function createNotificationForTelecaller(targetUserId, title, message, targetRoute = '') {
  if (!targetUserId) return;
  dispatchNotification({
    userIds: [targetUserId],
    title,
    message,
    type: 'INFO',
    targetRoute: targetRoute || '/package-works?dept=TELECALLING&tab=TELECALLING',
  }).catch((err) => console.log('[Notice] Non-critical notification failed:', err?.message || err));
}

function isSameNumericCallId(id1, id2) {
  if (id1 && id2 && String(id1).trim() === String(id2).trim()) {
    return true;
  }
  const isPureDbId1 = /^call_\d+$/.test(String(id1 || '').trim()) || /^\d+$/.test(String(id1 || '').trim());
  const isPureDbId2 = /^call_\d+$/.test(String(id2 || '').trim()) || /^\d+$/.test(String(id2 || '').trim());
  if (isPureDbId1 && isPureDbId2) {
    const num1 = String(id1).replace(/\D/g, '');
    const num2 = String(id2).replace(/\D/g, '');
    if (num1 && num2 && num1 === num2) {
      return true;
    }
  }
  return false;
}

function isSameLead(c1, c2) {
  const lead1 = String(c1.leadId || '').replace(/\D/g, '') || String(c1.leadId || '').trim();
  const lead2 = String(c2.leadId || '').replace(/\D/g, '') || String(c2.leadId || '').trim();
  if (lead1 && lead2 && lead1 === lead2) return true;
  const phone1 = String(c1.leadPhone || c1.phone || '').replace(/\D/g, '');
  const phone2 = String(c2.leadPhone || c2.phone || '').replace(/\D/g, '');
  return Boolean(phone1 && phone2 && (phone1 === phone2 || (phone1.length >= 7 && phone2.length >= 7 && (phone1.endsWith(phone2) || phone2.endsWith(phone1)))));
}

function isMatchingOutcome(outcome1, outcome2) {
  const out1 = String(outcome1 || '').toUpperCase().replace(/\s+/g, '_');
  const out2 = String(outcome2 || '').toUpperCase().replace(/\s+/g, '_');
  if (out1 === out2) return true;
  if ((out1 === 'FOLLOW_UP' && out2 === 'CONNECTED') || (out1 === 'CONNECTED' && out2 === 'FOLLOW_UP')) return true;
  if ((out1 === 'LINE_BUSY' && out2 === 'BUSY') || (out1 === 'BUSY' && out2 === 'LINE_BUSY')) return true;
  return (out1 === 'QUALIFIED' || out1 === 'PAID') && (out2 === 'QUALIFIED' || out2 === 'PAID');
}

function isMatchingCallTimestamp(time1, time2) {
  if (!time1 || !time2) return true;
  const t1 = new Date(time1).getTime();
  const t2 = new Date(time2).getTime();
  if (Number.isNaN(t1) || Number.isNaN(t2)) return true;
  const diff = Math.abs(t1 - t2);
  const isFivePointFiveHours = Math.abs(diff - (5.5 * 3600 * 1000)) <= 60000;
  return diff <= 60000 || isFivePointFiveHours;
}

function isSameCallActivity(c1, c2) {
  if (!c1 || !c2) return false;
  if (isSameNumericCallId(c1.id, c2.id)) return true;
  if (!isSameLead(c1, c2)) return false;
  if (!isMatchingOutcome(c1.outcome, c2.outcome)) return false;
  return isMatchingCallTimestamp(c1.calledAt, c2.calledAt);
}

function normalizeCallOutcome(rawOutcome) {
  if (rawOutcome === 'QUALIFIED' || rawOutcome === 'CONVERTED' || rawOutcome === 'PAID') return 'PAID';
  if (rawOutcome === 'BUSY') return 'LINE_BUSY';
  return rawOutcome;
}

function mapDbRowToCall(r) {
  return {
    id: `call_${r.id}`,
    leadId: String(r.lead_id || r.leadId || ''),
    leadPhone: r.lead_phone || '',
    leadName: `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.lead_name || 'Lead Customer',
    telecallerId: String(r.telecaller_id || r.telecallerId || ''),
    telecallerName: r.telecaller_name || 'Telecaller',
    telecallerEmail: r.telecaller_email || '',
    outcome: normalizeCallOutcome(r.outcome),
    durationSeconds: r.duration_seconds !== undefined ? (Number(r.duration_seconds) || 0) : (Number(r.durationSeconds) || 0),
    remarks: r.remarks || '',
    nextAction: r.next_action || r.nextAction || '',
    followUpDate: r.follow_up_date || r.followUpDate || '',
    followUpTime: r.follow_up_time || r.followUpTime || '',
    calledAt: resolveCalledAt(r),
  };
}

function mergeCallWithMemory(dbC, memCalls) {
  const memMatch = memCalls.find((memCall) => isSameCallActivity(memCall, dbC));
  if (memMatch) {
    if (!dbC.followUpDate && memMatch.followUpDate) dbC.followUpDate = memMatch.followUpDate;
    if (!dbC.followUpTime && memMatch.followUpTime) dbC.followUpTime = memMatch.followUpTime;
    if (memMatch.outcome === 'FOLLOW_UP' && dbC.outcome === 'CONNECTED') dbC.outcome = 'FOLLOW_UP';
  }
}

function reconcileCallActivities(dbRows) {
  if (!Array.isArray(dbRows)) return dbCallActivitiesStore;

  const seenIds = new Set();
  const uniqueDbCalls = [];
  for (const r of dbRows) {
    const callId = `call_${r.id}`;
    if (!seenIds.has(callId)) {
      seenIds.add(callId);
      uniqueDbCalls.push(mapDbRowToCall(r));
    }
  }

  uniqueDbCalls.forEach((dbC) => mergeCallWithMemory(dbC, dbCallActivitiesStore));

  const memoryOnlyCalls = dbCallActivitiesStore.filter((memCall) => {
    return !uniqueDbCalls.some((dbC) => isSameCallActivity(memCall, dbC));
  });

  const merged = [...uniqueDbCalls, ...memoryOnlyCalls].sort(
    (a, b) => new Date(b.calledAt).getTime() - new Date(a.calledAt).getTime()
  );

  dbCallActivitiesStore.length = 0;
  dbCallActivitiesStore.push(...merged);

  return dbCallActivitiesStore;
}

function matchesLeadCall(c, lId, lPhone, lName) {
  const cLeadId = String(c.leadId || '').trim().toLowerCase();
  const cPhone = String(c.leadPhone || c.phone || '').replace(/\D/g, '');
  const cLeadName = String(c.leadName || '').trim().toLowerCase();
  if (cLeadId && lId && (cLeadId === lId || cLeadId.replace(/\D/g, '') === lId.replace(/\D/g, ''))) return true;
  if (lPhone && cPhone && lPhone.length >= 7 && (lPhone === cPhone || lPhone.endsWith(cPhone) || cPhone.endsWith(lPhone))) return true;
  return Boolean(!lPhone && !cPhone && cLeadName && lName && cLeadName === lName);
}

function resolveCallLeadStatus(latestCall, currentStatus) {
  const out = String(latestCall.outcome || '').toUpperCase().replace(/\s+/g, '_');
  if (out === 'BUSY' || out === 'LINE_BUSY') return 'LINE_BUSY';
  if (out === 'QUALIFIED' || out === 'CONVERTED' || out === 'PAID') return 'PAID';
  if (out === 'FOLLOW_UP' || out === 'FOLLOW_UP_SCHEDULED') return 'FOLLOW_UP';
  if (out === 'CONNECTED') {
    return (latestCall.followUpDate || latestCall.nextAction) ? 'FOLLOW_UP' : (currentStatus || 'ASSIGNED');
  }
  return out || currentStatus || 'ASSIGNED';
}

function enrichLeadWithCallActivities(lead, callActivities) {
  const lId = String(lead.id || '').trim().toLowerCase();
  const lPhone = String(lead.phone || '').replace(/\D/g, '');
  const lName = `${lead.firstName || ''} ${lead.lastName || ''}`.trim().toLowerCase();

  const leadCalls = callActivities
    .filter((c) => matchesLeadCall(c, lId, lPhone, lName))
    .sort((a, b) => new Date(b.calledAt || 0).getTime() - new Date(a.calledAt || 0).getTime());

  if (leadCalls.length > 0) {
    const latestCall = leadCalls[0];
    lead.status = resolveCallLeadStatus(latestCall, lead.status);
    if (latestCall.remarks && latestCall.remarks !== '—') {
      lead.remarks = latestCall.remarks;
      lead.notes = latestCall.remarks;
    }
  } else if ((lead.assignedTo || lead.assigned_to) && (!lead.status || lead.status === 'NEW' || lead.status === 'CONNECTED')) {
    lead.status = 'ASSIGNED';
  }
}

function enrichLeadWithCreator(lead, usersStore) {
  if (!lead.creatorName && (lead.creatorId || lead.uploaderId || lead.creatorEmail || lead.uploaderEmail)) {
    const uId = String(lead.creatorId || lead.uploaderId || '').toLowerCase();
    const uEm = String(lead.creatorEmail || lead.uploaderEmail || '').toLowerCase();
    const foundUser = usersStore.find(
      (u) => (uId && String(u.id).toLowerCase() === uId) || (uEm && u.email?.toLowerCase() === uEm)
    );
    if (foundUser) {
      lead.creatorName = foundUser.fullName;
      lead.creatorEmail = foundUser.email;
    }
  }
}

async function fetchLeadsFromDatabase(currentUserId, currentUserEmail, currentUserName, isTelecallerRole) {
  try {
    let queryStr = `
      SELECT l.*, 
             c.full_name as creator_full_name, 
             c.email as creator_user_email,
             u.full_name as assignee_full_name,
             u.email as assignee_user_email,
             a.name as ad_name
      FROM leads l
      LEFT JOIN users c ON l.creator_id = c.id
      LEFT JOIN users u ON (l.assigned_to = u.id OR CAST(l.assigned_to AS CHAR) = CAST(u.id AS CHAR) OR LOWER(l.assigned_to) = LOWER(u.full_name) OR LOWER(l.assigned_to) = LOWER(u.email))
      LEFT JOIN ads a ON l.ad_id = a.id
    `;
    const queryParams = [];

    if (isTelecallerRole) {
      const numUid = Number.parseInt(String(currentUserId || '').replace(/\D/g, ''), 10);
      queryStr += `
        WHERE (
          l.assigned_to = ?
          OR l.assigned_to = ?
          OR CAST(l.assigned_to AS CHAR) = ?
          OR LOWER(l.assigned_to) = ?
          OR LOWER(l.assigned_to) = ?
          OR (u.id IS NOT NULL AND (u.id = ? OR CAST(u.id AS CHAR) = ?))
          OR (u.email IS NOT NULL AND LOWER(u.email) = ?)
          OR (u.full_name IS NOT NULL AND (LOWER(u.full_name) = ? OR LOWER(u.full_name) LIKE ?))
        )
      `;
      queryParams.push(
        currentUserId || -1,
        Number.isNaN(numUid) ? -1 : numUid,
        currentUserId || '__none__',
        currentUserEmail || '__none__',
        currentUserName || '__none__',
        Number.isNaN(numUid) ? -1 : numUid,
        currentUserId || '__none__',
        currentUserEmail || '__none__',
        currentUserName || '__none__',
        `%${currentUserName || '__none__'}%`
      );
    }

    queryStr += ` ORDER BY l.created_at DESC`;

    try {
      const [callRows] = await dbPool.query(`
        SELECT ca.*, l.phone as lead_phone, l.first_name, l.last_name, u.full_name as telecaller_name, u.email as telecaller_email
        FROM call_activities ca
        LEFT JOIN leads l ON ca.lead_id = l.id
        LEFT JOIN users u ON ca.telecaller_id = u.id
        ORDER BY ca.called_at DESC
      `);
      if (Array.isArray(callRows)) {
        reconcileCallActivities(callRows);
      }
    } catch (callErr) {
      console.log('[MySQL Notice] Call activities fetch skipped:', callErr?.message || callErr);
    }

    const [rows] = await dbPool.query(queryStr, queryParams);
    if (!Array.isArray(rows)) return null;

    const leads = rows.map((row) => {
      const inMem = dbLeadsStore.find((m) => String(m.id) === String(row.id) || (m.phone && row.phone && m.phone.replace(/\D/g, '') === row.phone.replace(/\D/g, '')));
      const matchedAd = dbAdsStore.find((ad) => String(ad.id) === String(row.ad_id) || String(ad.platformAdId) === String(row.ad_id));
      const matchedAdByCmp = dbAdsStore.find((ad) => (row.campaign_id && String(ad.campaignId) === String(row.campaign_id)) || (row.campaign_name && ad.campaignName?.toLowerCase().trim() === String(row.campaign_name).toLowerCase().trim()));
      const finalAdName = row.ad_name || inMem?.adName || inMem?.ad_name || (matchedAd ? matchedAd.name : '') || (matchedAdByCmp ? matchedAdByCmp.name : '') || (row.adName || '');
      const finalAdId = row.ad_id ? String(row.ad_id) : (inMem?.adId || row.adId || '');
      const finalCreatorName = row.creator_full_name || row.creator_name || inMem?.creatorName || 'System Administrator';
      const finalCreatorEmail = row.creator_user_email || row.creator_email || inMem?.creatorEmail || 'admin@markops.io';
      return {
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        email: row.email,
        phone: row.phone,
        source: row.source,
        status: resolveLeadRowStatus(row),
        assignedTo: row.assigned_to,
        assigned_to: row.assigned_to,
        assigneeName: row.assignee_full_name || (row.assigned_to ? 'Telecaller' : 'Unassigned'),
        creatorId: row.creator_id,
        creator_id: row.creator_id,
        creatorName: finalCreatorName,
        creator_name: finalCreatorName,
        creatorEmail: finalCreatorEmail,
        creator_email: finalCreatorEmail,
        campaignId: row.campaign_id,
        campaignName: row.campaign_name || '',
        packageName: row.package_name || inMem?.packageName || inMem?.package || '',
        package: row.package_name || inMem?.package || inMem?.packageName || '',
        productId: row.product_id || inMem?.productId || '',
        productName: row.product_name || inMem?.productName || '',
        adId: finalAdId,
        adName: finalAdName,
        remarks: inMem?.remarks || inMem?.notes || '',
        notes: inMem?.notes || inMem?.remarks || '',
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
        updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
      };
    });

    if (Array.isArray(dbCallActivitiesStore)) {
      leads.forEach((lead) => enrichLeadWithCallActivities(lead, dbCallActivitiesStore));
    }

    return leads;
  } catch (e) {
    console.error('[MySQL DB Error] Failed to fetch leads from MySQL:', e?.message || e);
    return null;
  }
}

function fetchLeadsFromMemory(currentUserId, currentUserEmail, currentUserName, isTelecallerRole) {
  let leads = [...dbLeadsStore];
  if (isTelecallerRole) {
    leads = leads.filter((l) => {
      const aTo = String(l.assignedTo || l.assigned_to || l.assignedTelecallerId || l.assigned_telecaller_id || '').toLowerCase().trim();
      const aName = String(l.assigneeName || l.assignee_name || '').toLowerCase().trim();
      const uid = String(currentUserId || '').toLowerCase().trim();
      const uemail = String(currentUserEmail || '').toLowerCase().trim();
      const uname = String(currentUserName || '').toLowerCase().trim();

      if (uid && (aTo === uid || Number.parseInt(aTo, 10) === Number.parseInt(uid, 10))) return true;
      if (uemail && (aTo === uemail || aName === uemail || aTo.includes(uemail))) return true;
      if (uname && (aName === uname || aTo === uname || aName.includes(uname) || uname.includes(aName) || aTo.includes(uname))) return true;
      return false;
    });
  }

  if (Array.isArray(leads) && Array.isArray(dbCallActivitiesStore)) {
    leads.forEach((lead) => {
      enrichLeadWithCallActivities(lead, dbCallActivitiesStore);
      enrichLeadWithCreator(lead, dbUsersStore);
    });
  }

  return leads;
}

router.get('/leads', async (req, res) => {
  const currentRole = String(req.user?.role || req.headers['x-user-role'] || '').toUpperCase();
  const currentUserId = resolveCurrentUserId(req);
  const currentUserEmail = (req.user?.email || req.headers['x-user-email'] || '').toLowerCase().trim();
  const currentUserName = (req.user?.fullName || req.headers['x-user-name'] || '').toLowerCase().trim();
  const isTelecallerRole = currentRole === 'TELECALLER';

  if (dbPool) {
    const dbLeads = await fetchLeadsFromDatabase(currentUserId, currentUserEmail, currentUserName, isTelecallerRole);
    if (dbLeads) return res.json(dbLeads);
  }

  const leads = fetchLeadsFromMemory(currentUserId, currentUserEmail, currentUserName, isTelecallerRole);
  return res.json(leads);
});

function resolveLeadCreatorDetails(effectiveUserId, creatorName, creatorEmail, usersStore) {
  let resolvedCreatorName = creatorName;
  let resolvedCreatorEmail = creatorEmail;

  if ((!resolvedCreatorName || resolvedCreatorName === 'System Administrator') && effectiveUserId) {
    const foundUser = usersStore.find(
      (u) => String(u.id).toLowerCase() === String(effectiveUserId).toLowerCase() || (u.email?.toLowerCase() === String(effectiveUserId).toLowerCase())
    );
    if (foundUser) {
      resolvedCreatorName = foundUser.fullName;
      resolvedCreatorEmail = foundUser.email;
    }
  }

  return {
    resolvedCreatorName: resolvedCreatorName || 'System Administrator',
    resolvedCreatorEmail: resolvedCreatorEmail || 'admin@markops.io',
  };
}

async function resolveLeadParentCampaign(pool, campName, campId) {
  if (!pool) return null;
  try {
    const [campaigns] = await pool.query('SELECT id FROM campaigns WHERE name = ? LIMIT 1', [campName]);
    if (campaigns && campaigns.length > 0) {
      return campaigns[0].id;
    }
    const requestedCampaignId = Number(campId);
    if (Number.isInteger(requestedCampaignId) && requestedCampaignId > 0) {
      const [requestedCampaigns] = await pool.query('SELECT id FROM campaigns WHERE id = ? LIMIT 1', [requestedCampaignId]);
      if (requestedCampaigns?.[0]?.id) return requestedCampaigns[0].id;
    }
    const [firstCmp] = await pool.query('SELECT id FROM campaigns LIMIT 1');
    return firstCmp?.[0]?.id || null;
  } catch (dbErr) {
    console.log('[MySQL LookUp Notice] Failed to find parent campaign for lead:', dbErr.message);
    return null;
  }
}

async function resolveOrCreateLeadAd(pool, targetAdName, mysqlCampaignId, numericCreatorId, targetAdId) {
  let numericAdId = targetAdId ? (Number.parseInt(targetAdId.replace(/\D/g, ''), 10) || null) : null;
  if (!pool || !targetAdName) return numericAdId;

  try {
    const [existingAds] = await pool.query('SELECT id, name FROM ads WHERE name = ? LIMIT 1', [targetAdName]);
    if (existingAds && existingAds.length > 0) {
      return existingAds[0].id;
    }
    if (mysqlCampaignId) {
      const [insertedAd] = await pool.query(
        `INSERT INTO ads (campaign_id, created_by, name, platform, status, spend, impressions, clicks, leads_count, created_at, updated_at)
         VALUES (?, ?, ?, 'Meta', 'ACTIVE', 0, 0, 0, 0, NOW(), NOW())`,
        [mysqlCampaignId, numericCreatorId, targetAdName]
      );
      if (insertedAd?.insertId) {
        return insertedAd.insertId;
      }
    }
  } catch (adErr) {
    console.log('[MySQL Notice] Auto-link ad for lead notice:', adErr.message);
  }
  return numericAdId;
}

async function persistLeadToDatabase(pool, newLead, numericAssignedTo, numericCreatorId, mysqlCampaignId, numericAdId) {
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO leads (first_name, last_name, email, phone, source, status, assigned_to, assigned_telecaller_id, assignment_status, creator_id, creator_name, creator_email, campaign_id, campaign_name, package_name, product_id, ad_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        newLead.firstName,
        newLead.lastName,
        newLead.email,
        newLead.phone,
        newLead.source,
        newLead.status,
        numericAssignedTo,
        numericAssignedTo,
        newLead.assignmentStatus,
        numericCreatorId,
        newLead.creatorName,
        newLead.creatorEmail,
        mysqlCampaignId,
        newLead.campaignName,
        newLead.packageName || null,
        newLead.productId || null,
        numericAdId,
      ]
    );
  } catch (e) {
    console.log('[MySQL Notice] Save lead to database with ad_id failed, trying default format:', e?.message || e);
    try {
      await pool.query(
        `INSERT INTO leads (first_name, last_name, email, phone, source, status, assigned_to, creator_id, creator_name, creator_email, campaign_id, campaign_name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          newLead.firstName,
          newLead.lastName,
          newLead.email,
          newLead.phone,
          newLead.source,
          newLead.status,
          numericAssignedTo,
          numericCreatorId,
          newLead.creatorName,
          newLead.creatorEmail,
          mysqlCampaignId,
          newLead.campaignName,
        ]
      );
    } catch (fallbackErr) {
      console.log('[MySQL Notice] Fallback save lead failed:', fallbackErr?.message || fallbackErr);
    }
  }
}

function notifyLeadCreatedAssignment(newLead, targetAssignedTo, targetAssigneeName, campName, reqBody) {
  if (!targetAssignedTo) return;
  emitRealtimeEvent('lead:assigned', newLead);
  const creator = reqBody.creatorName || reqBody.creatorEmail || 'System Administrator';
  const prod = reqBody.productName || 'Careermate';
  const pkg = reqBody.packageName || campName || 'CURRENT AFFAIRS AUGUST -2026';
  const msg = `Assigned by: ${creator} -> Product: ${prod} -> Package: ${pkg} -> Total Leads: 1`;
  const targetRoute = `/package-works?package=${encodeURIComponent(prod)}&workspace=${encodeURIComponent(pkg)}&dept=TELECALLING&tab=TELECALLING`;
  createNotificationForTelecaller(targetAssignedTo, 'New Lead Assigned', msg, targetRoute);

  if (newLead.creatorId && String(newLead.creatorId) !== String(targetAssignedTo)) {
    dispatchNotification({
      userIds: [newLead.creatorId],
      title: 'Lead Assigned Successfully',
      message: `Lead "\${newLead.firstName} \${newLead.lastName || ''}" has been assigned to \${targetAssigneeName}.`,
      type: 'INFO',
      targetRoute: '/leads',
    }).catch((err) => console.log('[Notice] Non-critical notification failed:', err?.message || err));
  }
}

router.post('/leads', async (req, res) => {
  const { firstName, lastName, email, phone, source, campaignId, campaignName, adId, adName, assignedTo, assigneeName, creatorId, creatorEmail, creatorRole, creatorName, productName, packageName } = req.body;
  const effectiveRole = String(creatorRole || req.headers['x-user-role'] || '').toUpperCase();

  if (effectiveRole === 'TELECALLER' || effectiveRole === 'BDM') {
    return res.status(403).json({ error: 'Access Denied: Role is not authorized to create leads.' });
  }

  const fName = String(firstName || '').trim();
  const lName = String(lastName || '').trim();
  const em = String(email || '').trim();
  const ph = String(phone || '').trim();
  const src = String(source || '').trim();

  if (!fName || !lName || !em || !ph || !src) {
    return res.status(400).json({
      error: 'Validation Error: All fields (First Name, Last Name, Email, Phone, Source) are strictly required.',
    });
  }

  const campId = String(campaignId || '').trim();
  const campName = String(campaignName || 'General Intake').trim();
  const targetAdId = String(adId || '').trim();
  const targetAdName = String(adName || '').trim();
  const targetAssignedTo = assignedTo ? String(assignedTo).trim() : null;
  const targetAssigneeName = targetAssignedTo ? String(assigneeName || 'Assigned Telecaller').trim() : 'Unassigned';

  const effectiveUserId = creatorId || req.headers['x-user-id'];
  const { resolvedCreatorName, resolvedCreatorEmail } = resolveLeadCreatorDetails(effectiveUserId, creatorName || req.headers['x-user-name'], creatorEmail || req.headers['x-user-email'], dbUsersStore);

  const mysqlCampaignId = await resolveLeadParentCampaign(dbPool, campName, campId);
  const numericCreatorId = Number.parseInt(String(effectiveUserId || '1').replace(/\D/g, ''), 10) || 1;
  const numericAssignedTo = targetAssignedTo ? (Number.parseInt(targetAssignedTo.replace(/\D/g, ''), 10) || null) : null;
  const numericAdId = await resolveOrCreateLeadAd(dbPool, targetAdName, mysqlCampaignId, numericCreatorId, targetAdId);

  const newLead = {
    id: `lead_\${crypto.randomBytes(4).toString('hex')}`,
    firstName: fName,
    lastName: lName,
    email: em,
    phone: ph,
    source: src,
    campaignId: campId,
    campaignName: campName,
    packageName: packageName || '',
    package: packageName || '',
    productName: productName || '',
    productId: req.body.productId || '',
    adId: targetAdId,
    adName: targetAdName,
    status: targetAssignedTo ? 'ASSIGNED' : 'NEW',
    assignmentStatus: targetAssignedTo ? 'ASSIGNED' : 'UNASSIGNED',
    callDisposition: null,
    assignedTo: targetAssignedTo,
    assignedTelecallerId: targetAssignedTo,
    assigneeName: targetAssigneeName,
    creatorId: effectiveUserId || '1',
    creatorEmail: resolvedCreatorEmail,
    creatorName: resolvedCreatorName,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  dbLeadsStore.unshift(newLead);
  await persistLeadToDatabase(dbPool, newLead, numericAssignedTo, numericCreatorId, mysqlCampaignId, numericAdId);

  emitRealtimeEvent('lead:created', newLead);
  notifyLeadCreatedAssignment(newLead, targetAssignedTo, targetAssigneeName, campName, req.body);

  await recordAuditLog(dbPool, {
    actorId: creatorId || req.headers['x-user-id'] || 'usr_admin_01',
    actorEmail: creatorEmail || 'admin@markops.io',
    action: targetAssignedTo ? 'LEAD_CREATED_AND_ASSIGNED' : 'LEAD_CREATED',
    entityType: 'Lead',
    entityId: newLead.id,
    newState: { name: `\${newLead.firstName} \${newLead.lastName}`, phone: newLead.phone, assignedTo: targetAssignedTo, campaign: campName },
    ipAddress: req.ip || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'],
  });

  return res.status(201).json(newLead);
});


const LEAD_DETAIL_QUERY = `
  SELECT l.*, 
         c.full_name as creator_full_name, 
         c.email as creator_user_email,
         u.full_name as assignee_full_name,
         u.email as assignee_user_email
  FROM leads l
  LEFT JOIN users c ON l.creator_id = c.id
  LEFT JOIN users u ON l.assigned_to = u.id
  WHERE l.id = ?
`;

function formatLeadRow(row) {
  if (!row) return null;
  const now = new Date().toISOString();
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    source: row.source,
    status: row.status,
    assignedTo: row.assigned_to,
    assigned_to: row.assigned_to,
    assigneeName: row.assignee_full_name || (row.assigned_to ? 'Telecaller' : 'Unassigned'),
    creatorId: row.creator_id,
    creator_id: row.creator_id,
    creatorName: row.creator_full_name || row.creator_name || 'System Administrator',
    creatorEmail: row.creator_user_email || row.creator_email || 'admin@markops.io',
    campaignId: row.campaign_id,
    campaignName: row.campaign_name || '',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : now,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : now,
  };
}

async function findLeadById(leadId) {
  if (dbPool) {
    try {
      const [rows] = await dbPool.query(LEAD_DETAIL_QUERY, [leadId]);
      if (rows?.[0]) {
        return formatLeadRow(rows[0]);
      }
    } catch (e) {
      console.error('[MySQL Error] Fetch lead by ID failed:', e.message);
    }
  }
  return dbLeadsStore.find((l) => String(l.id).trim() === String(leadId).trim()) || null;
}

function verifyLeadCreatorAccess(req, lead) {
  const currentRole = String(req.user?.role || req.headers['x-user-role'] || '').toUpperCase();
  const currentUserId = resolveCurrentUserId(req);
  const currentUserEmail = (req.user?.email || req.headers['x-user-email'] || '').toLowerCase().trim();
  const currentUserName = (req.user?.fullName || req.headers['x-user-name'] || '').toLowerCase().trim();

  const leadCreatorId = resolveLeadCreatorId(lead);
  const leadCreatorEmail = (lead.creator_user_email || lead.creator_email || lead.creatorEmail || '').toLowerCase().trim();
  const leadCreatorName = (lead.creator_full_name || lead.creator_name || lead.creatorName || '').toLowerCase().trim();

  return Boolean(
    (currentUserId && leadCreatorId && String(currentUserId) === String(leadCreatorId)) ||
    (currentUserEmail && leadCreatorEmail && currentUserEmail === leadCreatorEmail) ||
    (currentUserName && leadCreatorName && currentUserName === leadCreatorName) ||
    (currentRole === 'ADMINISTRATOR')
  );
}

async function resolveAssigneeTarget(assignedTo, assigneeName) {
  if (!assignedTo) return { cleanAssignedTo: null, effectiveName: assigneeName };
  const targetUserIdStr = String(assignedTo).trim();
  if (dbPool) {
    try {
      const [userRows] = await dbPool.query(
        `SELECT id, full_name, email FROM users WHERE id = ? OR email = ? LIMIT 1`,
        [targetUserIdStr, targetUserIdStr]
      );
      if (userRows?.[0]) {
        return { cleanAssignedTo: userRows[0].id, effectiveName: userRows[0].full_name };
      }
    } catch (err) {
      console.error('[MySQL Error] Fetch user for assign failed:', err.message);
    }
  }

  const user = dbUsersStore.find(
    (u) => String(u.id).trim() === targetUserIdStr || u.email === targetUserIdStr
  );
  if (user) {
    const parsed = Number.parseInt(String(user.id).replace(/\D/g, ''), 10);
    return {
      cleanAssignedTo: !Number.isNaN(parsed) && parsed > 0 ? parsed : user.id,
      effectiveName: user.fullName
    };
  }
  const parsed = Number.parseInt(targetUserIdStr.replace(/\D/g, ''), 10);
  return {
    cleanAssignedTo: !Number.isNaN(parsed) && parsed > 0 ? parsed : targetUserIdStr,
    effectiveName: assigneeName
  };
}

async function updateLeadAssignmentDb(leadId, cleanAssignedTo, finalStatus) {
  if (!dbPool) return;
  try {
    const numLeadId = Number.parseInt(leadId, 10);
    if (Number.isNaN(numLeadId)) return;
    const numericTargetId = cleanAssignedTo ? (Number.parseInt(String(cleanAssignedTo).replace(/\D/g, ''), 10) || cleanAssignedTo) : null;
    const assignmentStatus = cleanAssignedTo ? 'ASSIGNED' : 'UNASSIGNED';
    try {
      await dbPool.query(
        `UPDATE leads
         SET assigned_to = ?, assigned_telecaller_id = ?, assignment_status = ?, status = ?, updated_at = NOW()
         WHERE id = ?`,
        [numericTargetId, numericTargetId, assignmentStatus, finalStatus, numLeadId]
      );
    } catch (colErr) {
      console.log('[MySQL Notice] Fallback to basic lead update columns:', colErr?.message || colErr);
      await dbPool.query(
        `UPDATE leads SET assigned_to = ?, status = ?, updated_at = NOW() WHERE id = ?`,
        [numericTargetId, finalStatus, numLeadId]
      );
    }
  } catch (e) {
    console.error('[MySQL Error] Update lead assignment failed:', e.message);
  }
}

function updateLeadStoreAssignment(leadId, cleanAssignedTo, finalAssigneeName, finalStatus) {
  const storeIdx = dbLeadsStore.findIndex((l) => String(l.id).trim() === leadId);
  const targetIdStr = cleanAssignedTo ? String(cleanAssignedTo) : null;
  const assignmentStatus = cleanAssignedTo ? 'ASSIGNED' : 'UNASSIGNED';
  const now = new Date().toISOString();
  if (storeIdx !== -1) {
    dbLeadsStore[storeIdx].assignedTo = targetIdStr;
    dbLeadsStore[storeIdx].assigned_to = targetIdStr;
    dbLeadsStore[storeIdx].assignedTelecallerId = targetIdStr;
    dbLeadsStore[storeIdx].assigneeName = finalAssigneeName;
    dbLeadsStore[storeIdx].status = finalStatus;
    dbLeadsStore[storeIdx].assignmentStatus = assignmentStatus;
    dbLeadsStore[storeIdx].updatedAt = now;
  }
}

function notifyLeadAssigned(lead, req, options) {
  if (!lead.assignedTo) return;
  const { creatorName, actorEmail, productName, packageName, actorId } = options;
  const creator = creatorName || actorEmail || lead.creatorName || 'System Administrator';
  const prod = productName || 'Careermate';
  const pkg = packageName || lead.campaignName || 'CURRENT AFFAIRS AUGUST -2026';
  const msg = `Assigned by: ${creator} -> Product: ${prod} -> Package: ${pkg} -> Total Leads: 1`;
  const targetRoute = `/package-works?package=${encodeURIComponent(prod)}&workspace=${encodeURIComponent(pkg)}&dept=TELECALLING&tab=TELECALLING`;
  createNotificationForTelecaller(lead.assignedTo, 'New Lead Assigned', msg, targetRoute);

  const reassignerId = actorId || req.headers['x-user-id'] || lead.creatorId;
  if (reassignerId && String(reassignerId) !== String(lead.assignedTo)) {
    dispatchNotification({
      userIds: [reassignerId],
      title: 'Lead Assigned Successfully',
      message: `Lead "${lead.firstName} ${lead.lastName || ''}" has been assigned to ${lead.assigneeName}.`,
      type: 'INFO',
      targetRoute: '/leads',
    }).catch((err) => console.log('[Notice] Non-critical notification failed:', err?.message || err));
  }
}

router.post('/leads/:id/assign', async (req, res) => {
  const { assignedTo, assigneeName, actorId, actorEmail, creatorName, productName, packageName } = req.body;
  const leadId = String(req.params.id).trim();

  const lead = await findLeadById(leadId);
  if (!lead) return res.status(404).json({ error: `Lead #${leadId} not found.` });

  if (!verifyLeadCreatorAccess(req, lead)) {
    return res.status(403).json({ error: 'Access Denied: Only the creator who created this lead can reassign it.' });
  }

  const { cleanAssignedTo, effectiveName } = await resolveAssigneeTarget(assignedTo, assigneeName);
  const finalStatus = cleanAssignedTo ? 'ASSIGNED' : 'NEW';
  const finalAssigneeName = cleanAssignedTo ? (effectiveName || 'Assigned Telecaller') : 'Unassigned';

  await updateLeadAssignmentDb(leadId, cleanAssignedTo, finalStatus);
  updateLeadStoreAssignment(leadId, cleanAssignedTo, finalAssigneeName, finalStatus);

  lead.assignedTo = cleanAssignedTo ? String(cleanAssignedTo) : null;
  lead.assigned_to = lead.assignedTo;
  lead.assignedTelecallerId = lead.assignedTo;
  lead.assigneeName = finalAssigneeName;
  lead.status = finalStatus;
  lead.assignmentStatus = cleanAssignedTo ? 'ASSIGNED' : 'UNASSIGNED';
  lead.updatedAt = new Date().toISOString();

  emitRealtimeEvent('lead:assigned', lead);
  emitRealtimeEvent('lead:updated', lead);

  notifyLeadAssigned(lead, req, { creatorName, actorEmail, productName, packageName, actorId });

  await recordAuditLog(dbPool, {
    actorId: actorId || req.headers['x-user-id'] || 'usr_admin_01',
    actorEmail: actorEmail || 'admin@markops.io',
    action: 'LEAD_REASSIGNED',
    entityType: 'Lead',
    entityId: lead.id,
    newState: { assignedTo: lead.assignedTo, assigneeName: lead.assigneeName, status: lead.status },
    ipAddress: req.ip || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'],
  });
  return res.json(lead);
});


function buildLeadUpdateFields(body, lead) {
  const { firstName, lastName, email, phone, source, status, campaignName, assignedTo, assigneeName } = body;
  const updatedFirstName = firstName !== undefined ? String(firstName).trim() : (lead.first_name || lead.firstName);
  const updatedLastName = lastName !== undefined ? String(lastName).trim() : (lead.last_name || lead.lastName || '');
  const updatedEmail = email !== undefined ? String(email).trim() : (lead.email || '');
  const updatedPhone = phone !== undefined ? String(phone).trim() : (lead.phone || '');
  const updatedSource = source !== undefined ? String(source).trim() : (lead.source || 'Manual');
  const updatedStatus = status !== undefined ? String(status).trim() : (lead.status || 'NEW');
  const updatedCampName = campaignName !== undefined ? String(campaignName).trim() : (lead.campaign_name || lead.campaignName || '');
  let updatedAssignedTo = lead.assigned_to || null;
  if (assignedTo !== undefined) {
    updatedAssignedTo = assignedTo ? (Number.parseInt(String(assignedTo).replace(/\D/g, ''), 10) || null) : null;
  }
  let updatedAssigneeName = assigneeName !== undefined ? String(assigneeName).trim() : (lead.assignee_full_name || lead.assigneeName || 'Unassigned');
  if (!updatedAssignedTo) updatedAssigneeName = 'Unassigned';

  return {
    updatedFirstName,
    updatedLastName,
    updatedEmail,
    updatedPhone,
    updatedSource,
    updatedStatus,
    updatedCampName,
    updatedAssignedTo,
    updatedAssigneeName
  };
}

async function persistLeadUpdateDb(leadId, fields) {
  if (!dbPool) return;
  try {
    await dbPool.query(
      `UPDATE leads
       SET first_name = ?, last_name = ?, email = ?, phone = ?, source = ?, status = ?, campaign_name = ?,
           assigned_to = ?, assigned_telecaller_id = ?, assignment_status = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        fields.updatedFirstName, fields.updatedLastName, fields.updatedEmail, fields.updatedPhone,
        fields.updatedSource, fields.updatedStatus, fields.updatedCampName, fields.updatedAssignedTo,
        fields.updatedAssignedTo, fields.updatedAssignedTo ? 'ASSIGNED' : 'UNASSIGNED', leadId,
      ]
    );
  } catch (dbErr) {
    console.error('[MySQL Error] Update lead failed:', dbErr.message);
  }
}

router.put('/leads/:id', async (req, res) => {
  const leadId = req.params.id;
  const lead = await findLeadById(leadId);
  if (!lead) {
    return res.status(404).json({ error: 'Lead not found.' });
  }

  if (!verifyLeadCreatorAccess(req, lead)) {
    return res.status(403).json({ error: 'Access Denied: Only the creator who created this lead can edit it.' });
  }

  const fields = buildLeadUpdateFields(req.body, lead);
  await persistLeadUpdateDb(leadId, fields);

  const updatedObj = {
    id: leadId,
    firstName: fields.updatedFirstName,
    lastName: fields.updatedLastName,
    email: fields.updatedEmail,
    phone: fields.updatedPhone,
    source: fields.updatedSource,
    status: fields.updatedStatus,
    assignedTelecallerId: fields.updatedAssignedTo ? String(fields.updatedAssignedTo) : null,
    assignmentStatus: fields.updatedAssignedTo ? 'ASSIGNED' : 'UNASSIGNED',
    campaignId: lead.campaign_id || lead.campaignId || 'cmp_default',
    campaignName: fields.updatedCampName,
    assignedTo: fields.updatedAssignedTo,
    assigneeName: fields.updatedAssigneeName,
    creatorId: resolveLeadCreatorId(lead),
    creatorName: lead.creator_full_name || lead.creator_name || lead.creatorName,
    creatorEmail: lead.creator_user_email || lead.creator_email || lead.creatorEmail,
    updatedAt: new Date().toISOString(),
  };

  const storeIdx = dbLeadsStore.findIndex((l) => String(l.id) === String(leadId));
  if (storeIdx !== -1) {
    dbLeadsStore[storeIdx] = { ...dbLeadsStore[storeIdx], ...updatedObj };
  }

  emitRealtimeEvent('lead:updated', updatedObj);
  await recordAuditLog(dbPool, {
    actorId: resolveCurrentUserId(req) || 'usr_unknown',
    actorEmail: req.user?.email || req.headers['x-user-email'] || 'unknown@markops.io',
    action: 'LEAD_UPDATED',
    entityType: 'Lead',
    entityId: String(leadId),
    newState: updatedObj,
    ipAddress: req.ip || req.socket?.remoteAddress,
  });

  return res.json({ success: true, lead: updatedObj });
});

async function deleteLeadFromDb(leadId) {
  if (!dbPool) return;
  try {
    await dbPool.query(`DELETE FROM follow_ups WHERE lead_id = ?`, [leadId]).catch((err) => console.log('[Notice] Non-critical notification failed:', err?.message || err));
    await dbPool.query(`DELETE FROM call_activities WHERE lead_id = ?`, [leadId]).catch((err) => console.log('[Notice] Non-critical notification failed:', err?.message || err));
    await dbPool.query(`DELETE FROM leads WHERE id = ?`, [leadId]);
  } catch (dbErr) {
    console.error('[MySQL Error] Delete lead failed:', dbErr.message);
  }
}

router.delete('/leads/:id', async (req, res) => {
  const leadId = req.params.id;
  const lead = await findLeadById(leadId);
  if (!lead) {
    return res.status(404).json({ error: 'Lead not found.' });
  }

  if (!verifyLeadCreatorAccess(req, lead)) {
    return res.status(403).json({ error: 'Access Denied: Only the creator who created this lead can delete it.' });
  }

  await deleteLeadFromDb(leadId);

  const storeIdx = dbLeadsStore.findIndex((l) => String(l.id) === String(leadId));
  if (storeIdx !== -1) {
    dbLeadsStore.splice(storeIdx, 1);
  }

  emitRealtimeEvent('lead:deleted', { leadId: String(leadId) });
  await recordAuditLog(dbPool, {
    actorId: resolveCurrentUserId(req) || 'usr_unknown',
    actorEmail: req.user?.email || req.headers['x-user-email'] || 'unknown@markops.io',
    action: 'LEAD_DELETED',
    entityType: 'Lead',
    entityId: String(leadId),
    ipAddress: req.ip || req.socket?.remoteAddress,
  });

  return res.json({ success: true, message: 'Lead deleted successfully.', leadId });
});

router.get('/calls', async (req, res) => {
  if (dbPool) {
    try {
      const [rows] = await dbPool.query(`
        SELECT ca.*, l.first_name, l.last_name, l.phone as lead_phone, u.full_name as telecaller_name, u.email as telecaller_email
        FROM call_activities ca
        LEFT JOIN leads l ON ca.lead_id = l.id
        LEFT JOIN users u ON ca.telecaller_id = u.id
        ORDER BY ca.called_at DESC
      `);
      if (Array.isArray(rows)) {
        reconcileCallActivities(rows);
      }
    } catch (e) {
      console.log('[MySQL Error] Fetch call_activities failed:', e?.message || e);
    }
  }

  const { telecallerId, userId, telecallerName } = req.query;
  if (telecallerId || userId || telecallerName) {
    const targetId = String(telecallerId || userId || '').trim().toLowerCase();
    const targetName = String(telecallerName || '').trim().toLowerCase();
    const filtered = dbCallActivitiesStore.filter((c) => {
      const cId = String(c.telecallerId || '').trim().toLowerCase();
      const cName = String(c.telecallerName || '').trim().toLowerCase();
      const cEmail = String(c.telecallerEmail || '').trim().toLowerCase();
      if (targetId && (cId === targetId || cEmail === targetId)) return true;
      if (targetName && (cName === targetName || cName.includes(targetName) || targetName.includes(cName))) return true;
      return false;
    });
    return res.json(filtered);
  }
  return res.json(dbCallActivitiesStore);
});

function normalizeCallOutcomeStatus(outcome = 'BUSY') {
  const outcomeUpper = String(outcome).toUpperCase().replace(/\s+/g, '_');
  let newStatus = outcomeUpper === 'BUSY' ? 'LINE_BUSY' : outcomeUpper;
  if (newStatus === 'QUALIFIED' || newStatus === 'CONVERTED') newStatus = 'PAID';
  if (newStatus === 'FOLLOW_UP_SCHEDULED') newStatus = 'FOLLOW_UP';
  return { outcomeUpper, newStatus };
}

function formatFollowUpDueDate(followUpDate, followUpTime) {
  if (followUpDate.includes('T')) {
    return new Date(followUpDate).toISOString().slice(0, 19).replace('T', ' ');
  }
  let timePart = '10:00:00';
  if (followUpTime?.includes(':')) {
    timePart = followUpTime.length === 5 ? `${followUpTime}:00` : followUpTime;
  }
  return `${followUpDate.split(' ')[0]} ${timePart}`;
}

async function updateLeadInDatabase(pool, numId, rawPhone, newStatus, remarks = 'Call logged.') {
  const remarkText = remarks;
  if (!Number.isNaN(numId)) {
    await pool.query('UPDATE leads SET status = ?, remarks = ?, notes = ?, updated_at = NOW() WHERE id = ?', [newStatus, remarkText, remarkText, numId]);
  } else if (rawPhone) {
    await pool.query('UPDATE leads SET status = ?, remarks = ?, notes = ?, updated_at = NOW() WHERE phone LIKE ?', [newStatus, remarkText, remarkText, `%${rawPhone}%`]);
  }
}

async function fetchLeadRowFromDatabase(pool, numId, rawPhone) {
  let fetchSql = `
    SELECT l.*, 
           c.full_name as creator_full_name, 
           c.email as creator_user_email,
           u.full_name as assignee_full_name,
           u.email as assignee_user_email
    FROM leads l
    LEFT JOIN users c ON l.creator_id = c.id
    LEFT JOIN users u ON l.assigned_to = u.id
  `;
  let params = [];
  if (!Number.isNaN(numId)) {
    fetchSql += ' WHERE l.id = ?';
    params = [numId];
  } else if (rawPhone) {
    fetchSql += ' WHERE l.phone LIKE ?';
    params = [`%${rawPhone}%`];
  } else {
    return null;
  }
  const [rows] = await pool.query(fetchSql, params);
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

function mapLeadDatabaseRow(row, remarks) {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    source: row.source,
    status: row.status,
    assignedTo: row.assigned_to,
    assigned_to: row.assigned_to,
    assigneeName: row.assignee_full_name || (row.assigned_to ? 'Telecaller' : 'Unassigned'),
    creatorId: row.creator_id,
    creator_id: row.creator_id,
    creatorName: row.creator_full_name || row.creator_name || 'System Administrator',
    creatorEmail: row.creator_user_email || row.creator_email || 'admin@markops.io',
    campaignId: row.campaign_id,
    campaignName: row.campaign_name || '',
    remarks: remarks || '',
    notes: remarks || '',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
  };
}

async function findLeadInDatabase(pool, numId, rawPhone, newStatus, remarks) {
  if (!pool) return null;
  try {
    await updateLeadInDatabase(pool, numId, rawPhone, newStatus, remarks);
    const row = await fetchLeadRowFromDatabase(pool, numId, rawPhone);
    return row ? mapLeadDatabaseRow(row, remarks) : null;
  } catch (error) {
    console.error('[MySQL Error] Failed to update and fetch lead in POST /calls:', error?.message || error);
    return null;
  }
}

function findOrCreateLeadInMemory(rawLeadId, rawPhone, rawName, body, newStatus, remarks) {
  let lead = dbLeadsStore.find((l) => String(l.id).trim() === rawLeadId);
  if (!lead && rawPhone) {
    lead = dbLeadsStore.find((l) => l.phone && l.phone.replace(/\D/g, '') === rawPhone);
  }
  if (!lead && rawLeadId) {
    const leadIdDigits = rawLeadId.replace(/\D/g, '');
    lead = dbLeadsStore.find(
      (l) =>
        (leadIdDigits && l.phone && l.phone.replace(/\D/g, '') === leadIdDigits) ||
        `${l.firstName} ${l.lastName || ''}`.trim().toLowerCase() === rawLeadId.toLowerCase()
    );
  }
  if (!lead && rawName) {
    lead = dbLeadsStore.find((l) => `${l.firstName} ${l.lastName || ''}`.trim().toLowerCase() === rawName);
  }

  if (lead) {
    lead.status = newStatus;
    lead.remarks = remarks || lead.remarks || 'Call logged.';
    lead.notes = remarks || lead.notes || 'Call logged.';
    lead.updatedAt = new Date().toISOString();
    return lead;
  }

  if (rawLeadId || rawName || rawPhone) {
    const newLead = {
      id: rawLeadId || `lead_${crypto.randomBytes(4).toString('hex')}`,
      firstName: body.firstName || (body.leadName ? body.leadName.split(' ')[0] : 'Lead'),
      lastName: body.lastName || (body.leadName ? body.leadName.split(' ').slice(1).join(' ') : 'Customer'),
      phone: body.leadPhone || body.phone || '+91 9800000000',
      source: 'Digital Ads Lead Form',
      campaignId: 'cmp_default',
      campaignName: 'Digital Ad Campaign',
      status: newStatus,
      remarks: remarks || 'Call logged.',
      notes: remarks || 'Call logged.',
      assignedTo: body.telecallerId || null,
      assigneeName: body.telecallerName || 'Assigned Telecaller',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    dbLeadsStore.unshift(newLead);
    return newLead;
  }
  return null;
}

async function insertCallActivityDb(pool, callData) {
  if (!pool || Number.isNaN(callData.numLeadId)) return null;
  const queries = [
    {
      sql: `INSERT INTO call_activities (lead_id, telecaller_id, outcome, duration_seconds, remarks, next_action, follow_up_date, follow_up_time, called_at, lead_phone, lead_name)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [callData.numLeadId, callData.numCallerId, callData.mysqlOutcome, callData.durationSeconds, callData.remarks, callData.nextAction, callData.followUpDate, callData.followUpTime, callData.callTimestamp, callData.effectiveLeadPhone, callData.effectiveLeadName],
    },
    {
      sql: `INSERT INTO call_activities (lead_id, telecaller_id, outcome, duration_seconds, remarks, next_action, follow_up_date, follow_up_time, called_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [callData.numLeadId, callData.numCallerId, callData.mysqlOutcome, callData.durationSeconds, callData.remarks, callData.nextAction, callData.followUpDate, callData.followUpTime, callData.callTimestamp],
    },
    {
      sql: `INSERT INTO call_activities (lead_id, telecaller_id, outcome, duration_seconds, remarks, next_action, called_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      params: [callData.numLeadId, callData.numCallerId, callData.mysqlOutcome, callData.durationSeconds, callData.remarks, callData.nextAction, callData.callTimestamp],
    },
  ];

  let insertRes = null;
  for (const q of queries) {
    try {
      const [res] = await pool.query(q.sql, q.params);
      insertRes = res;
      break;
    } catch (error) {
      console.log('[MySQL Notice] Fallback inserting call activity:', error?.message || error);
    }
  }

  if (insertRes?.insertId) {
    await pool.query('UPDATE leads SET status = ?, remarks = ?, notes = ?, updated_at = NOW() WHERE id = ?', [callData.newStatus, callData.remarks, callData.remarks, callData.numLeadId]).catch((err) => console.log('[Notice] Non-critical notification failed:', err?.message || err));
    return `call_${insertRes.insertId}`;
  }
  return null;
}

async function markPendingFollowUpsCompleted(pool, targetLeadId, targetPhone) {
  dbFollowUpsStore.forEach((f) => {
    const fPhone = f.leadPhone ? String(f.leadPhone).replace(/\D/g, '') : '';
    if (f.leadId === targetLeadId || (targetPhone && fPhone && targetPhone === fPhone)) {
      if (f.status === 'PENDING') {
        f.status = 'COMPLETED';
      }
    }
  });

  if (pool) {
    try {
      const numLeadId = Number.parseInt(String(targetLeadId).replace(/\D/g, ''), 10);
      if (!Number.isNaN(numLeadId)) {
        await pool.query("UPDATE follow_ups SET status = 'COMPLETED', completed_at = NOW() WHERE lead_id = ? AND status = 'PENDING'", [numLeadId]);
      }
    } catch (error) {
      console.log('[MySQL Notice] Failed to update follow_ups completed status:', error?.message || error);
    }
  }
}

async function createNewFollowUp(pool, params) {
  const followUpItem = {
    id: `fol_${crypto.randomBytes(4).toString('hex')}`,
    leadId: params.targetLeadId,
    leadName: params.leadName,
    leadPhone: params.leadPhone,
    telecallerId: params.effectiveCallerId,
    telecallerName: params.effectiveCallerName,
    dueDate: params.followUpDate,
    dueTime: params.followUpTime || '10:00',
    status: 'PENDING',
    notes: params.remarks || '',
    createdAt: new Date().toISOString(),
  };
  dbFollowUpsStore.unshift(followUpItem);

  if (pool) {
    try {
      const numLeadId = Number.parseInt(String(params.targetLeadId).replace(/\D/g, ''), 10);
      const numCallerId = Number.parseInt(String(params.effectiveCallerId).replace(/\D/g, ''), 10) || 1;
      if (!Number.isNaN(numLeadId)) {
        const mysqlDueDate = formatFollowUpDueDate(params.followUpDate, params.followUpTime);
        await pool.query(
          "INSERT INTO follow_ups (lead_id, telecaller_id, due_date, status, notes, created_at) VALUES (?, ?, ?, 'PENDING', ?, NOW())",
          [numLeadId, numCallerId, mysqlDueDate, params.remarks || '']
        );
      }
    } catch (error) {
      console.log('[MySQL Notice] Insert into follow_ups failed:', error?.message || error);
    }
  }
}

function dispatchLeadOutcomeNotifications(outcomeUpper, newStatus, finalLead, leadPhone, effectiveCallerName, effectiveCallerId) {
  const isInterested = outcomeUpper === 'INTERESTED' || newStatus === 'INTERESTED';
  const isQualified = outcomeUpper === 'QUALIFIED' || newStatus === 'QUALIFIED';
  if (!isInterested && !isQualified) return;

  const creatorTarget = finalLead.creatorId || '4';
  const leadPkg = finalLead.packageName || finalLead.package || finalLead.campaignName || 'CURRENT AFFAIRS AUGUST -2026';
  const leadProd = resolvePackageProductName(leadPkg, finalLead.productName);
  const telecallerTargetRoute = `/package-works?package=${encodeURIComponent(leadProd)}&workspace=${encodeURIComponent(leadPkg)}&dept=TELECALLING&tab=TELECALLING`;

  if (isInterested) {
    dispatchNotification({
      userIds: [creatorTarget, '4'],
      title: `Lead Interested: ${finalLead.firstName} ${finalLead.lastName || ''}`.trim(),
      message: `Lead "${finalLead.firstName} ${finalLead.lastName || ''}" (${leadPhone}) has shown interest! Handled by ${effectiveCallerName}. Campaign: ${finalLead.campaignName || 'Digital Campaign'}.`,
      type: 'SUCCESS',
      targetRoute: `/package-works?package=${encodeURIComponent(leadProd)}&workspace=${encodeURIComponent(leadPkg)}&dept=DIGITAL_MARKETING&tab=LEADS`,
    }).catch((err) => console.log('[Notice] Non-critical notification failed:', err?.message || err));

    dispatchNotification({
      userIds: [effectiveCallerId],
      title: 'Lead Marked as Interested',
      message: `You marked "${finalLead.firstName} ${finalLead.lastName || ''}" as Interested. Great job!`,
      type: 'SUCCESS',
      targetRoute: telecallerTargetRoute,
    }).catch((err) => console.log('[Notice] Non-critical notification failed:', err?.message || err));
  } else if (isQualified) {
    dispatchNotification({
      userIds: [creatorTarget, '4'],
      title: `Lead Qualified: ${finalLead.firstName} ${finalLead.lastName || ''}`.trim(),
      message: `High-value lead "${finalLead.firstName} ${finalLead.lastName || ''}" (${leadPhone}) has been qualified by ${effectiveCallerName}! Ready for package conversion.`,
      type: 'SUCCESS',
      targetRoute: `/package-works?package=${encodeURIComponent(leadProd)}&workspace=${encodeURIComponent(leadPkg)}&dept=DIGITAL_MARKETING&tab=LEADS`,
    }).catch((err) => console.log('[Notice] Non-critical notification failed:', err?.message || err));

    dispatchNotification({
      userIds: ['2'],
      title: `New Qualified Lead: ${finalLead.firstName} ${finalLead.lastName || ''}`.trim(),
      message: `Lead "${finalLead.firstName} ${finalLead.lastName || ''}" was qualified by ${effectiveCallerName}. Ready for package proposal and deal closure.`,
      type: 'SUCCESS',
      targetRoute: `/package-works?package=${encodeURIComponent(leadProd)}&workspace=${encodeURIComponent(leadPkg)}&dept=ANALYTICS&tab=REPORTS`,
    }).catch((err) => console.log('[Notice] Non-critical notification failed:', err?.message || err));

    dispatchNotification({
      userIds: [effectiveCallerId],
      title: 'Lead Qualified!',
      message: `Lead "${finalLead.firstName} ${finalLead.lastName || ''}" has been successfully qualified! Target milestone progressed.`,
      type: 'SUCCESS',
      targetRoute: telecallerTargetRoute,
    }).catch((err) => console.log('[Notice] Non-critical notification failed:', err?.message || err));
  }
}

function evaluateDailyTargetNotifications(effectiveCallerId, effectiveCallerName) {
  try {
    const todayDateStr = new Date().toISOString().split('T')[0];
    const callerIdStr = String(effectiveCallerId).toLowerCase();
    const todayCallerCalls = dbCallActivitiesStore.filter((c) => {
      const isCaller = String(c.telecallerId || '').toLowerCase() === callerIdStr || (c.telecallerName && c.telecallerName === effectiveCallerName);
      const isToday = Boolean(c.calledAt?.startsWith(todayDateStr));
      return isCaller && isToday;
    });

    const uniqueLeadKeys = new Set();
    const uniqueInterestedLeadKeys = new Set();

    todayCallerCalls.forEach((c) => {
      const leadKey = String(c.leadId || c.leadPhone || c.leadName || '').trim().toLowerCase();
      if (leadKey) {
        uniqueLeadKeys.add(leadKey);
        if (c.outcome === 'INTERESTED' || c.outcome === 'QUALIFIED') {
          uniqueInterestedLeadKeys.add(leadKey);
        }
      }
    });

    const todayCallsCount = uniqueLeadKeys.size;
    const todayInterestedCount = uniqueInterestedLeadKeys.size;
    const targetCalls = dbCommonTargetStore.dailyCallsTarget || 30;
    const targetInterested = dbCommonTargetStore.dailyInterestedTarget || 5;

    if (todayCallsCount >= targetCalls || todayInterestedCount >= targetInterested) {
      const alreadyNotified = dbNotificationsStore.some(
        (n) =>
          String(n.userId).toLowerCase() === callerIdStr &&
          n.title?.toLowerCase().includes('target achieved') &&
          n.createdAt?.startsWith(todayDateStr)
      );

      if (!alreadyNotified) {
        dispatchNotification({
          userIds: [effectiveCallerId],
          title: 'Target Achieved! Congratulations!',
          message: `Outstanding work, ${effectiveCallerName}! You have successfully achieved your daily target today (${todayCallsCount}/${targetCalls} unique leads called, ${todayInterestedCount}/${targetInterested} interested leads).`,
          type: 'SUCCESS',
          targetRoute: '/package-works?package=CAREERMATE&workspace=CURRENT-AFFAIR-PACKAGE&dept=TELECALLING&tab=TELECALLER_MEMBERS',
        }).catch((err) => console.log('[Notice] Non-critical notification failed:', err?.message || err));

        dispatchNotification({
          userIds: ['4', '1', '2', '3'],
          title: `Telecaller Target Achieved: ${effectiveCallerName}`,
          message: `${effectiveCallerName} has reached their daily target today with ${todayCallsCount} unique leads called and ${todayInterestedCount} interested/qualified leads!`,
          type: 'SUCCESS',
          targetRoute: '/package-works?package=CAREERMATE&workspace=CURRENT-AFFAIR-PACKAGE&dept=TELECALLING&tab=TELECALLER_MEMBERS',
        }).catch((err) => console.log('[Notice] Non-critical notification failed:', err?.message || err));
      }
    }
  } catch (targetErr) {
    console.error('Target achievement evaluation notice:', targetErr?.message || targetErr);
  }
}

router.post('/calls', async (req, res) => {
  const { leadId, leadPhone, phone, leadName, firstName, lastName, outcome, durationSeconds, remarks, nextAction, followUpDate, followUpTime, telecallerId, telecallerName, telecallerEmail } = req.body;
  const rawLeadId = String(leadId || '').trim();
  const rawPhone = String(leadPhone || phone || '').replace(/\D/g, '');
  const rawName = String(leadName || `${firstName || ''} ${lastName || ''}` || '').trim().toLowerCase();
  const numId = Number.parseInt(rawLeadId, 10);

  const { outcomeUpper, newStatus } = normalizeCallOutcomeStatus(outcome);

  let lead = await findLeadInDatabase(dbPool, numId, rawPhone, newStatus, remarks);
  if (!lead) {
    lead = findOrCreateLeadInMemory(rawLeadId, rawPhone, rawName, req.body, newStatus, remarks);
  }

  const effectiveCallerId = telecallerId || req.headers['x-user-id'] || 'usr_admin_01';
  const effectiveCallerName = telecallerName || req.headers['x-user-name'] || 'System User';
  const callTimestamp = new Date();
  const isoCalledAt = callTimestamp.toISOString();

  const targetLeadId = lead ? lead.id : rawLeadId;
  const numLeadId = Number.parseInt(String(targetLeadId).replace(/\D/g, ''), 10);
  const numCallerId = Number.parseInt(String(effectiveCallerId).replace(/\D/g, ''), 10) || 1;
  const effectiveLeadPhone = lead ? (lead.phone || '') : (leadPhone || phone || '');
  const effectiveLeadName = lead ? `${lead.firstName || ''} ${lead.lastName || ''}`.trim() : (leadName || `${firstName || ''} ${lastName || ''}`.trim() || 'Lead Customer');

  const assignedCallId = await insertCallActivityDb(dbPool, {
    numLeadId,
    numCallerId,
    mysqlOutcome: newStatus,
    durationSeconds: Number(durationSeconds) || 120,
    remarks: remarks || 'Call logged.',
    nextAction: nextAction || '',
    followUpDate: followUpDate || null,
    followUpTime: followUpTime || null,
    callTimestamp,
    effectiveLeadPhone,
    effectiveLeadName,
    newStatus,
  }) || `call_${crypto.randomBytes(4).toString('hex')}`;

  const newCall = {
    id: assignedCallId,
    leadId: targetLeadId,
    leadPhone: effectiveLeadPhone,
    leadName: effectiveLeadName,
    telecallerId: effectiveCallerId,
    telecallerName: effectiveCallerName,
    telecallerEmail: telecallerEmail || req.headers['x-user-email'] || '',
    outcome: (outcomeUpper === 'QUALIFIED' || outcomeUpper === 'CONVERTED' || outcomeUpper === 'PAID') ? 'PAID' : outcomeUpper,
    durationSeconds: Number(durationSeconds) || 120,
    remarks: remarks || 'Call logged.',
    nextAction: nextAction || 'Follow up as required',
    followUpDate: followUpDate || '',
    followUpTime: followUpTime || '',
    calledAt: isoCalledAt,
  };

  const existingIdx = dbCallActivitiesStore.findIndex((c) => isSameCallActivity(c, newCall));
  if (existingIdx !== -1) {
    dbCallActivitiesStore.splice(existingIdx, 1);
  }
  dbCallActivitiesStore.unshift(newCall);

  emitRealtimeEvent('call:completed', newCall);

  const finalRemarkText = (remarks && remarks !== '—' && String(remarks).trim()) ? String(remarks).trim() : 'Call logged.';
  const finalLead = lead || {
    id: rawLeadId,
    status: newStatus,
    remarks: finalRemarkText,
    notes: finalRemarkText,
    updatedAt: new Date().toISOString(),
  };

  if (lead) {
    lead.remarks = finalRemarkText;
    lead.notes = finalRemarkText;
  }

  const inMemLead = dbLeadsStore.find((l) => String(l.id) === String(rawLeadId) || (l.phone && newCall.leadPhone && l.phone.replace(/\D/g, '') === newCall.leadPhone.replace(/\D/g, '')));
  if (inMemLead) {
    inMemLead.remarks = finalRemarkText;
    inMemLead.notes = finalRemarkText;
    inMemLead.status = newStatus;
  }

  emitRealtimeEvent('lead:status_changed', { leadId: finalLead.id, status: newStatus });
  emitRealtimeEvent('lead:updated', finalLead);

  await markPendingFollowUpsCompleted(dbPool, targetLeadId, newCall.leadPhone);

  if (followUpDate) {
    await createNewFollowUp(dbPool, {
      targetLeadId,
      leadName: newCall.leadName,
      leadPhone: effectiveLeadPhone,
      effectiveCallerId,
      effectiveCallerName,
      followUpDate,
      followUpTime,
      remarks,
    });
  }

  await recordAuditLog(dbPool, {
    actorId: effectiveCallerId,
    actorEmail: telecallerEmail || 'telecaller@markops.io',
    action: `TELECALL_LOGGED_${outcomeUpper}`,
    entityType: 'CallActivity',
    entityId: newCall.id,
    newState: { outcome: outcomeUpper, leadId: finalLead.id, newStatus },
    ipAddress: req.ip || req.socket?.remoteAddress || '127.0.0.1',
    userAgent: req.headers['user-agent'],
  });

  dispatchLeadOutcomeNotifications(outcomeUpper, newStatus, finalLead, newCall.leadPhone, effectiveCallerName, effectiveCallerId);
  evaluateDailyTargetNotifications(effectiveCallerId, effectiveCallerName);

  return res.status(201).json({ call: newCall, lead: finalLead });
});

function notifyLeadStatusTransition(lead, newStatus, effectiveActorName) {
  const leadPkg = lead.packageName || lead.package || lead.campaignName || 'CURRENT AFFAIRS AUGUST -2026';
  const leadProd = resolvePackageProductName(leadPkg, lead.productName);
  const telecallerTargetRoute = `/package-works?package=${encodeURIComponent(leadProd)}&workspace=${encodeURIComponent(leadPkg)}&dept=TELECALLING&tab=TELECALLING`;
  const creatorTarget = lead.creatorId || '4';

  if (newStatus === 'INTERESTED') {
    dispatchNotification({
      userIds: [creatorTarget, '4'],
      title: `Lead Interested: ${lead.firstName} ${lead.lastName || ''}`.trim(),
      message: `Lead "${lead.firstName} ${lead.lastName || ''}" has shown interest! Handled by ${effectiveActorName}. Campaign: ${lead.campaignName || 'Digital Campaign'}.`,
      type: 'SUCCESS',
      targetRoute: `/package-works?package=${encodeURIComponent(leadProd)}&workspace=${encodeURIComponent(leadPkg)}&dept=DIGITAL_MARKETING&tab=LEADS`,
    }).catch((err) => console.log('[Notice] Non-critical notification failed:', err?.message || err));

    if (lead.assignedTo) {
      dispatchNotification({
        userIds: [lead.assignedTo],
        title: 'Lead Marked as Interested',
        message: `You marked "${lead.firstName} ${lead.lastName || ''}" as Interested. Great job!`,
        type: 'SUCCESS',
        targetRoute: telecallerTargetRoute,
      }).catch((err) => console.log('[Notice] Non-critical notification failed:', err?.message || err));
    }
  } else if (newStatus === 'QUALIFIED') {
    dispatchNotification({
      userIds: [creatorTarget, '4'],
      title: `Lead Qualified: ${lead.firstName} ${lead.lastName || ''}`.trim(),
      message: `High-value lead "${lead.firstName} ${lead.lastName || ''}" has been qualified by ${effectiveActorName}! Ready for package conversion.`,
      type: 'SUCCESS',
      targetRoute: `/package-works?package=${encodeURIComponent(leadProd)}&workspace=${encodeURIComponent(leadPkg)}&dept=DIGITAL_MARKETING&tab=LEADS`,
    }).catch((err) => console.log('[Notice] Non-critical notification failed:', err?.message || err));

    dispatchNotification({
      userIds: ['2'],
      title: `New Qualified Lead for Conversion: ${lead.firstName} ${lead.lastName || ''}`.trim(),
      message: `Lead "${lead.firstName} ${lead.lastName || ''}" was qualified by ${effectiveActorName}. Ready for package conversion.`,
      type: 'SUCCESS',
      targetRoute: `/package-works?package=${encodeURIComponent(leadProd)}&workspace=${encodeURIComponent(leadPkg)}&dept=ANALYTICS&tab=REPORTS`,
    }).catch((err) => console.log('[Notice] Non-critical notification failed:', err?.message || err));

    if (lead.assignedTo) {
      dispatchNotification({
        userIds: [lead.assignedTo],
        title: 'Lead Qualified!',
        message: `Lead "${lead.firstName} ${lead.lastName || ''}" has been successfully qualified! Target milestone progressed.`,
        type: 'SUCCESS',
        targetRoute: telecallerTargetRoute,
      }).catch((err) => console.log('[Notice] Non-critical notification failed:', err?.message || err));
    }
  }
}

router.patch('/leads/:id/status', async (req, res) => {
  const { status, actorName } = req.body;
  const leadId = String(req.params.id).trim();

  const lead = await findLeadById(leadId);
  if (!lead) return res.status(404).json({ error: `Lead #${leadId} not found.` });

  const newStatus = String(status || '').toUpperCase().trim();
  lead.status = newStatus;
  lead.updatedAt = new Date().toISOString();

  if (dbPool) {
    try {
      const numId = Number.parseInt(leadId, 10);
      if (!Number.isNaN(numId)) {
        await dbPool.query('UPDATE leads SET status = ?, updated_at = NOW() WHERE id = ?', [newStatus, numId]);
      }
    } catch (e) {
      console.error('[MySQL Error] Failed to update lead status:', e?.message || e);
    }
  }

  emitRealtimeEvent('lead:status_changed', { leadId: lead.id, status: newStatus });
  emitRealtimeEvent('lead:updated', lead);

  const effectiveActorName = actorName || req.headers['x-user-name'] || lead.assigneeName || 'Telecaller';
  notifyLeadStatusTransition(lead, newStatus, effectiveActorName);

  return res.json(lead);
});

router.get('/followups', async (req, res) => {
  if (dbPool) {
    try {
      const [rows] = await dbPool.query(`
        SELECT fu.*, l.first_name, l.last_name, l.phone as lead_phone,
               u.full_name as telecaller_name
        FROM follow_ups fu
        LEFT JOIN leads l ON fu.lead_id = l.id
        LEFT JOIN users u ON fu.telecaller_id = u.id
        ORDER BY fu.due_date ASC
      `);
      if (Array.isArray(rows) && rows.length > 0) {
        const dbFollowUps = rows.map((r) => {
          const d = r.due_date ? new Date(r.due_date) : null;
          const dueStr = d && !Number.isNaN(d.getTime()) ? d.toISOString().split('T')[0] : '';
          const dueTimeStr = d && !Number.isNaN(d.getTime()) ? d.toTimeString().slice(0, 5) : '10:00';
          return {
            id: `fol_${r.id}`,
            leadId: String(r.lead_id || ''),
            leadName: `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Lead Customer',
            leadPhone: r.lead_phone || '',
            telecallerId: String(r.telecaller_id || ''),
            telecallerName: r.telecaller_name || 'Telecaller',
            dueDate: dueStr,
            dueTime: dueTimeStr,
            status: r.status || 'PENDING',
            notes: r.notes || '',
            createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
          };
        });

        const merged = [...dbFollowUps];
        for (const mem of dbFollowUpsStore) {
          if (!merged.some((f) => String(f.leadId) === String(mem.leadId) && f.status === mem.status)) {
            merged.push(mem);
          }
        }
        return res.json(merged);
      }
    } catch (e) {
      console.error('[MySQL Error] Fetch follow_ups failed:', e?.message || e);
    }
  }
  return res.json(dbFollowUpsStore);
});


function validateBatchImportPayload(req, leads, metaWebhook) {
  const effectiveRole = String(req.user?.role || req.headers['x-user-role'] || req.body.uploaderRole || '').toUpperCase();
  const uploadRoles = ['ADMINISTRATOR', 'MARKETING_MANAGER', 'DIGITAL_MARKETING'];

  if (!metaWebhook && !uploadRoles.includes(effectiveRole)) {
    return { status: 403, error: 'Access Denied: Lead file uploads are restricted to Digital Marketing, Marketing Manager, and Administrator roles.' };
  }
  if (!Array.isArray(leads) || leads.length === 0) {
    return { status: 400, error: 'No lead array provided in request payload.' };
  }

  for (let i = 0; i < leads.length; i++) {
    const raw = leads[i];
    const fullName = String(raw.fullName || raw.leadName || raw['Full Name'] || raw['Lead Name'] || raw['Name'] || '').trim();
    const fName = String(raw.firstName || raw['First Name'] || raw['first_name'] || fullName.split(/\s+/)[0] || '').trim();
    const contactInfo = String(raw.contactInfo || raw['Contact Info'] || '').trim();
    const contactEmail = extractFirstEmail(contactInfo);
    const contactPhone = contactInfo
      .replace(contactEmail, '')
      .replace(/(?:phone|mobile|tel)\s*[:=-]?\s*/i, '')
      .trim();
    const ph = String(raw.phone || raw['Phone'] || raw['Phone Number'] || raw['Mobile'] || raw['Mobile Number'] || raw['Contact Number'] || raw['Contact'] || contactPhone).trim();

    if (!fName || !ph) {
      return { status: 400, error: `Validation Error on row #${i + 1}: A lead name and phone number are required.` };
    }
  }
  return null;
}

async function fetchTelecallersForImport(metaWebhook, selectedTelecallerIds, telecallersList) {
  let telecallers = [];
  if (metaWebhook && dbPool) {
    const [telecallerRows] = await dbPool.queryStrict(
      `SELECT u.id, u.full_name AS fullName, u.email, COUNT(l.id) AS assignedCount
       FROM users u
       INNER JOIN roles r ON r.id = u.role_id
       LEFT JOIN leads l ON (l.assigned_to = u.id)
       WHERE r.code = 'TELECALLER' AND u.is_active = 1
       GROUP BY u.id, u.full_name, u.email
       ORDER BY assignedCount ASC, u.id ASC`
    );
    telecallers = telecallerRows.map((user) => ({ ...user, id: String(user.id), role: 'TELECALLER', isActive: true }));
  } else if (!metaWebhook && dbPool?.isConnected()) {
    const [telecallerRows] = await dbPool.queryStrict(
      `SELECT u.id, u.full_name AS fullName, u.email
       FROM users u
       INNER JOIN roles r ON r.id = u.role_id
       WHERE r.code = 'TELECALLER' AND u.is_active = 1
       ORDER BY u.id ASC`
    );
    telecallers = telecallerRows.map((user) => ({ ...user, id: String(user.id), role: 'TELECALLER', isActive: true }));
  } else if (!metaWebhook) {
    telecallers = dbUsersStore.filter(
      (user) => String(user.role).toUpperCase() === 'TELECALLER' && user.isActive !== false
    );
  }

  if (metaWebhook && Array.isArray(telecallersList)) {
    telecallersList.forEach((reqTc) => {
      if (!telecallers.some((t) => t.id === reqTc.id)) {
        const syncedTc = {
          id: reqTc.id,
          fullName: reqTc.fullName || 'Telecaller User',
          email: reqTc.email || `${reqTc.id}@markops.io`,
          role: 'TELECALLER',
          isActive: true,
        };
        telecallers.push(syncedTc);
        if (!dbUsersStore.some((u) => u.id === reqTc.id)) {
          dbUsersStore.push(syncedTc);
        }
      }
    });
  }

  if (metaWebhook && Array.isArray(selectedTelecallerIds) && selectedTelecallerIds.length > 0) {
    const selectedSet = new Set(selectedTelecallerIds);
    const filteredSelected = telecallers.filter((u) => selectedSet.has(u.id));
    if (filteredSelected.length > 0) {
      telecallers = filteredSelected;
    }
  }

  if (!metaWebhook && telecallers.length === 0) {
    return { status: 409, error: 'No active telecallers are available. Activate at least one telecaller before uploading leads.' };
  }
  return { telecallers };
}

async function resolveImportCampaignId(metaWebhook, leads, targetCampName) {
  if (!dbPool) return null;
  try {
    const metaCampaignId = metaWebhook ? leads[0]?.metaCampaignId : null;
    const [campaignRows] = metaWebhook && metaCampaignId
      ? await dbPool.queryStrict(`SELECT id FROM campaigns WHERE meta_campaign_id = ? LIMIT 1`, [metaCampaignId])
      : await dbPool.query(`SELECT id FROM campaigns WHERE name = ? LIMIT 1`, [targetCampName]);
    if (campaignRows?.[0]) return campaignRows[0].id;
    const [firstCmp] = await dbPool.query(`SELECT id FROM campaigns LIMIT 1`);
    return firstCmp?.[0]?.id || null;
  } catch (dbErr) {
    if (metaWebhook) throw dbErr;
    console.log('[MySQL LookUp Notice] Failed to find campaign reference during lead processing:', dbErr.message);
    return null;
  }
}

function resolveUploaderInfo(req) {
  const uploaderUid = req.body.creatorId || req.body.uploaderId || req.headers['x-user-id'];
  let uploaderNameResolved = req.body.creatorName || req.headers['x-user-name'];
  let uploaderEmailResolved = req.body.creatorEmail || req.body.uploaderEmail || req.headers['x-user-email'];

  if ((!uploaderNameResolved || uploaderNameResolved === 'System Administrator') && uploaderUid) {
    const foundUser = dbUsersStore.find(
      (u) => String(u.id).toLowerCase() === String(uploaderUid).toLowerCase() || (u.email && u.email.toLowerCase() === String(uploaderUid).toLowerCase())
    );
    if (foundUser) {
      uploaderNameResolved = foundUser.fullName;
      uploaderEmailResolved = foundUser.email;
    }
  }
  return { uploaderUid, uploaderNameResolved, uploaderEmailResolved };
}

function parseLeadRawNames(raw, i) {
  const fullName = String(raw.fullName || raw.leadName || raw['Full Name'] || raw['Lead Name'] || raw['Name'] || '').trim();
  const fullNameParts = fullName.split(/\s+/).filter(Boolean);
  const firstName = String(raw.firstName || raw['First Name'] || raw['first_name'] || fullNameParts.shift() || `Lead ${i + 1}`).trim();
  const lastName = String(raw.lastName || raw['Last Name'] || raw['last_name'] || fullNameParts.join(' ')).trim();
  return { firstName, lastName };
}

function parseLeadRawContact(raw) {
  const email = String(raw.email || raw['Email'] || raw['email_address'] || '').trim();
  const contactInfo = String(raw.contactInfo || raw['Contact Info'] || '').trim();
  const contactEmail = extractFirstEmail(contactInfo);
  const contactPhone = contactInfo
    .replace(contactEmail, '')
    .replace(/(?:phone|mobile|tel)\s*[:=-]?\s*/i, '')
    .trim();
  const phone = String(raw.phone || raw['Phone'] || raw['Phone Number'] || raw['Mobile'] || raw['Mobile Number'] || raw['Contact Number'] || raw['Contact'] || contactPhone).trim();
  return { phone, emailAddress: email || contactEmail };
}

function buildImportedLeads(leads, telecallers, context) {
  const { req, campaignId, targetCampName, source, mysqlCampaignId, metaWebhook } = context;
  const createdLeads = [];
  const allocationSummary = {};
  telecallers.forEach((tc) => {
    allocationSummary[tc.id] = { id: tc.id, fullName: tc.fullName, email: tc.email, count: 0 };
  });

  const { uploaderUid, uploaderNameResolved, uploaderEmailResolved } = resolveUploaderInfo(req);
  const cleanCreatorId = Number.parseInt(String(uploaderUid || '1').replace(/\D/g, ''), 10) || 1;

  for (let i = 0; i < leads.length; i++) {
    const raw = leads[i];
    const assignedTelecaller = telecallers.length > 0 ? telecallers[i % telecallers.length] : null;
    const { firstName, lastName } = parseLeadRawNames(raw, i);
    const { phone, emailAddress } = parseLeadRawContact(raw);

    const cleanAssignedToId = assignedTelecaller ? (Number.parseInt(String(assignedTelecaller.id).replace(/\D/g, ''), 10) || null) : null;
    const targetPkgName = req.body.packageName || raw.packageName || raw.package || targetCampName || 'Careermate';
    const targetProdName = req.body.productName || raw.productName || raw.product || '';
    const targetProdId = req.body.productId || raw.productId || raw.product_id || '';
    const rowCampaignId = raw.campaignId || campaignId || 'cmp_default';

    const newLead = {
      id: `lead_${crypto.randomBytes(4).toString('hex')}`,
      firstName,
      lastName,
      email: emailAddress,
      phone,
      source: String(raw.source || raw['Source'] || raw['source'] || raw['Lead Source'] || source || (metaWebhook ? 'META_ADS' : 'Excel Import')).trim(),
      campaignId: metaWebhook && mysqlCampaignId != null ? String(mysqlCampaignId) : (campaignId || raw.campaignId || 'cmp_default'),
      campaignName: targetCampName,
      packageName: targetPkgName,
      package: targetPkgName,
      productName: targetProdName,
      productId: targetProdId,
      adId: raw.adId || '',
      metaLeadId: metaWebhook ? String(raw.metaLeadId) : undefined,
      metaCampaignId: metaWebhook ? String(raw.metaCampaignId || '') : undefined,
      metaAdId: metaWebhook ? String(raw.metaAdId || '') : undefined,
      status: assignedTelecaller ? 'ASSIGNED' : 'NEW',
      assignmentStatus: assignedTelecaller ? 'ASSIGNED' : 'UNASSIGNED',
      callDisposition: null,
      assignedTo: assignedTelecaller ? assignedTelecaller.id : null,
      assignedTelecallerId: assignedTelecaller ? assignedTelecaller.id : null,
      assigneeName: assignedTelecaller ? assignedTelecaller.fullName : 'Unassigned',
      creatorId: uploaderUid || '1',
      creatorEmail: uploaderEmailResolved || req.body.creatorEmail || 'admin@markops.io',
      creatorName: req.body.creatorName || uploaderNameResolved || 'System Administrator',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      _mysqlCampaignId: metaWebhook ? mysqlCampaignId : (Number.parseInt(String(rowCampaignId), 10) || mysqlCampaignId),
      _mysqlAdId: null,
      _mysqlAssignedTo: cleanAssignedToId,
      _mysqlCreatorId: cleanCreatorId
    };

    if (assignedTelecaller) {
      allocationSummary[assignedTelecaller.id].count++;
    }

    dbLeadsStore.unshift(newLead);
    createdLeads.push(newLead);
  }
  return { createdLeads, allocationSummary };
}

async function persistBatchLeadsToDb(createdLeads, metaWebhook) {
  if (!dbPool || (!metaWebhook && !dbPool.isConnected())) {
    if (metaWebhook) {
      const duplicate = dbLeadsStore.some((lead) => lead.metaLeadId === createdLeads[0]?.metaLeadId);
      if (duplicate) {
        dbLeadsStore.splice(dbLeadsStore.indexOf(createdLeads[0]), 1);
        return { duplicate: true };
      }
    }
    return null;
  }

  let importConnection = null;
  try {
    if (metaWebhook && createdLeads[0]?.metaAdId) {
      const [adRows] = await dbPool.queryStrict(
        `SELECT id FROM ads WHERE platform_ad_id = ? LIMIT 1`,
        [createdLeads[0].metaAdId]
      );
      createdLeads[0]._mysqlAdId = adRows[0]?.id || null;
    }

    if (!metaWebhook) {
      importConnection = await dbPool.getConnection();
      await importConnection.beginTransaction();
    }

    for (const l of createdLeads) {
      if (metaWebhook) {
        await dbPool.queryStrict(
          `INSERT INTO leads
           (first_name, last_name, email, phone, source, status, assigned_to, assigned_telecaller_id, creator_id, creator_name, creator_email,
            campaign_id, ad_id, campaign_name, meta_lead_id, meta_campaign_id, meta_ad_id, assignment_status, call_disposition,
            created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [
            l.firstName, l.lastName || null, l.email || null, l.phone, l.source, l.status, l._mysqlAssignedTo,
            l._mysqlAssignedTo, l._mysqlCreatorId, l.creatorName, l.creatorEmail, l._mysqlCampaignId, l._mysqlAdId, l.campaignName,
            l.metaLeadId, l.metaCampaignId || null, l.metaAdId || null, l.assignmentStatus, l.callDisposition,
          ]
        );
      } else {
        try {
          await importConnection.query(
            `INSERT INTO leads (first_name, last_name, email, phone, source, status, assigned_to, assigned_telecaller_id, assignment_status, creator_id, creator_name, creator_email, campaign_id, campaign_name, package_name, product_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [
              l.firstName, l.lastName, l.email, l.phone, l.source, l.status, l._mysqlAssignedTo, l._mysqlAssignedTo,
              l.assignmentStatus, l._mysqlCreatorId, l.creatorName, l.creatorEmail, l._mysqlCampaignId, l.campaignName,
              l.packageName || null, l.productId || null
            ]
          );
        } catch (colErr) {
          console.log('[MySQL Notice] Batch insert with full columns failed, falling back to minimal columns:', colErr?.message || colErr);
          try {
            await importConnection.query(
              `INSERT INTO leads (first_name, last_name, email, phone, source, status, assigned_to, creator_id, creator_name, creator_email, campaign_id, campaign_name, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
              [
                l.firstName, l.lastName, l.email, l.phone, l.source, l.status, l._mysqlAssignedTo,
                l._mysqlCreatorId, l.creatorName, l.creatorEmail, l._mysqlCampaignId, l.campaignName
              ]
            );
          } catch (coreErr) {
            console.error('[MySQL Error] Bulk insert core fallback:', coreErr.message);
          }
        }
      }
    }

    if (importConnection) {
      await importConnection.commit();
    }
    return null;
  } catch (e) {
    if (importConnection) {
      try {
        await importConnection.rollback();
      } catch (rollbackError) {
        console.error('[MySQL DB Error] Failed to roll back lead batch import:', rollbackError?.message || rollbackError);
      }
    }
    if (metaWebhook) {
      const storedIndex = dbLeadsStore.indexOf(createdLeads[0]);
      if (storedIndex !== -1) dbLeadsStore.splice(storedIndex, 1);
      if (e.code === 'ER_DUP_ENTRY' || e.errno === 1062) {
        return { duplicate: true };
      }
      return { error: e };
    }
    createdLeads.forEach((lead) => {
      const storedIndex = dbLeadsStore.indexOf(lead);
      if (storedIndex !== -1) dbLeadsStore.splice(storedIndex, 1);
    });
    return { error: e };
  } finally {
    if (importConnection) importConnection.release();
  }
}

function notifyAndAuditBatchImport(createdLeads, allocationSummary, telecallers, req, metaWebhook) {
  emitRealtimeEvent('leads:batch_imported', { total: createdLeads.length, allocationSummary });

  const creator = req.body.creatorName || req.body.uploaderEmail || 'System Administrator';
  const pkg = req.body.packageName || req.body.campaignName || 'CURRENT AFFAIRS AUGUST -2026';
  const prod = resolvePackageProductName(pkg, req.body.productName);

  Object.values(allocationSummary).forEach((summary) => {
    if (summary?.id && summary.count > 0) {
      const msg = `Assigned by: ${creator} -> Product: ${prod} -> Package: ${pkg} -> Total Leads: ${summary.count}`;
      const targetRoute = `/package-works?package=${encodeURIComponent(prod)}&workspace=${encodeURIComponent(pkg)}&dept=TELECALLING&tab=TELECALLING`;
      createNotificationForTelecaller(
        summary.id,
        `New Leads Assigned (${summary.count} Leads)`,
        msg,
        targetRoute
      );
    }
  });

  recordAuditLog(dbPool, {
    actorId: req.body.uploaderId || req.headers['x-user-id'] || 'usr_digital_01',
    actorEmail: req.body.uploaderEmail || 'digital@markops.io',
    action: metaWebhook ? 'META_LEAD_RECEIVED' : 'LEADS_EXCEL_BATCH_UPLOAD',
    entityType: 'LeadBatch',
    entityId: `batch_${Date.now()}`,
    newState: { totalUploaded: createdLeads.length, telecallersCount: telecallers.length, allocationSummary },
    ipAddress: req.ip || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'],
  }).catch((err) => console.log('Audit notice:', err?.message || err));
}

async function handleBatchImport(req, res, { metaWebhook = false } = {}) {
  const { leads, selectedTelecallerIds, campaignId, campaignName, source } = req.body;
  const validationError = validateBatchImportPayload(req, leads, metaWebhook);
  if (validationError) {
    return res.status(validationError.status).json({ error: validationError.error });
  }

  const telecallerRes = await fetchTelecallersForImport(metaWebhook, selectedTelecallerIds, req.body.telecallersList);
  if (telecallerRes.error) {
    return res.status(telecallerRes.status).json({ error: telecallerRes.error });
  }
  const telecallers = telecallerRes.telecallers;

  const targetCampName = campaignName || 'Digital Ad Campaign';
  const mysqlCampaignId = await resolveImportCampaignId(metaWebhook, leads, targetCampName);

  const { createdLeads, allocationSummary } = buildImportedLeads(leads, telecallers, {
    req, campaignId, targetCampName, source, mysqlCampaignId, metaWebhook
  });

  const dbResult = await persistBatchLeadsToDb(createdLeads, metaWebhook);
  if (dbResult?.duplicate) {
    return res.status(200).json({ success: true, duplicate: true });
  }
  if (dbResult?.error) {
    throw dbResult.error;
  }

  notifyAndAuditBatchImport(createdLeads, allocationSummary, telecallers, req, metaWebhook);

  return res.status(201).json({
    success: true,
    message: `Successfully uploaded ${createdLeads.length} leads and assigned equally among ${telecallers.length} active telecallers!`,
    totalUploaded: createdLeads.length,
    telecallersCount: telecallers.length,
    leadsPerTelecaller: telecallers.length > 0 ? Math.floor(createdLeads.length / telecallers.length) : 0,
    allocationSummary: Object.values(allocationSummary),
    leads: createdLeads,
  });
}

router.handleBatchImport = handleBatchImport;
router.reconcileCallActivities = reconcileCallActivities;
router.isSameCallActivity = isSameCallActivity;

router.post('/leads/batch-import', async (req, res) => {
  return handleBatchImport(req, res);
});

function calculateSingleTelecallerMetrics(tc, allLeads, allCalls) {
  const assigned = allLeads.filter((l) => String(l.assignedTo || l.assigned_to) === String(tc.id));
  const calls = allCalls.filter((c) => String(c.telecallerId) === String(tc.id));

  const attendedCalls = calls.filter((c) => {
    const out = String(c.outcome || '').toUpperCase();
    return out === 'CONNECTED' || out === 'INTERESTED' || out === 'NOT_INTERESTED' || out === 'QUALIFIED';
  });
  const notAttendedCalls = calls.filter((c) => {
    const out = String(c.outcome || '').toUpperCase();
    return out === 'NO_ANSWER' || out === 'BUSY' || out === 'WRONG_NUMBER' || out === 'LINE_BUSY';
  });
  const interestedCalls = calls.filter((c) => String(c.outcome || '').toUpperCase() === 'INTERESTED');
  const notInterestedCalls = calls.filter((c) => String(c.outcome || '').toUpperCase() === 'NOT_INTERESTED');

  const getLeadKey = (c) => String(c.leadId || c.leadPhone || c.leadName || '').trim().toLowerCase();

  const uniqueLeadsCalled = new Set(calls.map(getLeadKey).filter(Boolean));
  const uniqueAttendedLeads = new Set(attendedCalls.map(getLeadKey).filter(Boolean));
  const uniqueNotAttendedLeads = new Set(notAttendedCalls.map(getLeadKey).filter(Boolean));
  const uniqueInterestedLeads = new Set(interestedCalls.map(getLeadKey).filter(Boolean));
  const uniqueNotInterestedLeads = new Set(notInterestedCalls.map(getLeadKey).filter(Boolean));

  const totalDurationSeconds = calls.reduce((acc, c) => acc + (Number(c.durationSeconds) || 0), 0);
  const avgDurationSeconds = calls.length > 0 ? Math.round(totalDurationSeconds / calls.length) : 0;

  return {
    id: tc.id,
    fullName: tc.fullName,
    email: tc.email,
    department: tc.department || 'Telecalling Sales',
    assignedLeadsCount: assigned.length,
    callsLoggedCount: uniqueLeadsCalled.size,
    attendedCount: uniqueAttendedLeads.size,
    notAttendedCount: uniqueNotAttendedLeads.size,
    interestedCount: uniqueInterestedLeads.size,
    notInterestedCount: uniqueNotInterestedLeads.size,
    totalDurationSeconds,
    avgDurationSeconds,
    conversionRate: assigned.length > 0 ? Math.round((uniqueInterestedLeads.size / assigned.length) * 100) : 0,
  };
}

async function fetchDbTelecallingData() {
  let allLeads = [];
  let allUsers = [];
  let allCalls = [...dbCallActivitiesStore];

  if (!dbPool) return { allLeads, allUsers, allCalls };

  try {
    const [leadsRows] = await dbPool.query(`
      SELECT l.*, u.full_name as assignee_full_name, u.email as assignee_user_email
      FROM leads l
      LEFT JOIN users u ON l.assigned_to = u.id
    `);
    if (Array.isArray(leadsRows)) {
      allLeads = leadsRows.map((r) => ({
        id: r.id,
        status: r.status,
        assignedTo: r.assigned_to,
        assigneeName: r.assignee_full_name,
        assigneeEmail: r.assignee_user_email,
      }));
    }
    const [userRows] = await dbPool.query(`
      SELECT u.id, u.full_name as fullName, u.email, u.department, COALESCE(r.code, 'ADMINISTRATOR') as role, u.is_active as isActive
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
    `);
    if (Array.isArray(userRows)) {
      allUsers = userRows.map((u) => ({
        id: u.id,
        fullName: u.fullName,
        email: u.email,
        department: u.department,
        role: u.role,
        isActive: Boolean(u.isActive),
      }));
    }
    const [callRows] = await dbPool.query(`
      SELECT id, lead_id as leadId, telecaller_id as telecallerId, outcome, duration_seconds as durationSeconds, remarks, called_at as calledAt
      FROM call_activities
    `);
    if (callRows?.length > 0) {
      allCalls = callRows;
    }
  } catch (e) {
    console.log('[telecalling-summary MySQL Error]:', e?.message || e);
  }

  return { allLeads, allUsers, allCalls };
}

router.get('/leads/telecalling-summary', async (req, res) => {
  const currentRole = String(req.user?.role || req.headers['x-user-role'] || '').toUpperCase();
  const currentUserId = resolveCurrentUserId(req);
  const isTelecallerRole = currentRole === 'TELECALLER';

  let { allLeads, allUsers, allCalls } = await fetchDbTelecallingData();

  if (allLeads.length === 0) allLeads = dbLeadsStore;
  if (allUsers.length === 0) allUsers = dbUsersStore;

  const telecallerLeads = isTelecallerRole && currentUserId
    ? allLeads.filter((l) => String(l.assignedTo || l.assigned_to) === currentUserId)
    : allLeads;

  const totalLeads = telecallerLeads.length;
  const assignedLeads = telecallerLeads.filter((l) => l.assignedTo || l.assigned_to).length;
  const unassignedLeads = totalLeads - assignedLeads;

  const statusBreakdown = {
    NEW: 0,
    ASSIGNED: 0,
    CONTACTED: 0,
    INTERESTED: 0,
    NOT_INTERESTED: 0,
    QUALIFIED: 0,
    CONVERTED: 0,
    LOST: 0,
  };

  telecallerLeads.forEach((l) => {
    if (statusBreakdown[l.status] !== undefined) {
      statusBreakdown[l.status]++;
    }
  });

  const telecallers = allUsers.filter((u) => u.role === 'TELECALLER' && u.isActive !== false);
  const telecallerMetrics = telecallers.map((tc) => calculateSingleTelecallerMetrics(tc, allLeads, allCalls));

  return res.json({
    totalLeads,
    assignedLeads,
    unassignedLeads,
    totalCallsLogged: allCalls.length,
    statusBreakdown,
    telecallerMetrics,
  });
});


function targetUpdatedAt(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function formatTelecallerTarget(row) {
  return {
    id: `tgt_${row.telecaller_id}`,
    telecallerId: String(row.telecaller_id),
    telecallerName: row.telecaller_name,
    telecallerEmail: row.telecaller_email || '',
    dailyCallsTarget: Number(row.daily_calls_target),
    dailyInterestedTarget: Number(row.daily_interested_target),
    dailyDurationTargetSeconds: Number(row.daily_duration_target_seconds),
    updatedBy: row.updated_by,
    updatedAt: targetUpdatedAt(row.updated_at),
  };
}

function formatCommonTarget(row) {
  return {
    dailyCallsTarget: Number(row.daily_calls_target),
    dailyInterestedTarget: Number(row.daily_interested_target),
    dailyDurationTargetSeconds: Number(row.daily_duration_target_seconds),
    updatedBy: row.updated_by,
    updatedAt: targetUpdatedAt(row.updated_at),
  };
}

function parseQuota(value, fallback, label, min, max) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be a whole number between ${min} and ${max}.`);
  }
  return parsed;
}

async function readCommonTarget() {
  if (dbPool.isConnected()) {
    const [rows] = await dbPool.queryStrict(
      `SELECT daily_calls_target, daily_interested_target, daily_duration_target_seconds, updated_by, updated_at
       FROM telecaller_common_target WHERE id = 1`
    );
    if (rows.length > 0) return formatCommonTarget(rows[0]);
  }
  return dbCommonTargetStore;
}

async function readTelecallerTarget(telecallerId) {
  if (dbPool.isConnected()) {
    const [rows] = await dbPool.queryStrict(
      `SELECT telecaller_id, telecaller_name, telecaller_email, daily_calls_target,
              daily_interested_target, daily_duration_target_seconds, updated_by, updated_at
       FROM telecaller_targets WHERE telecaller_id = ?`,
      [telecallerId]
    );
    return rows.length > 0 ? formatTelecallerTarget(rows[0]) : null;
  }
  return dbTelecallerTargetsStore.find(
    (item) => String(item.telecallerId) === String(telecallerId)
  ) || null;
}

router.get('/telecaller-targets/common', async (req, res) => {
  try {
    return res.json(await readCommonTarget());
  } catch (error) {
    console.error('[Telecaller Targets] Failed to load common target:', error);
    return res.status(500).json({ error: 'Failed to load common telecaller targets.' });
  }
});

router.post(
  '/telecaller-targets/common',
  requireRole(['ADMINISTRATOR', 'MARKETING_MANAGER']),
  async (req, res) => {
    try {
      const current = await readCommonTarget();
      const updatedBy = `${req.user.fullName} (${req.user.role})`;
      const target = {
        dailyCallsTarget: parseQuota(req.body.dailyCallsTarget, current.dailyCallsTarget, 'Daily calls target', 1, 300),
        dailyInterestedTarget: parseQuota(req.body.dailyInterestedTarget, current.dailyInterestedTarget, 'Daily interested leads target', 0, 50),
        dailyDurationTargetSeconds: parseQuota(
          req.body.dailyDurationTargetSeconds,
          current.dailyDurationTargetSeconds,
          'Daily duration target',
          0,
          86400
        ),
        updatedBy,
        updatedAt: new Date().toISOString(),
      };

      if (dbPool.isConnected()) {
        await dbPool.queryStrict(
          `INSERT INTO telecaller_common_target
            (id, daily_calls_target, daily_interested_target, daily_duration_target_seconds, updated_by)
           VALUES (1, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
            daily_calls_target = VALUES(daily_calls_target),
            daily_interested_target = VALUES(daily_interested_target),
            daily_duration_target_seconds = VALUES(daily_duration_target_seconds),
            updated_by = VALUES(updated_by)`,
          [
            target.dailyCallsTarget,
            target.dailyInterestedTarget,
            target.dailyDurationTargetSeconds,
            target.updatedBy,
          ]
        );
        await dbPool.queryStrict(
          `UPDATE telecaller_targets
           SET daily_calls_target = ?, daily_interested_target = ?,
               daily_duration_target_seconds = ?, updated_by = ?`,
          [
            target.dailyCallsTarget,
            target.dailyInterestedTarget,
            target.dailyDurationTargetSeconds,
            target.updatedBy,
          ]
        );
      }

      Object.assign(dbCommonTargetStore, target);
      dbTelecallerTargetsStore.forEach((item) => Object.assign(item, {
        dailyCallsTarget: target.dailyCallsTarget,
        dailyInterestedTarget: target.dailyInterestedTarget,
        dailyDurationTargetSeconds: target.dailyDurationTargetSeconds,
        updatedBy: target.updatedBy,
        updatedAt: target.updatedAt,
      }));

      emitRealtimeEvent('telecaller_target:updated', target);
      return res.json(target);
    } catch (error) {
      if (error.message.includes('must be a whole number')) {
        return res.status(400).json({ error: error.message });
      }
      console.error('[Telecaller Targets] Failed to save common target:', error);
      return res.status(500).json({ error: 'Failed to save common telecaller targets.' });
    }
  }
);

router.get('/telecaller-targets', async (req, res) => {
  try {
    const common = await readCommonTarget();
    const role = String(req.user?.role || '').toUpperCase();
    let targets = dbTelecallerTargetsStore;

    if (dbPool.isConnected()) {
      const [rows] = role === 'TELECALLER'
        ? await dbPool.queryStrict(
            `SELECT telecaller_id, telecaller_name, telecaller_email, daily_calls_target,
                    daily_interested_target, daily_duration_target_seconds, updated_by, updated_at
             FROM telecaller_targets WHERE telecaller_id = ?`,
            [String(req.user.id)]
          )
        : await dbPool.queryStrict(
            `SELECT telecaller_id, telecaller_name, telecaller_email, daily_calls_target,
                    daily_interested_target, daily_duration_target_seconds, updated_by, updated_at
             FROM telecaller_targets`
          );
      targets = rows.map(formatTelecallerTarget);
    } else if (role === 'TELECALLER') {
      targets = targets.filter((target) => String(target.telecallerId) === String(req.user.id));
    }

    return res.json({ common, targets });
  } catch (error) {
    console.error('[Telecaller Targets] Failed to load targets:', error);
    return res.status(500).json({ error: 'Failed to load telecaller targets.' });
  }
});

router.post(
  '/telecaller-targets/:telecallerId',
  requireRole(['ADMINISTRATOR', 'MARKETING_MANAGER']),
  async (req, res) => {
    const telecallerId = String(req.params.telecallerId || '').trim();
    if (!telecallerId || telecallerId.length > 64) {
      return res.status(400).json({ error: 'A valid telecaller ID is required.' });
    }

    try {
      const current = await readTelecallerTarget(telecallerId) || await readCommonTarget();
      const updatedBy = `${req.user.fullName} (${req.user.role})`;
      const target = {
        id: `tgt_${telecallerId}`,
        telecallerId,
        telecallerName: String(req.body.telecallerName || current.telecallerName || 'Telecaller').trim(),
        telecallerEmail: String(req.body.telecallerEmail || current.telecallerEmail || '').trim(),
        dailyCallsTarget: parseQuota(req.body.dailyCallsTarget, current.dailyCallsTarget, 'Daily calls target', 1, 300),
        dailyInterestedTarget: parseQuota(
          req.body.dailyInterestedTarget,
          current.dailyInterestedTarget,
          'Daily interested leads target',
          0,
          50
        ),
        dailyDurationTargetSeconds: parseQuota(
          req.body.dailyDurationTargetSeconds,
          current.dailyDurationTargetSeconds,
          'Daily duration target',
          0,
          86400
        ),
        updatedBy,
        updatedAt: new Date().toISOString(),
      };

      if (dbPool.isConnected()) {
        await dbPool.queryStrict(
          `INSERT INTO telecaller_targets
            (telecaller_id, telecaller_name, telecaller_email, daily_calls_target,
             daily_interested_target, daily_duration_target_seconds, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
            telecaller_name = VALUES(telecaller_name),
            telecaller_email = VALUES(telecaller_email),
            daily_calls_target = VALUES(daily_calls_target),
            daily_interested_target = VALUES(daily_interested_target),
            daily_duration_target_seconds = VALUES(daily_duration_target_seconds),
            updated_by = VALUES(updated_by)`,
          [
            target.telecallerId,
            target.telecallerName,
            target.telecallerEmail,
            target.dailyCallsTarget,
            target.dailyInterestedTarget,
            target.dailyDurationTargetSeconds,
            target.updatedBy,
          ]
        );
      }

      const existingIndex = dbTelecallerTargetsStore.findIndex(
        (item) => String(item.telecallerId) === telecallerId
      );
      if (existingIndex >= 0) dbTelecallerTargetsStore[existingIndex] = target;
      else dbTelecallerTargetsStore.push(target);

      emitRealtimeEvent('telecaller_target:user_updated', target);
      return res.json(target);
    } catch (error) {
      if (error.message.includes('must be a whole number')) {
        return res.status(400).json({ error: error.message });
      }
      console.error(`[Telecaller Targets] Failed to save target for ${telecallerId}:`, error);
      return res.status(500).json({ error: 'Failed to save telecaller target.' });
    }
  }
);

module.exports = router;
