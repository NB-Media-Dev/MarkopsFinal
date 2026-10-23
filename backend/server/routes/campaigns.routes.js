function computeCampaignMetrics(body, existing) {
  const numericSpend = body.spend !== undefined ? Number(body.spend) : existing.spend;
  const numericLeads = body.leadsCount !== undefined ? Number(body.leadsCount) : existing.leadsCount;
  const computedCpl = body.cpl !== undefined ? Number(body.cpl) : (numericLeads > 0 ? Number((numericSpend / numericLeads).toFixed(2)) : existing.cpl);
  const numericConversions = body.conversions !== undefined ? Number(body.conversions) : existing.conversions;
  const computedConvRate = body.convRate !== undefined ? Number(body.convRate) : (numericLeads > 0 ? Number(((numericConversions / numericLeads) * 100).toFixed(1)) : existing.convRate);
  return { numericSpend, numericLeads, computedCpl, numericConversions, computedConvRate };
}

function buildUpdatedCampaign(existing, body) {
  const m = computeCampaignMetrics(body, existing);
  return {
    ...existing,
    name: body.name !== undefined ? String(body.name).trim() : existing.name,
    objective: body.objective !== undefined ? String(body.objective) : existing.objective,
    status: body.status !== undefined ? String(body.status) : existing.status,
    startDate: body.startDate !== undefined ? body.startDate : existing.startDate,
    endDate: body.endDate !== undefined ? body.endDate : existing.endDate,
    budget: body.budget !== undefined ? Number(body.budget) : existing.budget,
    targetLeads: body.targetLeads !== undefined ? Number(body.targetLeads) : existing.targetLeads,
    targetCpl: body.targetCpl !== undefined ? Number(body.targetCpl) : existing.targetCpl,
    targetQualifiedPct: body.targetQualifiedPct !== undefined ? Number(body.targetQualifiedPct) : existing.targetQualifiedPct,
    targetConversionPct: body.targetConversionPct !== undefined ? Number(body.targetConversionPct) : existing.targetConversionPct,
    spend: m.numericSpend,
    leadsCount: m.numericLeads,
    cpl: m.computedCpl,
    qualifiedLeads: body.qualifiedLeads !== undefined ? Number(body.qualifiedLeads) : existing.qualifiedLeads,
    conversions: m.numericConversions,
    convRate: m.computedConvRate,
    revenue: body.revenue !== undefined ? Number(body.revenue) : existing.revenue,
    updatedAt: new Date().toISOString(),
  };
}

function computeAdMetrics(body, existing = {}) {
  const numericSpend = body.spend !== undefined ? Number(body.spend) : (existing.spend || 0);
  const numericLeads = body.leadsCount !== undefined ? Number(body.leadsCount) : (existing.leadsCount || 0);
  const computedCpl = body.cpl !== undefined && body.cpl !== null ? Number(body.cpl) : (numericLeads > 0 ? Number((numericSpend / numericLeads).toFixed(2)) : (existing.cpl || 0));
  const numericClicks = body.clicks !== undefined ? Number(body.clicks) : (existing.clicks || (numericLeads > 0 ? numericLeads * 8 : 100));
  const numericImpressions = body.impressions !== undefined ? Number(body.impressions) : (existing.impressions || (numericClicks > 0 ? numericClicks * 30 : 3000));
  const computedCtr = body.ctr !== undefined && body.ctr !== null ? Number(body.ctr) : (numericImpressions > 0 ? Number(((numericClicks / numericImpressions) * 100).toFixed(2)) : (existing.ctr || 2.5));
  const computedCpc = body.cpc !== undefined && body.cpc !== null ? Number(body.cpc) : (numericClicks > 0 ? Number((numericSpend / numericClicks).toFixed(2)) : (existing.cpc || 5.0));
  return { numericSpend, numericLeads, computedCpl, numericClicks, numericImpressions, computedCtr, computedCpc };
}

function buildNewAdObject(body, creatorId, id, matchedCampaignName, m) {
  return {
    id,
    createdBy: String(creatorId),
    name: String(body.name).trim(),
    campaignId: body.campaignId || '',
    campaignName: matchedCampaignName || 'General Digital Funnel',
    productId: body.productId || null,
    packageName: body.packageName || null,
    platform: body.platform || 'Meta',
    status: body.status || 'ACTIVE',
    spend: m.numericSpend,
    impressions: m.numericImpressions,
    reach: Math.round(m.numericImpressions * 0.72),
    clicks: m.numericClicks,
    ctr: m.computedCtr,
    cpc: m.computedCpc,
    leadsCount: m.numericLeads,
    cpl: m.computedCpl,
    platformAdId: body.platformAdId || `ad_ext_${crypto.randomInt(100000, 1000000)}`,
    designId: body.designId || null,
    designTitle: body.designTitle || null,
    designImageUrl: body.designImageUrl || null,
    lastSyncedAt: new Date().toISOString(),
  };
}

function buildUpdatedAdObject(existing, body, matchedCampaignName, m) {
  return {
    ...existing,
    name: body.name !== undefined ? String(body.name).trim() : existing.name,
    campaignId: body.campaignId !== undefined ? body.campaignId : existing.campaignId,
    campaignName: matchedCampaignName,
    platform: body.platform !== undefined ? String(body.platform) : existing.platform,
    status: body.status !== undefined ? String(body.status) : existing.status,
    spend: m.numericSpend,
    impressions: m.numericImpressions,
    reach: Math.round(m.numericImpressions * 0.72),
    clicks: m.numericClicks,
    ctr: m.computedCtr,
    cpc: m.computedCpc,
    leadsCount: m.numericLeads,
    cpl: m.computedCpl,
    designId: body.designId !== undefined ? body.designId : existing.designId,
    designTitle: body.designTitle !== undefined ? body.designTitle : existing.designTitle,
    designImageUrl: body.designImageUrl !== undefined ? body.designImageUrl : existing.designImageUrl,
    lastSyncedAt: new Date().toISOString(),
  };
}

const crypto = require('node:crypto');
const express = require('express');
const { dbPool, dbCampaignsStore, dbAdsStore, dbTasksStore } = require('../db');
const { recordAuditLog } = require('../services/audit.service');
const { emitRealtimeEvent } = require('../events');

const router = express.Router();


function mapCampaignRow(row) {
  const numericSpend = Number(row.spend) || 0;
  const numericLeads = Number(row.leads_count) || 0;
  const computedCpl = numericLeads > 0 ? Number((numericSpend / numericLeads).toFixed(2)) : Number(row.target_cpl) || 0;
  const startDateStr = row.start_date ? new Date(row.start_date).toISOString().split('T')[0] : (row.created_at ? new Date(row.created_at).toISOString().split('T')[0] : '');
  const endDateStr = row.end_date ? new Date(row.end_date).toISOString().split('T')[0] : null;

  return {
    id: String(row.id),
    name: row.name || 'Untitled Campaign',
    objective: row.objective || 'LEAD_GENERATION',
    productId: row.product_id || null,
    product_id: row.product_id || null,
    packageName: row.product_id || null,
    status: row.status || 'ACTIVE',
    startDate: startDateStr,
    start_date: startDateStr,
    endDate: endDateStr,
    end_date: endDateStr,
    budget: Number(row.budget) || 0,
    targetLeads: Number(row.target_leads) || 0,
    target_leads: Number(row.target_leads) || 0,
    targetCpl: Number(row.target_cpl) || 0,
    target_cpl: Number(row.target_cpl) || 0,
    targetQualifiedPct: Number(row.target_qualified_pct) || 0,
    target_qualified_pct: Number(row.target_qualified_pct) || 0,
    targetConversionPct: Number(row.target_conversion_pct) || 0,
    target_conversion_pct: Number(row.target_conversion_pct) || 0,
    spend: numericSpend,
    metaCampaignId: row.meta_campaign_id || null,
    clicks: Number(row.clicks) || 0,
    impressions: Number(row.impressions) || 0,
    leadsCount: numericLeads,
    leads_count: numericLeads,
    cpl: computedCpl,
    qualifiedLeads: Math.round(numericLeads * 0.6),
    conversions: Math.round(numericLeads * 0.15),
    convRate: 15,
    revenue: Math.round(numericLeads * 0.15 * 3000),
    ownerId: row.owner_id == null ? '' : String(row.owner_id),
    owner_id: row.owner_id ?? null,
    ownerName: 'Marketing Operations',
    createdAt: row.created_at ? new Date(row.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
  };
}

function requireRecordCreator(resource) {
  const isCampaign = resource === 'campaign';
  const table = isCampaign ? 'campaigns' : 'ads';
  const creatorColumn = isCampaign ? 'owner_id' : 'created_by';
  const store = isCampaign ? dbCampaignsStore : dbAdsStore;
  const creatorProperty = isCampaign ? 'ownerId' : 'createdBy';
  const label = isCampaign ? 'Campaign' : 'Ad record';

  return async (req, res, next) => {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    try {
      let creatorId;
      if (dbPool.isConnected()) {
        const [rows] = await dbPool.queryStrict(
          `SELECT ${creatorColumn} FROM ${table} WHERE id = ? LIMIT 1`,
          [req.params.id]
        );
        if (!rows.length) {
          return res.status(404).json({ error: `${label} #${req.params.id} not found.` });
        }
        creatorId = rows[0][creatorColumn];
      } else {
        const record = store.find((item) => String(item.id) === String(req.params.id));
        if (!record) {
          return res.status(404).json({ error: `${label} #${req.params.id} not found.` });
        }
        creatorId = record[creatorProperty];
      }

      if (creatorId == null || String(creatorId) !== String(req.user.id)) {
        return res.status(403).json({ error: `Only the creator can modify or delete this ${label.toLowerCase()}.` });
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}


router.get('/campaigns', async (req, res) => {
  if (dbPool) {
    try {
      const [rows] = await dbPool.query('SELECT * FROM campaigns ORDER BY id DESC');
      if (Array.isArray(rows)) {
        const mapped = rows.map(mapCampaignRow);
        dbCampaignsStore.length = 0;
        dbCampaignsStore.push(...mapped);
        return res.json(mapped);
      }
    } catch (e) {
      console.log('[MySQL Error] Fetch campaigns failed:', e.message);
    }
  }

  return res.json(dbCampaignsStore);
});


router.post('/campaigns', async (req, res) => {
  const effectiveRole = String(req.user?.role || '').toUpperCase();
  const allowedRoles = ['ADMINISTRATOR', 'MARKETING_MANAGER', 'DIGITAL_MARKETING'];

  if (effectiveRole && !allowedRoles.includes(effectiveRole)) {
    return res.status(403).json({
      error: 'Access Denied: Only Marketing Manager, Digital Marketing Specialist, and Administrator can create campaigns.',
    });
  }

  const {
    name,
    objective,
    productId,
    packageName,
    status,
    startDate,
    endDate,
    budget,
    targetLeads,
    targetCpl,
    targetQualifiedPct,
    targetConversionPct,
    spend,
    leadsCount,
    cpl,
    qualifiedLeads,
    conversions,
    convRate,
    revenue,
  } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Campaign Name is required.' });
  }

 
  const effectiveOwnerIdNumeric = Number(req.user?.id);
  if (!Number.isSafeInteger(effectiveOwnerIdNumeric) || effectiveOwnerIdNumeric < 1) {
    return res.status(401).json({ error: 'Authenticated user ID is invalid.' });
  }
  const effectiveOwnerName = req.user.fullName || 'Digital Marketer';

  const m = computeAdMetrics(req.body);

  let matchedCampaignName = campaignName;
  let mysqlCampaignId = null;

 
  if (dbPool.isConnected() && campaignId) {
    const [campaigns] = await dbPool.queryStrict(
      'SELECT id, name FROM campaigns WHERE id = ? LIMIT 1',
      [campaignId]
    );
    if (campaigns.length) {
      mysqlCampaignId = campaigns[0].id;
      matchedCampaignName = campaigns[0].name;
    } else {
      return res.status(400).json({ error: 'Selected campaign was not found.' });
    }
  }

  if (dbPool.isConnected() && !mysqlCampaignId) {
    return res.status(400).json({ error: 'A valid campaign is required to create an ad.' });
  }

  const newAd = buildNewAdObject(req.body, creatorId, id, matchedCampaignName, m);

  if (dbPool.isConnected()) {
      const [result] = await dbPool.queryStrict(
        `INSERT INTO ads (campaign_id, created_by, name, platform, status, spend, impressions, clicks, leads_count, platform_ad_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          mysqlCampaignId,     
          creatorId,
          newAd.name,              
          newAd.platform,          
          newAd.status,            
          newAd.spend,             
          newAd.impressions,       
          newAd.clicks,            
          newAd.leadsCount,        
          newAd.platformAdId       
        ]
      );
      newAd.id = String(result.insertId);
  }
  dbAdsStore.unshift(newAd);

  await recordAuditLog(dbPool, {
    actorId: String(creatorId),
    actorEmail: req.user.email || 'admin@markops.io',
    action: 'AD_CREATED',
    entityType: 'AdAccount',
    entityId: id,
    newState: { name: newAd.name, platform: newAd.platform, spend: newAd.spend },
    ipAddress: req.ip || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'],
  });

  emitRealtimeEvent('ad:created', newAd);
  return res.status(201).json(newAd);
});



router.put('/ads/:id', requireRecordCreator('ad'), async (req, res) => {
  const effectiveRole = String(req.user?.role || '').toUpperCase();
  const allowedRoles = ['ADMINISTRATOR', 'DIGITAL_MARKETING'];

  if (effectiveRole && !allowedRoles.includes(effectiveRole)) {
    return res.status(403).json({
      error: 'Access Denied: Only Digital Marketing Specialists and Administrators can modify ads or ad metrics.',
    });
  }

  const { id } = req.params;
  const index = dbAdsStore.findIndex((a) => String(a.id) === String(id));

  if (index === -1) {
    return res.status(404).json({ error: `Ad record #${id} not found.` });
  }

  const existing = dbAdsStore[index];
  const { campaignId, campaignName } = req.body;
  const m = computeAdMetrics(req.body, existing);

  let matchedCampaignName = campaignName !== undefined ? campaignName : existing.campaignName;
  if (campaignId && campaignId !== existing.campaignId && !campaignName) {
    const matched = dbCampaignsStore.find((c) => String(c.id) === String(campaignId));
    if (matched) matchedCampaignName = matched.name;
  }

  const updatedAd = buildUpdatedAdObject(existing, req.body, matchedCampaignName, m);

  if (dbPool.isConnected()) {
    const [result] = await dbPool.queryStrict(
      `UPDATE ads SET name = ?, platform = ?, status = ?, spend = ?, impressions = ?, clicks = ?, leads_count = ? WHERE id = ?`,
      [updatedAd.name, updatedAd.platform, updatedAd.status, updatedAd.spend, updatedAd.impressions, updatedAd.clicks, updatedAd.leadsCount, id]
    );
    if (!result.affectedRows) {
      return res.status(404).json({ error: `Ad record #${id} not found.` });
    }
  }
  dbAdsStore[index] = updatedAd;

  await recordAuditLog(dbPool, {
    actorId: req.headers['x-user-id'] || 'usr_admin_01',
    actorEmail: 'admin@markops.io',
    action: 'AD_UPDATED',
    entityType: 'AdAccount',
    entityId: id,
    newState: { name: updatedAd.name, status: updatedAd.status, spend: updatedAd.spend },
    ipAddress: req.ip || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'],
  });

  emitRealtimeEvent('ad:updated', updatedAd);
  return res.json(updatedAd);
});


router.delete('/ads/:id', requireRecordCreator('ad'), async (req, res) => {
  const effectiveRole = String(req.user?.role || '').toUpperCase();
  const allowedRoles = ['ADMINISTRATOR', 'DIGITAL_MARKETING'];

  if (effectiveRole && !allowedRoles.includes(effectiveRole)) {
    return res.status(403).json({
      error: 'Access Denied: Only Digital Marketing Specialists and Administrators can delete ads or ad metrics.',
    });
  }

  const { id } = req.params;
  const index = dbAdsStore.findIndex((a) => String(a.id) === String(id));
  if (index === -1) {
    return res.status(404).json({ error: `Ad record #${id} not found.` });
  }
  let deletedName = dbAdsStore[index]?.name || `Ad #${id}`;

  if (dbPool.isConnected()) {
    const [result] = await dbPool.queryStrict(`DELETE FROM ads WHERE id = ?`, [id]);
    if (!result.affectedRows) {
      return res.status(404).json({ error: `Ad record #${id} not found.` });
    }
  }
  const [deleted] = dbAdsStore.splice(index, 1);
  deletedName = deleted?.name || deletedName;

  await recordAuditLog(dbPool, {
    actorId: req.headers['x-user-id'] || 'usr_admin_01',
    actorEmail: 'admin@markops.io',
    action: 'AD_DELETED',
    entityType: 'AdAccount',
    entityId: id,
    newState: { deletedAdName: deletedName },
    ipAddress: req.ip || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'],
  });

  emitRealtimeEvent('ad:deleted', { id });
  return res.json({ success: true, message: `Ad "${deletedName}" deleted successfully.`, id });
});


router.post('/ads/sync', async (req, res) => {
  const effectiveRole = String(req.user?.role || '').toUpperCase();
  const allowedRoles = ['ADMINISTRATOR', 'DIGITAL_MARKETING'];

  if (effectiveRole && !allowedRoles.includes(effectiveRole)) {
    return res.status(403).json({
      error: 'Access Denied: Only Digital Marketing Specialists and Administrators can trigger ad synchronization.',
    });
  }
  const syncTimestamp = new Date().toISOString();
  dbAdsStore.forEach((ad) => {
    ad.lastSyncedAt = syncTimestamp;
    ad.impressions += crypto.randomInt(100, 600);
    ad.clicks += crypto.randomInt(5, 25);
    ad.reach = Math.round(ad.impressions * 0.72);
    if (ad.impressions > 0) {
      ad.ctr = Number(((ad.clicks / ad.impressions) * 100).toFixed(2));
    }
  });

  await recordAuditLog(dbPool, {
    actorId: req.headers['x-user-id'] || 'usr_admin_01',
    actorEmail: 'admin@markops.io',
    action: 'DIGITAL_ADS_SYNCED',
    entityType: 'AdAccount',
    entityId: 'act_20268841',
    newState: { recordsProcessed: dbAdsStore.length, status: 'SUCCESS' },
    ipAddress: req.ip || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'],
  });

  emitRealtimeEvent('ads:sync_completed', { syncedCount: dbAdsStore.length, timestamp: syncTimestamp });
  return res.json({ message: 'Digital Ad accounts successfully synchronized.', syncedCount: dbAdsStore.length, timestamp: syncTimestamp });
});

module.exports = router;
