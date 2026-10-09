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
const router = express.Router();

function createNotificationForTelecaller(targetUserId, title, message, targetRoute = '') {
  if (!targetUserId) return;
  dispatchNotification({
    userIds: [targetUserId],
    title,
    message,
    type: 'INFO',
    targetRoute: targetRoute || '/package-works?dept=TELECALLING&tab=TELECALLING',
  }).catch(() => {});
}

router.get('/leads', async (req, res) => {
  const currentRole = String(req.user?.role || req.headers['x-user-role'] || '').toUpperCase();
  const currentUserId = req.user?.id ? String(req.user.id) : (req.headers['x-user-id'] ? String(req.headers['x-user-id']) : null);
  const currentUserEmail = (req.user?.email || req.headers['x-user-email'] || '').toLowerCase().trim();
  const currentUserName = (req.user?.fullName || req.headers['x-user-name'] || '').toLowerCase().trim();
  const isTelecallerRole = currentRole === 'TELECALLER';

  if (dbPool) {
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
        const numUid = parseInt(String(currentUserId || '').replace(/\D/g, ''), 10);
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
          isNaN(numUid) ? -1 : numUid,
          currentUserId || '__none__',
          currentUserEmail || '__none__',
          currentUserName || '__none__',
          isNaN(numUid) ? -1 : numUid,
          currentUserId || '__none__',
          currentUserEmail || '__none__',
          currentUserName || '__none__',
          `%${currentUserName || '__none__'}%`
        );
      }

      queryStr += ` ORDER BY l.created_at DESC`;

      try {
        const [callRows] = await dbPool.query(`
          SELECT ca.*, l.phone as lead_phone, l.first_name, l.last_name
          FROM call_activities ca
          LEFT JOIN leads l ON ca.lead_id = l.id
          ORDER BY ca.called_at DESC
        `);
        if (Array.isArray(callRows)) {
          callRows.forEach((r) => {
            const exists = dbCallActivitiesStore.some((c) => String(c.id) === `call_${r.id}` || (String(c.leadId) === String(r.lead_id) && c.calledAt === (r.called_at ? new Date(r.called_at).toISOString() : '')));
            if (!exists) {
              dbCallActivitiesStore.unshift({
                id: `call_${r.id}`,
                leadId: String(r.lead_id),
                leadPhone: r.lead_phone || '',
                leadName: `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Lead Customer',
                telecallerId: String(r.telecaller_id),
                outcome: r.outcome,
                durationSeconds: r.duration_seconds || 0,
                remarks: r.remarks || '',
                nextAction: r.next_action || '',
                calledAt: r.called_at ? new Date(r.called_at).toISOString() : new Date().toISOString(),
              });
            }
          });
        }
      } catch (callErr) {
      }

      const [rows] = await dbPool.query(queryStr, queryParams);
      if (Array.isArray(rows)) {
        const leads = rows.map((row) => {
          const inMem = dbLeadsStore.find((m) => String(m.id) === String(row.id) || (m.phone && row.phone && m.phone.replace(/\D/g, '') === row.phone.replace(/\D/g, '')));
          const matchedAd = dbAdsStore.find((ad) => String(ad.id) === String(row.ad_id) || String(ad.platformAdId) === String(row.ad_id));
          const matchedAdByCmp = dbAdsStore.find((ad) => (row.campaign_id && String(ad.campaignId) === String(row.campaign_id)) || (row.campaign_name && ad.campaignName && ad.campaignName.toLowerCase().trim() === String(row.campaign_name).toLowerCase().trim()));
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
            status: row.status,
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
          leads.forEach((lead) => {
            const lId = String(lead.id || '').trim().toLowerCase();
            const lPhone = String(lead.phone || '').replace(/\D/g, '');
            const lName = `${lead.firstName || ''} ${lead.lastName || ''}`.trim().toLowerCase();

            const leadCalls = dbCallActivitiesStore.filter((c) => {
              const cLeadId = String(c.leadId || '').trim().toLowerCase();
              const cPhone = String(c.leadPhone || c.phone || '').replace(/\D/g, '');
              const cLeadName = String(c.leadName || '').trim().toLowerCase();
              if (cLeadId && lId && cLeadId === lId) return true;
              if (lPhone && cPhone && lPhone === cPhone) return true;
              if (cLeadName && lName && (cLeadName === lName || cLeadName.includes(lName) || lName.includes(cLeadName))) return true;
              return false;
            });

            if (leadCalls.length > 0) {
              const latestCall = leadCalls[0];
              const out = String(latestCall.outcome || '').toUpperCase().replace(/\s+/g, '_');
              lead.status = out === 'BUSY' ? 'LINE_BUSY' : out;
              if (latestCall.remarks && latestCall.remarks !== '—') {
                lead.remarks = latestCall.remarks;
                lead.notes = latestCall.remarks;
              }
            }
          });
        }

        return res.json(leads);
      }
    } catch (e) {
      console.error('[MySQL DB Error] Failed to fetch leads from MySQL:', e?.message || e);
    }
  }

  
  let leads = [...dbLeadsStore];
  if (isTelecallerRole) {
    leads = leads.filter((l) => {
      const aTo = String(l.assignedTo || l.assigned_to || l.assignedTelecallerId || l.assigned_telecaller_id || '').toLowerCase().trim();
      const aName = String(l.assigneeName || l.assignee_name || '').toLowerCase().trim();
      const uid = String(currentUserId || '').toLowerCase().trim();
      const uemail = String(currentUserEmail || '').toLowerCase().trim();
      const uname = String(currentUserName || '').toLowerCase().trim();

      if (uid && (aTo === uid || parseInt(aTo, 10) === parseInt(uid, 10))) return true;
      if (uemail && (aTo === uemail || aName === uemail || aTo.includes(uemail))) return true;
      if (uname && (aName === uname || aTo === uname || aName.includes(uname) || uname.includes(aName) || aTo.includes(uname))) return true;
      return false;
    });
  }

  if (Array.isArray(leads) && Array.isArray(dbCallActivitiesStore)) {
    leads.forEach((lead) => {
      const lId = String(lead.id || '').trim().toLowerCase();
      const lPhone = String(lead.phone || '').replace(/\D/g, '');
      const lName = `${lead.firstName || ''} ${lead.lastName || ''}`.trim().toLowerCase();

      const leadCalls = dbCallActivitiesStore.filter((c) => {
        const cLeadId = String(c.leadId || '').trim().toLowerCase();
        const cPhone = String(c.leadPhone || c.phone || '').replace(/\D/g, '');
        const cLeadName = String(c.leadName || '').trim().toLowerCase();
        if (cLeadId && lId && cLeadId === lId) return true;
        if (lPhone && cPhone && lPhone === cPhone) return true;
        if (cLeadName && lName && (cLeadName === lName || cLeadName.includes(lName) || lName.includes(cLeadName))) return true;
        return false;
      });

      if (leadCalls.length > 0) {
        const latestCall = leadCalls[0];
        const out = String(latestCall.outcome || '').toUpperCase().replace(/\s+/g, '_');
        lead.status = out === 'BUSY' ? 'LINE_BUSY' : out;
      }
      if (!lead.creatorName && (lead.creatorId || lead.uploaderId || lead.creatorEmail || lead.uploaderEmail)) {
        const uId = String(lead.creatorId || lead.uploaderId || '').toLowerCase();
        const uEm = String(lead.creatorEmail || lead.uploaderEmail || '').toLowerCase();
        const foundUser = dbUsersStore.find(
          (u) => (uId && String(u.id).toLowerCase() === uId) || (uEm && u.email && u.email.toLowerCase() === uEm)
        );
        if (foundUser) {
          lead.creatorName = foundUser.fullName;
          lead.creatorEmail = foundUser.email;
        }
      }
    });
  }
  return res.json(leads);
});

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
  const campId = String(campaignId || '').trim();
  const campName = String(campaignName || 'General Intake').trim();
  const targetAdId = String(adId || '').trim();
  const targetAdName = String(adName || '').trim();
  const targetAssignedTo = assignedTo ? String(assignedTo).trim() : null;
  let targetAssigneeName = targetAssignedTo ? String(assigneeName || 'Assigned Telecaller').trim() : 'Unassigned';

  if (!fName || !lName || !em || !ph || !src) {
    return res.status(400).json({
      error: 'Validation Error: All fields (First Name, Last Name, Email, Phone, Source) are strictly required.',
    });
  }

  const effectiveUserId = creatorId || req.headers['x-user-id'];
  let resolvedCreatorName = creatorName || req.headers['x-user-name'];
  let resolvedCreatorEmail = creatorEmail || req.headers['x-user-email'];

  if ((!resolvedCreatorName || resolvedCreatorName === 'System Administrator') && effectiveUserId) {
    const foundUser = dbUsersStore.find(
      (u) => String(u.id).toLowerCase() === String(effectiveUserId).toLowerCase() || (u.email && u.email.toLowerCase() === String(effectiveUserId).toLowerCase())
    );
    if (foundUser) {
      resolvedCreatorName = foundUser.fullName;
      resolvedCreatorEmail = foundUser.email;
    }
  }


  let mysqlCampaignId = null;
  if (dbPool) {
    try {
      const [campaigns] = await dbPool.query(
        `SELECT id FROM campaigns WHERE name = ? LIMIT 1`,
        [campName]
      );
      if (campaigns && campaigns.length > 0) {
        mysqlCampaignId = campaigns[0].id;
      } else {
        const requestedCampaignId = Number(campId);
        if (Number.isInteger(requestedCampaignId) && requestedCampaignId > 0) {
          const [requestedCampaigns] = await dbPool.query(
            `SELECT id FROM campaigns WHERE id = ? LIMIT 1`,
            [requestedCampaignId]
          );
          mysqlCampaignId = requestedCampaigns?.[0]?.id || null;
        }
        if (!mysqlCampaignId) {
          const [firstCmp] = await dbPool.query(`SELECT id FROM campaigns LIMIT 1`);
          mysqlCampaignId = firstCmp?.[0]?.id || null;
        }
      }
    } catch (dbErr) {
      console.log('[MySQL LookUp Notice] Failed to find parent campaign for lead:', dbErr.message);
    }
  }

  const numericCreatorId = parseInt(String(effectiveUserId || '1').replace(/\D/g, ''), 10) || 1;
  const numericAssignedTo = targetAssignedTo ? (parseInt(targetAssignedTo.replace(/\D/g, ''), 10) || null) : null;
  let numericAdId = targetAdId ? (parseInt(targetAdId.replace(/\D/g, ''), 10) || null) : null;

  if (dbPool && targetAdName) {
    try {
      const [existingAds] = await dbPool.query('SELECT id, name FROM ads WHERE name = ? LIMIT 1', [targetAdName]);
      if (existingAds && existingAds.length > 0) {
        numericAdId = existingAds[0].id;
      } else if (mysqlCampaignId) {
        const [insertedAd] = await dbPool.query(
          `INSERT INTO ads (campaign_id, name, platform, status, spend, impressions, clicks, leads_count, created_at, updated_at)
           VALUES (?, ?, 'Meta', 'ACTIVE', 0, 0, 0, 0, NOW(), NOW())`,
          [mysqlCampaignId, targetAdName]
        );
        if (insertedAd && insertedAd.insertId) {
          numericAdId = insertedAd.insertId;
        }
      }
    } catch (adErr) {
      console.log('[MySQL Notice] Auto-link ad for lead notice:', adErr.message);
    }
  }

  const newLead = {
    id: `lead_${Math.random().toString(36).substring(2, 10)}`,
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
    creatorEmail: resolvedCreatorEmail || creatorEmail || 'admin@markops.io',
    creatorName: resolvedCreatorName || creatorName || 'System Administrator',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  dbLeadsStore.unshift(newLead);

  if (dbPool) {
    try {
      await dbPool.query(
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
          numericAdId
        ]
      );
    } catch (e) {
      console.log('[MySQL Notice] Save lead to database with ad_id failed, trying default format:', e?.message || e);
      try {
        await dbPool.query(
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
            newLead.campaignName
          ]
        );
      } catch (fallbackErr) {
        console.log('[MySQL Notice] Fallback save lead failed:', fallbackErr?.message || fallbackErr);
      }
    }
  }

  emitRealtimeEvent('lead:created', newLead);
  if (targetAssignedTo) {
    emitRealtimeEvent('lead:assigned', newLead);
    const creator = creatorName || creatorEmail || 'System Administrator';
    const prod = productName || 'Careermate';
    const pkg = packageName || campName || 'CURRENT AFFAIRS AUGUST -2026';
    const msg = `Assigned by: ${creator} -> Product: ${prod} -> Package: ${pkg} -> Total Leads: 1`;
    const targetRoute = `/package-works?package=${encodeURIComponent(prod)}&workspace=${encodeURIComponent(pkg)}&dept=TELECALLING&tab=TELECALLING`;
    createNotificationForTelecaller(targetAssignedTo, 'New Lead Assigned', msg, targetRoute);

    if (newLead.creatorId && String(newLead.creatorId) !== String(targetAssignedTo)) {
      dispatchNotification({
        userIds: [newLead.creatorId],
        title: 'Lead Assigned Successfully',
        message: `Lead "${newLead.firstName} ${newLead.lastName || ''}" has been assigned to ${targetAssigneeName}.`,
        type: 'INFO',
        targetRoute: '/leads',
      }).catch(() => {});
    }
  }

  await recordAuditLog(dbPool, {
    actorId: creatorId || req.headers['x-user-id'] || 'usr_admin_01',
    actorEmail: creatorEmail || 'admin@markops.io',
    action: targetAssignedTo ? 'LEAD_CREATED_AND_ASSIGNED' : 'LEAD_CREATED',
    entityType: 'Lead',
    entityId: newLead.id,
    newState: { name: `${newLead.firstName} ${newLead.lastName}`, phone: newLead.phone, assignedTo: targetAssignedTo, campaign: campName },
    ipAddress: req.ip || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'],
  });
  
  return res.status(201).json(newLead);
});


router.post('/leads/:id/assign', async (req, res) => {
  const { assignedTo, assigneeName, actorId, actorEmail, creatorName, productName, packageName } = req.body;
  const leadId = String(req.params.id).trim();

  let lead = null;
  if (dbPool) {
    try {
      const [rows] = await dbPool.query(
        `SELECT l.*, 
                c.full_name as creator_full_name, 
                c.email as creator_user_email,
                u.full_name as assignee_full_name,
                u.email as assignee_user_email
         FROM leads l
         LEFT JOIN users c ON l.creator_id = c.id
         LEFT JOIN users u ON l.assigned_to = u.id
         WHERE l.id = ?`,
        [leadId]
      );
      if (rows && rows.length > 0) {
        const row = rows[0];
        lead = {
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
          createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
          updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
        };
      }
    } catch (e) {
      console.error('[MySQL Error] Fetch lead for assign failed:', e.message);
    }
  }

  if (!lead) {
    lead = dbLeadsStore.find((l) => String(l.id).trim() === leadId);
  }

  if (!lead) return res.status(404).json({ error: `Lead #${leadId} not found.` });


  const currentRole = String(req.user?.role || req.headers['x-user-role'] || '').toUpperCase();
  const currentUserId = req.user?.id ? String(req.user.id) : (req.headers['x-user-id'] ? String(req.headers['x-user-id']) : null);
  const currentUserEmail = (req.user?.email || req.headers['x-user-email'] || '').toLowerCase().trim();
  const currentUserName = (req.user?.fullName || req.headers['x-user-name'] || '').toLowerCase().trim();

  const leadCreatorId = lead.creator_id !== undefined ? String(lead.creator_id) : (lead.creatorId !== undefined ? String(lead.creatorId) : '');
  const leadCreatorEmail = (lead.creator_user_email || lead.creator_email || lead.creatorEmail || '').toLowerCase().trim();
  const leadCreatorName = (lead.creator_full_name || lead.creator_name || lead.creatorName || '').toLowerCase().trim();

  const isCreator = Boolean(
    (currentUserId && leadCreatorId && String(currentUserId) === String(leadCreatorId)) ||
    (currentUserEmail && leadCreatorEmail && currentUserEmail === leadCreatorEmail) ||
    (currentUserName && leadCreatorName && currentUserName === leadCreatorName) ||
    (currentRole === 'ADMINISTRATOR')
  );

  if (!isCreator) {
    return res.status(403).json({ error: 'Access Denied: Only the creator who created this lead can reassign it.' });
  }

  let cleanAssignedTo = null;
  let effectiveName = assigneeName;

  if (assignedTo) {
    const targetUserIdStr = String(assignedTo).trim();
    if (dbPool) {
      try {
        const [userRows] = await dbPool.query(
          `SELECT id, full_name, email FROM users WHERE id = ? OR email = ? LIMIT 1`,
          [targetUserIdStr, targetUserIdStr]
        );
        if (userRows && userRows.length > 0) {
          cleanAssignedTo = userRows[0].id;
          effectiveName = userRows[0].full_name;
        }
      } catch (err) {
        console.error('[MySQL Error] Fetch user for assign failed:', err.message);
      }
    }

    if (!cleanAssignedTo) {
      const user = dbUsersStore.find(
        (u) => String(u.id).trim() === targetUserIdStr || u.email === targetUserIdStr
      );
      if (user) {
        const parsed = parseInt(String(user.id).replace(/\D/g, ''), 10);
        cleanAssignedTo = !isNaN(parsed) && parsed > 0 ? parsed : user.id;
        effectiveName = user.fullName;
      } else {
        const parsed = parseInt(targetUserIdStr.replace(/\D/g, ''), 10);
        cleanAssignedTo = !isNaN(parsed) && parsed > 0 ? parsed : targetUserIdStr;
      }
    }
  }

  const finalStatus = cleanAssignedTo ? 'ASSIGNED' : 'NEW';
  const finalAssigneeName = cleanAssignedTo ? (effectiveName || 'Assigned Telecaller') : 'Unassigned';


  if (dbPool) {
    try {
      const numLeadId = parseInt(leadId, 10);
      if (!isNaN(numLeadId)) {
        try {
          await dbPool.query(
            `UPDATE leads
             SET assigned_to = ?, assigned_telecaller_id = ?, assignment_status = ?, status = ?, updated_at = NOW()
             WHERE id = ?`,
            [
              cleanAssignedTo ? (parseInt(String(cleanAssignedTo).replace(/\D/g, ''), 10) || cleanAssignedTo) : null,
              cleanAssignedTo ? (parseInt(String(cleanAssignedTo).replace(/\D/g, ''), 10) || cleanAssignedTo) : null,
              cleanAssignedTo ? 'ASSIGNED' : 'UNASSIGNED',
              finalStatus,
              numLeadId,
            ]
          );
        } catch (colErr) {
          await dbPool.query(
            `UPDATE leads
             SET assigned_to = ?, status = ?, updated_at = NOW()
             WHERE id = ?`,
            [
              cleanAssignedTo ? (parseInt(String(cleanAssignedTo).replace(/\D/g, ''), 10) || cleanAssignedTo) : null,
              finalStatus,
              numLeadId,
            ]
          );
        }
      }
    } catch (e) {
      console.error('[MySQL Error] Update lead assignment failed:', e.message);
    }
  }


  const storeIdx = dbLeadsStore.findIndex((l) => String(l.id).trim() === leadId);
  if (storeIdx !== -1) {
    dbLeadsStore[storeIdx].assignedTo = cleanAssignedTo ? String(cleanAssignedTo) : null;
    dbLeadsStore[storeIdx].assigned_to = cleanAssignedTo ? String(cleanAssignedTo) : null;
    dbLeadsStore[storeIdx].assignedTelecallerId = cleanAssignedTo ? String(cleanAssignedTo) : null;
    dbLeadsStore[storeIdx].assigneeName = finalAssigneeName;
    dbLeadsStore[storeIdx].status = finalStatus;
    dbLeadsStore[storeIdx].assignmentStatus = cleanAssignedTo ? 'ASSIGNED' : 'UNASSIGNED';
    dbLeadsStore[storeIdx].updatedAt = new Date().toISOString();
  }

  lead.assignedTo = cleanAssignedTo ? String(cleanAssignedTo) : null;
  lead.assigned_to = cleanAssignedTo ? String(cleanAssignedTo) : null;
  lead.assignedTelecallerId = cleanAssignedTo ? String(cleanAssignedTo) : null;
  lead.assigneeName = finalAssigneeName;
  lead.status = finalStatus;
  lead.assignmentStatus = cleanAssignedTo ? 'ASSIGNED' : 'UNASSIGNED';
  lead.updatedAt = new Date().toISOString();

  emitRealtimeEvent('lead:assigned', lead);
  emitRealtimeEvent('lead:updated', lead);

  if (lead.assignedTo) {
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
      }).catch(() => {});
    }
  }

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


router.put('/leads/:id', async (req, res) => {
  const leadId = req.params.id;
  const currentRole = String(req.user?.role || req.headers['x-user-role'] || '').toUpperCase();
  const currentUserId = req.user?.id ? String(req.user.id) : (req.headers['x-user-id'] ? String(req.headers['x-user-id']) : null);
  const currentUserEmail = (req.user?.email || req.headers['x-user-email'] || '').toLowerCase().trim();
  const currentUserName = (req.user?.fullName || req.headers['x-user-name'] || '').toLowerCase().trim();

  let lead = null;
  if (dbPool) {
    try {
      const [rows] = await dbPool.query(
        `SELECT l.*, c.full_name as creator_full_name, c.email as creator_user_email, u.full_name as assignee_full_name
         FROM leads l
         LEFT JOIN users c ON l.creator_id = c.id
         LEFT JOIN users u ON l.assigned_to = u.id
         WHERE l.id = ?`,
        [leadId]
      );
      if (rows && rows.length > 0) {
        lead = rows[0];
      }
    } catch (e) {
      console.error('[MySQL Error] Fetch lead for edit failed:', e.message);
    }
  }
  if (!lead) {
    lead = dbLeadsStore.find((l) => String(l.id) === String(leadId));
  }

  if (!lead) {
    return res.status(404).json({ error: 'Lead not found.' });
  }


  const leadCreatorId = lead.creator_id !== undefined ? String(lead.creator_id) : (lead.creatorId !== undefined ? String(lead.creatorId) : '');
  const leadCreatorEmail = (lead.creator_user_email || lead.creator_email || lead.creatorEmail || '').toLowerCase().trim();
  const leadCreatorName = (lead.creator_full_name || lead.creator_name || lead.creatorName || '').toLowerCase().trim();

  const isCreator = Boolean(
    (currentUserId && leadCreatorId && String(currentUserId) === String(leadCreatorId)) ||
    (currentUserEmail && leadCreatorEmail && currentUserEmail === leadCreatorEmail) ||
    (currentUserName && leadCreatorName && currentUserName === leadCreatorName) ||
    (currentRole === 'ADMINISTRATOR')
  );

  if (!isCreator) {
    return res.status(403).json({ error: 'Access Denied: Only the creator who created this lead can edit it.' });
  }

  const { firstName, lastName, email, phone, source, status, campaignName, assignedTo, assigneeName } = req.body;
  const updatedFirstName = firstName !== undefined ? String(firstName).trim() : (lead.first_name || lead.firstName);
  const updatedLastName = lastName !== undefined ? String(lastName).trim() : (lead.last_name || lead.lastName || '');
  const updatedEmail = email !== undefined ? String(email).trim() : (lead.email || '');
  const updatedPhone = phone !== undefined ? String(phone).trim() : (lead.phone || '');
  const updatedSource = source !== undefined ? String(source).trim() : (lead.source || 'Manual');
  const updatedStatus = status !== undefined ? String(status).trim() : (lead.status || 'NEW');
  const updatedCampName = campaignName !== undefined ? String(campaignName).trim() : (lead.campaign_name || lead.campaignName || '');
  const updatedAssignedTo = assignedTo !== undefined ? (assignedTo ? parseInt(String(assignedTo).replace(/\D/g, ''), 10) || null : null) : (lead.assigned_to || null);
  let updatedAssigneeName = assigneeName !== undefined ? String(assigneeName).trim() : (lead.assignee_full_name || lead.assigneeName || 'Unassigned');
  if (!updatedAssignedTo) updatedAssigneeName = 'Unassigned';

  if (dbPool) {
    try {
      await dbPool.query(
        `UPDATE leads
         SET first_name = ?, last_name = ?, email = ?, phone = ?, source = ?, status = ?, campaign_name = ?,
             assigned_to = ?, assigned_telecaller_id = ?, assignment_status = ?, updated_at = NOW()
         WHERE id = ?`,
        [
          updatedFirstName, updatedLastName, updatedEmail, updatedPhone, updatedSource, updatedStatus,
          updatedCampName, updatedAssignedTo, updatedAssignedTo, updatedAssignedTo ? 'ASSIGNED' : 'UNASSIGNED', leadId,
        ]
      );
    } catch (dbErr) {
      console.error('[MySQL Error] Update lead failed:', dbErr.message);
    }
  }

  const updatedObj = {
    id: leadId,
    firstName: updatedFirstName,
    lastName: updatedLastName,
    email: updatedEmail,
    phone: updatedPhone,
    source: updatedSource,
    status: updatedStatus,
    assignedTelecallerId: updatedAssignedTo ? String(updatedAssignedTo) : null,
    assignmentStatus: updatedAssignedTo ? 'ASSIGNED' : 'UNASSIGNED',
    campaignId: lead.campaign_id || lead.campaignId || 'cmp_default',
    campaignName: updatedCampName,
    assignedTo: updatedAssignedTo,
    assigneeName: updatedAssigneeName,
    creatorId: leadCreatorId,
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
    actorId: currentUserId || 'usr_unknown',
    actorEmail: currentUserEmail || 'unknown@markops.io',
    action: 'LEAD_UPDATED',
    entityType: 'Lead',
    entityId: String(leadId),
    newState: updatedObj,
    ipAddress: req.ip || req.socket?.remoteAddress,
  });

  return res.json({ success: true, lead: updatedObj });
});


router.delete('/leads/:id', async (req, res) => {
  const leadId = req.params.id;
  const currentRole = String(req.user?.role || req.headers['x-user-role'] || '').toUpperCase();
  const currentUserId = req.user?.id ? String(req.user.id) : (req.headers['x-user-id'] ? String(req.headers['x-user-id']) : null);
  const currentUserEmail = (req.user?.email || req.headers['x-user-email'] || '').toLowerCase().trim();
  const currentUserName = (req.user?.fullName || req.headers['x-user-name'] || '').toLowerCase().trim();

  let lead = null;
  if (dbPool) {
    try {
      const [rows] = await dbPool.query(
        `SELECT l.*, c.full_name as creator_full_name, c.email as creator_user_email
         FROM leads l
         LEFT JOIN users c ON l.creator_id = c.id
         WHERE l.id = ?`,
        [leadId]
      );
      if (rows && rows.length > 0) {
        lead = rows[0];
      }
    } catch (e) {
      console.error('[MySQL Error] Fetch lead for delete failed:', e.message);
    }
  }
  if (!lead) {
    lead = dbLeadsStore.find((l) => String(l.id) === String(leadId));
  }

  if (!lead) {
    return res.status(404).json({ error: 'Lead not found.' });
  }


  const leadCreatorId = lead.creator_id !== undefined ? String(lead.creator_id) : (lead.creatorId !== undefined ? String(lead.creatorId) : '');
  const leadCreatorEmail = (lead.creator_user_email || lead.creator_email || lead.creatorEmail || '').toLowerCase().trim();
  const leadCreatorName = (lead.creator_full_name || lead.creator_name || lead.creatorName || '').toLowerCase().trim();

  const isCreator = Boolean(
    (currentUserId && leadCreatorId && String(currentUserId) === String(leadCreatorId)) ||
    (currentUserEmail && leadCreatorEmail && currentUserEmail === leadCreatorEmail) ||
    (currentUserName && leadCreatorName && currentUserName === leadCreatorName) ||
    (currentRole === 'ADMINISTRATOR')
  );

  if (!isCreator) {
    return res.status(403).json({ error: 'Access Denied: Only the creator who created this lead can delete it.' });
  }

  if (dbPool) {
    try {
      await dbPool.query(`DELETE FROM follow_ups WHERE lead_id = ?`, [leadId]).catch(() => {});
      await dbPool.query(`DELETE FROM call_activities WHERE lead_id = ?`, [leadId]).catch(() => {});
      await dbPool.query(`DELETE FROM leads WHERE id = ?`, [leadId]);
    } catch (dbErr) {
      console.error('[MySQL Error] Delete lead failed:', dbErr.message);
    }
  }

  const storeIdx = dbLeadsStore.findIndex((l) => String(l.id) === String(leadId));
  if (storeIdx !== -1) {
    dbLeadsStore.splice(storeIdx, 1);
  }

  emitRealtimeEvent('lead:deleted', { leadId: String(leadId) });
  await recordAuditLog(dbPool, {
    actorId: currentUserId || 'usr_unknown',
    actorEmail: currentUserEmail || 'unknown@markops.io',
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
      if (Array.isArray(rows) && rows.length > 0) {
        const mapped = rows.map((r) => ({
          id: `call_${r.id}`,
          leadId: String(r.lead_id),
          leadPhone: r.lead_phone || '',
          leadName: `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Lead Customer',
          telecallerId: String(r.telecaller_id),
          telecallerName: r.telecaller_name || 'Telecaller',
          telecallerEmail: r.telecaller_email || '',
          outcome: r.outcome,
          durationSeconds: r.duration_seconds || 0,
          remarks: r.remarks || '',
          nextAction: r.next_action || '',
          calledAt: r.called_at ? new Date(r.called_at).toISOString() : new Date().toISOString(),
        }));
        mapped.forEach((m) => {
          if (!dbCallActivitiesStore.some((c) => String(c.id) === String(m.id) || (String(c.leadId) === String(m.leadId) && c.calledAt === m.calledAt))) {
            dbCallActivitiesStore.push(m);
          }
        });
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

router.post('/calls', async (req, res) => {
  const { leadId, leadPhone, phone, leadName, firstName, lastName, outcome, durationSeconds, remarks, nextAction, followUpDate, followUpTime, telecallerId, telecallerName, telecallerEmail } = req.body;
  const rawLeadId = String(leadId || '').trim();
  const rawPhone = String(leadPhone || phone || '').replace(/\D/g, '');
  const rawName = String(leadName || `${firstName || ''} ${lastName || ''}` || '').trim().toLowerCase();

  const outcomeUpper = String(outcome || 'CONNECTED').toUpperCase().replace(/\s+/g, '_');
  let newStatus = outcomeUpper === 'BUSY' ? 'LINE_BUSY' : outcomeUpper;

  let lead = null;
  const numId = parseInt(rawLeadId, 10);

  if (dbPool) {
    try {
      if (!isNaN(numId)) {
        await dbPool.query('UPDATE leads SET status = ?, updated_at = NOW() WHERE id = ?', [newStatus, numId]);
      } else if (rawPhone) {
        await dbPool.query('UPDATE leads SET status = ?, updated_at = NOW() WHERE phone LIKE ?', [newStatus, `%${rawPhone}%`]);
      }

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
      if (!isNaN(numId)) {
        fetchSql += ' WHERE l.id = ?';
        params = [numId];
      } else if (rawPhone) {
        fetchSql += ' WHERE l.phone LIKE ?';
        params = [`%${rawPhone}%`];
      }

      if (params.length > 0) {
        const [rows] = await dbPool.query(fetchSql, params);
        if (Array.isArray(rows) && rows.length > 0) {
          const row = rows[0];
          lead = {
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
      }
    } catch (e) {
      console.error('[MySQL Error] Failed to update and fetch lead in POST /calls:', e?.message || e);
    }
  }

  if (!lead) {
    lead = dbLeadsStore.find((l) => String(l.id).trim() === rawLeadId);
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
    } else if (rawLeadId || rawName || rawPhone) {
      lead = {
        id: rawLeadId || `lead_${Math.random().toString(36).substring(2, 10)}`,
        firstName: firstName || (leadName ? leadName.split(' ')[0] : 'Lead'),
        lastName: lastName || (leadName ? leadName.split(' ').slice(1).join(' ') : 'Customer'),
        phone: leadPhone || phone || '+91 9800000000',
        source: 'Digital Ads Lead Form',
        campaignId: 'cmp_default',
        campaignName: 'Digital Ad Campaign',
        status: newStatus,
        remarks: remarks || 'Call logged.',
        notes: remarks || 'Call logged.',
        assignedTo: telecallerId || null,
        assigneeName: telecallerName || 'Assigned Telecaller',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      dbLeadsStore.unshift(lead);
    }
  }

  const effectiveCallerId = telecallerId || req.headers['x-user-id'] || 'usr_admin_01';
  const effectiveCallerName = telecallerName || req.headers['x-user-name'] || 'System User';

  const newCall = {
    id: `call_${Math.random().toString(36).substring(2, 10)}`,
    leadId: lead ? lead.id : rawLeadId,
    leadPhone: lead ? lead.phone : (leadPhone || phone || ''),
    leadName: lead ? `${lead.firstName} ${lead.lastName || ''}`.trim() : (req.body.leadName || 'Lead Customer'),
    telecallerId: effectiveCallerId,
    telecallerName: effectiveCallerName,
    telecallerEmail: telecallerEmail || req.headers['x-user-email'] || '',
    outcome: outcomeUpper,
    durationSeconds: Number(durationSeconds) || 120,
    remarks: remarks || 'Call logged.',
    nextAction: nextAction || 'Follow up as required',
    followUpDate: followUpDate || '',
    followUpTime: followUpTime || '',
    calledAt: new Date().toISOString(),
  };

  dbCallActivitiesStore.unshift(newCall);

  if (dbPool) {
    try {
      const numLeadId = parseInt(String(newCall.leadId).replace(/\D/g, ''), 10);
      const numCallerId = parseInt(String(effectiveCallerId).replace(/\D/g, ''), 10) || 1;
      let mysqlOutcome = outcomeUpper;
      if (mysqlOutcome === 'LINE_BUSY') mysqlOutcome = 'BUSY';
      if (mysqlOutcome === 'FOLLOW_UP') mysqlOutcome = 'CONNECTED';
      if (mysqlOutcome === 'CONVERTED' || mysqlOutcome === 'PAID') mysqlOutcome = 'QUALIFIED';
      if (mysqlOutcome === 'LOST') mysqlOutcome = 'NOT_INTERESTED';
      if (!['CONNECTED', 'NO_ANSWER', 'BUSY', 'WRONG_NUMBER', 'INTERESTED', 'NOT_INTERESTED', 'QUALIFIED'].includes(mysqlOutcome)) {
        mysqlOutcome = 'CONNECTED';
      }
      if (!isNaN(numLeadId)) {
        await dbPool.query(
          `INSERT INTO call_activities (lead_id, telecaller_id, outcome, duration_seconds, remarks, next_action, called_at)
           VALUES (?, ?, ?, ?, ?, ?, NOW())`,
          [numLeadId, numCallerId, mysqlOutcome, Number(durationSeconds) || 120, remarks || 'Call logged.', nextAction || '']
        );
        await dbPool.query(`UPDATE leads SET status = ?, updated_at = NOW() WHERE id = ?`, [mysqlOutcome, numLeadId]).catch(() => {});
      }
    } catch (dbErr) {
      console.log('[MySQL Error] Insert call_activities failed:', dbErr?.message || dbErr);
    }
  }

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


  const targetLeadId = newCall.leadId;
  const targetPhone = newCall.leadPhone ? String(newCall.leadPhone).replace(/\D/g, '') : '';
  dbFollowUpsStore.forEach((f) => {
    const fPhone = f.leadPhone ? String(f.leadPhone).replace(/\D/g, '') : '';
    if (f.leadId === targetLeadId || (targetPhone && fPhone && targetPhone === fPhone)) {
      if (f.status === 'PENDING') {
        f.status = 'COMPLETED';
      }
    }
  });

  if (dbPool) {
    try {
      await dbPool.query("UPDATE lead_follow_ups SET status = 'COMPLETED' WHERE (lead_id = ? OR lead_phone LIKE ?) AND status = 'PENDING'", [targetLeadId, `%${targetPhone}%`]);
    } catch (e) {
      
    }
  }

  if (followUpDate) {
    dbFollowUpsStore.unshift({
      id: `fol_${Math.random().toString(36).substring(2, 10)}`,
      leadId: newCall.leadId,
      leadName: newCall.leadName,
      leadPhone: lead ? lead.phone : (leadPhone || phone || ''),
      telecallerId: effectiveCallerId,
      telecallerName: effectiveCallerName,
      dueDate: followUpDate,
      dueTime: followUpTime || '10:00',
      status: 'PENDING',
      notes: remarks,
      createdAt: new Date().toISOString(),
    });
  }

  await recordAuditLog(dbPool, {
    actorId: effectiveCallerId,
    actorEmail: telecallerEmail || 'telecaller@markops.io',
    action: `TELECALL_LOGGED_${outcomeUpper}`,
    entityType: 'CallActivity',
    entityId: newCall.id,
    newState: { outcome: outcomeUpper, leadId: finalLead.id, newStatus },
    ipAddress: req.ip || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'],
  });


  if (outcomeUpper === 'INTERESTED' || newStatus === 'INTERESTED') {
    const creatorTarget = (lead && lead.creatorId) ? lead.creatorId : '4';

    const leadPkg = finalLead.packageName || finalLead.package || finalLead.campaignName || 'CURRENT AFFAIRS AUGUST -2026';
    const leadProd = finalLead.productName || (leadPkg.toLowerCase().includes('class') ? 'Classmate' : (leadPkg.toLowerCase().includes('jesus') ? 'Jesus the messanger' : 'Careermate'));
    const telecallerTargetRoute = `/package-works?package=${encodeURIComponent(leadProd)}&workspace=${encodeURIComponent(leadPkg)}&dept=TELECALLING&tab=TELECALLING`;

  
    dispatchNotification({
      userIds: [creatorTarget, '4'],
      title: `Lead Interested: ${finalLead.firstName} ${finalLead.lastName || ''}`.trim(),
      message: `Lead "${finalLead.firstName} ${finalLead.lastName || ''}" (${newCall.leadPhone}) has shown interest! Handled by ${effectiveCallerName}. Campaign: ${finalLead.campaignName || 'Digital Campaign'}.`,
      type: 'SUCCESS',
      targetRoute: `/package-works?package=${encodeURIComponent(leadProd)}&workspace=${encodeURIComponent(leadPkg)}&dept=DIGITAL_MARKETING&tab=LEADS`,
    }).catch(() => {});

   
    dispatchNotification({
      userIds: [effectiveCallerId],
      title: 'Lead Marked as Interested',
      message: `You marked "${finalLead.firstName} ${finalLead.lastName || ''}" as Interested. Great job!`,
      type: 'SUCCESS',
      targetRoute: telecallerTargetRoute,
    }).catch(() => {});
  }

 
  if (outcomeUpper === 'QUALIFIED' || newStatus === 'QUALIFIED') {
    const creatorTarget = (lead && lead.creatorId) ? lead.creatorId : '4';
    const leadPkg = finalLead.packageName || finalLead.package || finalLead.campaignName || 'CURRENT AFFAIRS AUGUST -2026';
    const leadProd = finalLead.productName || (leadPkg.toLowerCase().includes('class') ? 'Classmate' : (leadPkg.toLowerCase().includes('jesus') ? 'Jesus the messanger' : 'Careermate'));
    const telecallerTargetRoute = `/package-works?package=${encodeURIComponent(leadProd)}&workspace=${encodeURIComponent(leadPkg)}&dept=TELECALLING&tab=TELECALLING`;

    
    dispatchNotification({
      userIds: [creatorTarget, '4'],
      title: `Lead Qualified: ${finalLead.firstName} ${finalLead.lastName || ''}`.trim(),
      message: `High-value lead "${finalLead.firstName} ${finalLead.lastName || ''}" (${newCall.leadPhone}) has been qualified by ${effectiveCallerName}! Ready for package conversion.`,
      type: 'SUCCESS',
      targetRoute: `/package-works?package=${encodeURIComponent(leadProd)}&workspace=${encodeURIComponent(leadPkg)}&dept=DIGITAL_MARKETING&tab=LEADS`,
    }).catch(() => {});

  
    dispatchNotification({
      userIds: ['2'],
      title: `New Qualified Lead: ${finalLead.firstName} ${finalLead.lastName || ''}`.trim(),
      message: `Lead "${finalLead.firstName} ${finalLead.lastName || ''}" was qualified by ${effectiveCallerName}. Ready for package proposal and deal closure.`,
      type: 'SUCCESS',
      targetRoute: `/package-works?package=${encodeURIComponent(leadProd)}&workspace=${encodeURIComponent(leadPkg)}&dept=ANALYTICS&tab=REPORTS`,
    }).catch(() => {});

   
    dispatchNotification({
      userIds: [effectiveCallerId],
      title: 'Lead Qualified!',
      message: `Lead "${finalLead.firstName} ${finalLead.lastName || ''}" has been successfully qualified! Target milestone progressed.`,
      type: 'SUCCESS',
      targetRoute: telecallerTargetRoute,
    }).catch(() => {});
  }

 
  try {
    const todayDateStr = new Date().toISOString().split('T')[0];
    const callerIdStr = String(effectiveCallerId).toLowerCase();
    const todayCallerCalls = dbCallActivitiesStore.filter((c) => {
      const isCaller = String(c.telecallerId || '').toLowerCase() === callerIdStr || (c.telecallerName && c.telecallerName === effectiveCallerName);
      const isToday = c.calledAt && c.calledAt.startsWith(todayDateStr);
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

    const isAchieved = todayCallsCount >= targetCalls || todayInterestedCount >= targetInterested;
    if (isAchieved) {
      const alreadyNotified = dbNotificationsStore.some(
        (n) =>
          String(n.userId).toLowerCase() === callerIdStr &&
          n.title &&
          n.title.toLowerCase().includes('target achieved') &&
          n.createdAt &&
          n.createdAt.startsWith(todayDateStr)
      );

      if (!alreadyNotified) {
    
        dispatchNotification({
          userIds: [effectiveCallerId],
          title: 'Target Achieved! Congratulations!',
          message: `Outstanding work, ${effectiveCallerName}! You have successfully achieved your daily target today (${todayCallsCount}/${targetCalls} unique leads called, ${todayInterestedCount}/${targetInterested} interested leads).`,
          type: 'SUCCESS',
          targetRoute: '/package-works?package=CAREERMATE&workspace=CURRENT-AFFAIR-PACKAGE&dept=TELECALLING&tab=TELECALLER_MEMBERS',
        }).catch(() => {});

     
        dispatchNotification({
          userIds: ['4', '1', '2', '3'],
          title: `Telecaller Target Achieved: ${effectiveCallerName}`,
          message: `${effectiveCallerName} has reached their daily target today with ${todayCallsCount} unique leads called and ${todayInterestedCount} interested/qualified leads!`,
          type: 'SUCCESS',
          targetRoute: '/package-works?package=CAREERMATE&workspace=CURRENT-AFFAIR-PACKAGE&dept=TELECALLING&tab=TELECALLER_MEMBERS',
        }).catch(() => {});
      }
    }
  } catch (targetErr) {
    console.error('Target achievement evaluation notice:', targetErr?.message || targetErr);
  }

  return res.status(201).json({ call: newCall, lead: finalLead });
});


router.patch('/leads/:id/status', async (req, res) => {
  const { status, actorId, actorName, actorEmail } = req.body;
  const leadId = String(req.params.id).trim();

  let lead = null;
  if (dbPool) {
    try {
      const [rows] = await dbPool.query(
        `SELECT l.*, 
                c.full_name as creator_full_name, 
                c.email as creator_user_email,
                u.full_name as assignee_full_name,
                u.email as assignee_user_email
         FROM leads l
         LEFT JOIN users c ON l.creator_id = c.id
         LEFT JOIN users u ON l.assigned_to = u.id
         WHERE l.id = ?`,
        [leadId]
      );
      if (rows && rows.length > 0) {
        const row = rows[0];
        lead = {
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
          createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
          updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
        };
      }
    } catch (e) {
      console.error('[MySQL Error] Fetch lead for status update failed:', e.message);
    }
  }

  if (!lead) {
    lead = dbLeadsStore.find((l) => String(l.id).trim() === leadId);
  }

  if (!lead) return res.status(404).json({ error: `Lead #${leadId} not found.` });

  const previousStatus = lead.status;
  const newStatus = String(status || '').toUpperCase().trim();
  lead.status = newStatus;
  lead.updatedAt = new Date().toISOString();

  if (dbPool) {
    try {
      const numId = parseInt(leadId, 10);
      if (!isNaN(numId)) {
        await dbPool.query('UPDATE leads SET status = ?, updated_at = NOW() WHERE id = ?', [newStatus, numId]);
      }
    } catch (e) {
      console.error('[MySQL Error] Failed to update lead status:', e?.message || e);
    }
  }

  emitRealtimeEvent('lead:status_changed', { leadId: lead.id, status: newStatus });
  emitRealtimeEvent('lead:updated', lead);

  const effectiveActorName = actorName || req.headers['x-user-name'] || lead.assigneeName || 'Telecaller';
  const effectiveActorId = actorId || req.headers['x-user-id'] || lead.assignedTo || '6';


  const leadPkg = lead.packageName || lead.package || lead.campaignName || 'CURRENT AFFAIRS AUGUST -2026';
  const leadProd = lead.productName || (leadPkg.toLowerCase().includes('class') ? 'Classmate' : (leadPkg.toLowerCase().includes('jesus') ? 'Jesus the messanger' : 'Careermate'));
  const telecallerTargetRoute = `/package-works?package=${encodeURIComponent(leadProd)}&workspace=${encodeURIComponent(leadPkg)}&dept=TELECALLING&tab=TELECALLING`;

  if (newStatus === 'INTERESTED') {
    const creatorTarget = lead.creatorId || '4';
    dispatchNotification({
      userIds: [creatorTarget, '4'],
      title: `Lead Interested: ${lead.firstName} ${lead.lastName || ''}`.trim(),
      message: `Lead "${lead.firstName} ${lead.lastName || ''}" has shown interest! Handled by ${effectiveActorName}. Campaign: ${lead.campaignName || 'Digital Campaign'}.`,
      type: 'SUCCESS',
      targetRoute: `/package-works?package=${encodeURIComponent(leadProd)}&workspace=${encodeURIComponent(leadPkg)}&dept=DIGITAL_MARKETING&tab=LEADS`,
    }).catch(() => {});

    if (lead.assignedTo) {
      dispatchNotification({
        userIds: [lead.assignedTo],
        title: 'Lead Marked as Interested',
        message: `You marked "${lead.firstName} ${lead.lastName || ''}" as Interested. Great job!`,
        type: 'SUCCESS',
        targetRoute: telecallerTargetRoute,
      }).catch(() => {});
    }
  } else if (newStatus === 'QUALIFIED') {
    const creatorTarget = lead.creatorId || '4';
    dispatchNotification({
      userIds: [creatorTarget, '4'],
      title: `Lead Qualified: ${lead.firstName} ${lead.lastName || ''}`.trim(),
      message: `High-value lead "${lead.firstName} ${lead.lastName || ''}" has been qualified by ${effectiveActorName}! Ready for package conversion.`,
      type: 'SUCCESS',
      targetRoute: `/package-works?package=${encodeURIComponent(leadProd)}&workspace=${encodeURIComponent(leadPkg)}&dept=DIGITAL_MARKETING&tab=LEADS`,
    }).catch(() => {});

    dispatchNotification({
      userIds: ['2'],
      title: `New Qualified Lead for Conversion: ${lead.firstName} ${lead.lastName || ''}`.trim(),
      message: `Lead "${lead.firstName} ${lead.lastName || ''}" was qualified by ${effectiveActorName}. Ready for package conversion.`,
      type: 'SUCCESS',
      targetRoute: `/package-works?package=${encodeURIComponent(leadProd)}&workspace=${encodeURIComponent(leadPkg)}&dept=ANALYTICS&tab=REPORTS`,
    }).catch(() => {});

    if (lead.assignedTo) {
      dispatchNotification({
        userIds: [lead.assignedTo],
        title: 'Lead Qualified!',
        message: `Lead "${lead.firstName} ${lead.lastName || ''}" has been successfully qualified! Target milestone progressed.`,
        type: 'SUCCESS',
        targetRoute: telecallerTargetRoute,
      }).catch(() => {});
    }
  }

  return res.json(lead);
});

router.get('/followups', (req, res) => {
  return res.json(dbFollowUpsStore);
});


async function handleBatchImport(req, res, { metaWebhook = false } = {}) {
  const { leads, selectedTelecallerIds, campaignId, campaignName, source, uploaderId, uploaderEmail, uploaderRole } = req.body;
  const effectiveRole = String(req.user?.role || req.headers['x-user-role'] || uploaderRole || '').toUpperCase();
  const uploadRoles = ['ADMINISTRATOR', 'MARKETING_MANAGER', 'DIGITAL_MARKETING'];

  if (!metaWebhook && !uploadRoles.includes(effectiveRole)) {
    return res.status(403).json({
      error: 'Access Denied: Lead file uploads are restricted to Digital Marketing, Marketing Manager, and Administrator roles.',
    });
  }

  if (!Array.isArray(leads) || leads.length === 0) {
    return res.status(400).json({ error: 'No lead array provided in request payload.' });
  }


  for (let i = 0; i < leads.length; i++) {
    const raw = leads[i];
    const fullName = String(raw.fullName || raw.leadName || raw['Full Name'] || raw['Lead Name'] || raw['Name'] || '').trim();
    const fName = String(raw.firstName || raw['First Name'] || raw['first_name'] || fullName.split(/\s+/)[0] || '').trim();
    const contactInfo = String(raw.contactInfo || raw['Contact Info'] || '').trim();
    const contactEmail = contactInfo.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '';
    const contactPhone = contactInfo
      .replace(contactEmail, '')
      .replace(/(?:phone|mobile|tel)\s*[:=-]?\s*/i, '')
      .trim();
    const ph = String(raw.phone || raw['Phone'] || raw['Phone Number'] || raw['Mobile'] || raw['Mobile Number'] || raw['Contact Number'] || raw['Contact'] || contactPhone).trim();

    if (!fName || !ph) {
      return res.status(400).json({
        error: `Validation Error on row #${i + 1}: A lead name and phone number are required.`,
      });
    }
  }

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
    telecallers = telecallerRows.map((user) => ({
      ...user,
      id: String(user.id),
      role: 'TELECALLER',
      isActive: true,
    }));
  } else if (!metaWebhook && dbPool?.isConnected()) {
    const [telecallerRows] = await dbPool.queryStrict(
      `SELECT u.id, u.full_name AS fullName, u.email
       FROM users u
       INNER JOIN roles r ON r.id = u.role_id
       WHERE r.code = 'TELECALLER' AND u.is_active = 1
       ORDER BY u.id ASC`
    );
    telecallers = telecallerRows.map((user) => ({
      ...user,
      id: String(user.id),
      role: 'TELECALLER',
      isActive: true,
    }));
  } else if (!metaWebhook) {
    telecallers = dbUsersStore.filter(
      (user) => String(user.role).toUpperCase() === 'TELECALLER' && user.isActive !== false
    );
  }


  if (metaWebhook && Array.isArray(req.body.telecallersList) && req.body.telecallersList.length > 0) {
    req.body.telecallersList.forEach((reqTc) => {
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
    return res.status(409).json({
      error: 'No active telecallers are available. Activate at least one telecaller before uploading leads.',
    });
  }


  let mysqlCampaignId = null;
  const targetCampName = campaignName || 'Digital Ad Campaign';
  if (dbPool) {
    try {
      const metaCampaignId = metaWebhook ? leads[0].metaCampaignId : null;
      const [campaignRows] = metaWebhook && metaCampaignId
        ? await dbPool.queryStrict(`SELECT id FROM campaigns WHERE meta_campaign_id = ? LIMIT 1`, [metaCampaignId])
        : await dbPool.query(`SELECT id FROM campaigns WHERE name = ? LIMIT 1`, [targetCampName]);
      if (campaignRows && campaignRows.length > 0) {
        mysqlCampaignId = campaignRows[0].id;
      } else {
        const [firstCmp] = await dbPool.query(`SELECT id FROM campaigns LIMIT 1`);
        mysqlCampaignId = firstCmp?.[0]?.id || null;
      }
    } catch (dbErr) {
      if (metaWebhook) throw dbErr;
      console.log('[MySQL LookUp Notice] Failed to find campaign reference during lead processing:', dbErr.message);
    }
  }

  const createdLeads = [];
  const allocationSummary = {};
  telecallers.forEach((tc) => {
    allocationSummary[tc.id] = { id: tc.id, fullName: tc.fullName, email: tc.email, count: 0 };
  });

 
  for (let i = 0; i < leads.length; i++) {
    const raw = leads[i];
    const assignedTelecaller = telecallers.length > 0 ? telecallers[i % telecallers.length] : null;

    const fullName = String(raw.fullName || raw.leadName || raw['Full Name'] || raw['Lead Name'] || raw['Name'] || '').trim();
    const fullNameParts = fullName.split(/\s+/).filter(Boolean);
    const firstName = String(raw.firstName || raw['First Name'] || raw['first_name'] || fullNameParts.shift() || `Lead ${i + 1}`).trim();
    const lastName = String(raw.lastName || raw['Last Name'] || raw['last_name'] || fullNameParts.join(' ')).trim();
    const email = String(raw.email || raw['Email'] || raw['email_address'] || '').trim();
    const contactInfo = String(raw.contactInfo || raw['Contact Info'] || '').trim();
    const contactEmail = contactInfo.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '';
    const contactPhone = contactInfo
      .replace(contactEmail, '')
      .replace(/(?:phone|mobile|tel)\s*[:=-]?\s*/i, '')
      .trim();
    const phone = String(raw.phone || raw['Phone'] || raw['Phone Number'] || raw['Mobile'] || raw['Mobile Number'] || raw['Contact Number'] || raw['Contact'] || contactPhone).trim();
    const emailAddress = email || contactEmail;
    const rowCampaignName = String(raw.campaignName || raw['Campaign'] || targetCampName).trim();
    const rowCampaignId = raw.campaignId || campaignId || 'cmp_default';

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


    const cleanAssignedToId = assignedTelecaller ? (parseInt(String(assignedTelecaller.id).replace(/\D/g, ''), 10) || null) : null;
    const cleanCreatorId = parseInt(String(uploaderUid || '1').replace(/\D/g, ''), 10) || 1;

    const targetPkgName = req.body.packageName || raw.packageName || raw.package || targetCampName || 'Careermate';
    const targetProdName = req.body.productName || raw.productName || raw.product || '';
    const targetProdId = req.body.productId || raw.productId || raw.product_id || '';

    const newLead = {
      id: `lead_${Math.random().toString(36).substring(2, 10)}`,
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
  
      _mysqlCampaignId: metaWebhook
        ? mysqlCampaignId
        : (parseInt(String(rowCampaignId), 10) || mysqlCampaignId),
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

  if (dbPool && (metaWebhook || dbPool.isConnected())) {
    let importConnection = null;
    try {
      if (metaWebhook && createdLeads[0].metaAdId) {
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
          const [result] = await dbPool.queryStrict(
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
          return res.status(200).json({ success: true, duplicate: true });
        }
        throw e;
      }
      createdLeads.forEach((lead) => {
        const storedIndex = dbLeadsStore.indexOf(lead);
        if (storedIndex !== -1) dbLeadsStore.splice(storedIndex, 1);
      });
      throw e;
    } finally {
      if (importConnection) importConnection.release();
    }
  } else if (metaWebhook) {
    const duplicate = dbLeadsStore.some((lead) => lead.metaLeadId === createdLeads[0].metaLeadId);
    if (duplicate) {
      dbLeadsStore.splice(dbLeadsStore.indexOf(createdLeads[0]), 1);
      return res.status(200).json({ success: true, duplicate: true });
    }
  }


  emitRealtimeEvent('leads:batch_imported', { total: createdLeads.length, allocationSummary });

  const creator = req.body.creatorName || req.body.uploaderEmail || 'System Administrator';
  const pkg = req.body.packageName || campaignName || 'CURRENT AFFAIRS AUGUST -2026';
  const prod = req.body.productName || (pkg.toLowerCase().includes('class') ? 'Classmate' : (pkg.toLowerCase().includes('jesus') ? 'Jesus Messenger' : 'Careermate'));

  Object.values(allocationSummary).forEach((summary) => {
    if (summary && summary.id && summary.count > 0) {
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

  await recordAuditLog(dbPool, {
    actorId: uploaderId || req.headers['x-user-id'] || 'usr_digital_01',
    actorEmail: uploaderEmail || 'digital@markops.io',
    action: metaWebhook ? 'META_LEAD_RECEIVED' : 'LEADS_EXCEL_BATCH_UPLOAD',
    entityType: 'LeadBatch',
    entityId: `batch_${Date.now()}`,
    newState: { totalUploaded: createdLeads.length, telecallersCount: telecallers.length, allocationSummary },
    ipAddress: req.ip || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'],
  });

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

router.post('/leads/batch-import', async (req, res) => {
  return handleBatchImport(req, res);
});

router.get('/leads/telecalling-summary', async (req, res) => {
  const currentRole = String(req.user?.role || req.headers['x-user-role'] || '').toUpperCase();
  const currentUserId = req.user?.id ? String(req.user.id) : (req.headers['x-user-id'] ? String(req.headers['x-user-id']) : null);
  const isTelecallerRole = currentRole === 'TELECALLER';

  let allLeads = [];
  let allUsers = [];

  if (dbPool) {
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
    } catch (e) {
      console.log('[telecalling-summary MySQL Error]:', e?.message || e);
    }
  }

  if (allLeads.length === 0) {
    allLeads = dbLeadsStore;
  }
  if (allUsers.length === 0) {
    allUsers = dbUsersStore;
  }


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

  let allCalls = [...dbCallActivitiesStore];
  if (dbPool) {
    try {
      const [callRows] = await dbPool.query(`
        SELECT id, lead_id as leadId, telecaller_id as telecallerId, outcome, duration_seconds as durationSeconds, remarks, called_at as calledAt
        FROM call_activities
      `);
      if (Array.isArray(callRows) && callRows.length > 0) {
        allCalls = callRows;
      }
    } catch (ce) {}
  }

 
  const telecallers = allUsers.filter((u) => u.role === 'TELECALLER' && u.isActive !== false);

  const telecallerMetrics = telecallers.map((tc) => {
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

  
    const uniqueLeadsCalled = new Set(
      calls
        .map((c) => String(c.leadId || c.leadPhone || c.leadName || '').trim().toLowerCase())
        .filter((k) => !!k)
    );
    const uniqueAttendedLeads = new Set(
      attendedCalls
        .map((c) => String(c.leadId || c.leadPhone || c.leadName || '').trim().toLowerCase())
        .filter((k) => !!k)
    );
    const uniqueNotAttendedLeads = new Set(
      notAttendedCalls
        .map((c) => String(c.leadId || c.leadPhone || c.leadName || '').trim().toLowerCase())
        .filter((k) => !!k)
    );
    const uniqueInterestedLeads = new Set(
      interestedCalls
        .map((c) => String(c.leadId || c.leadPhone || c.leadName || '').trim().toLowerCase())
        .filter((k) => !!k)
    );
    const uniqueNotInterestedLeads = new Set(
      notInterestedCalls
        .map((c) => String(c.leadId || c.leadPhone || c.leadName || '').trim().toLowerCase())
        .filter((k) => !!k)
    );

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
  });

  return res.json({
    totalLeads,
    assignedLeads,
    unassignedLeads,
    totalCallsLogged: allCalls.length,
    statusBreakdown,
    telecallerMetrics,
  });
});


router.get('/telecaller-targets/common', (req, res) => {
  return res.json(dbCommonTargetStore);
});


router.post('/telecaller-targets/common', (req, res) => {
  const { dailyCallsTarget, dailyInterestedTarget, dailyDurationTargetSeconds, updatedBy } = req.body;
  if (dailyCallsTarget !== undefined) {
    dbCommonTargetStore.dailyCallsTarget = Number(dailyCallsTarget) || 30;
  }
  if (dailyInterestedTarget !== undefined) {
    dbCommonTargetStore.dailyInterestedTarget = Number(dailyInterestedTarget) || 5;
  }
  if (dailyDurationTargetSeconds !== undefined) {
    dbCommonTargetStore.dailyDurationTargetSeconds = Number(dailyDurationTargetSeconds) || 3600;
  }
  dbCommonTargetStore.updatedBy = updatedBy || 'Marketing Manager';
  dbCommonTargetStore.updatedAt = new Date().toISOString();

  emitRealtimeEvent('telecaller_target:updated', dbCommonTargetStore);
  return res.json(dbCommonTargetStore);
});


router.get('/telecaller-targets', (req, res) => {
  return res.json({
    common: dbCommonTargetStore,
    targets: dbTelecallerTargetsStore || [],
  });
});


router.post('/telecaller-targets/:telecallerId', (req, res) => {
  const { telecallerId } = req.params;
  const { dailyCallsTarget, dailyInterestedTarget, dailyDurationTargetSeconds, updatedBy, telecallerName, telecallerEmail } = req.body;

  if (!Array.isArray(dbTelecallerTargetsStore)) {
    dbTelecallerTargetsStore = [];
  }

  let target = dbTelecallerTargetsStore.find((t) => String(t.telecallerId) === String(telecallerId));
  if (!target) {
    target = {
      id: `tgt_${telecallerId}_${Date.now()}`,
      telecallerId: String(telecallerId),
      telecallerName: telecallerName || 'Telecaller',
      telecallerEmail: telecallerEmail || '',
      dailyCallsTarget: Number(dailyCallsTarget) || 30,
      dailyInterestedTarget: Number(dailyInterestedTarget) || 5,
      dailyDurationTargetSeconds: (Number(dailyCallsTarget) || 30) * 120,
      updatedBy: updatedBy || 'Marketing Manager',
      updatedAt: new Date().toISOString(),
    };
    dbTelecallerTargetsStore.push(target);
  } else {
    if (dailyCallsTarget !== undefined) target.dailyCallsTarget = Number(dailyCallsTarget) || 30;
    if (dailyInterestedTarget !== undefined) target.dailyInterestedTarget = Number(dailyInterestedTarget) || 5;
    if (dailyDurationTargetSeconds !== undefined) target.dailyDurationTargetSeconds = Number(dailyDurationTargetSeconds) || (target.dailyCallsTarget * 120);
    if (telecallerName) target.telecallerName = telecallerName;
    if (telecallerEmail) target.telecallerEmail = telecallerEmail;
    target.updatedBy = updatedBy || 'Marketing Manager';
    target.updatedAt = new Date().toISOString();
  }

  emitRealtimeEvent('telecaller_target:user_updated', target);
  return res.json(target);
});

module.exports = router;
