const crypto = require('node:crypto');
const express = require('express');
const { dbPool, dbCampaignsStore, dbAdsStore, dbTasksStore } = require('../db');
const { recordAuditLog } = require('../services/audit.service');
const { emitRealtimeEvent } = require('../events');
const { requireRole, requireRecordCreator } = require('../middleware/auth.middleware');
const router = express.Router();

function resolveCampaignCpl(bodyCpl, spend, leads, existingCpl) {
  if (bodyCpl !== undefined && bodyCpl !== null) return Number(bodyCpl);
  if (leads > 0) return Number((spend / leads).toFixed(2));
  return existingCpl;
}

function resolveCampaignConvRate(bodyConvRate, conversions, leads, existingConvRate) {
  if (bodyConvRate !== undefined && bodyConvRate !== null) return Number(bodyConvRate);
  if (leads > 0) return Number(((conversions / leads) * 100).toFixed(1));
  return existingConvRate;
}

function computeCampaignMetrics(body, existing) {
  const numericSpend = body.spend !== undefined ? Number(body.spend) : existing.spend;
  const numericLeads = body.leadsCount !== undefined ? Number(body.leadsCount) : existing.leadsCount;
  const numericConversions = body.conversions !== undefined ? Number(body.conversions) : existing.conversions;
  const computedCpl = resolveCampaignCpl(body.cpl, numericSpend, numericLeads, existing.cpl);
  const computedConvRate = resolveCampaignConvRate(body.convRate, numericConversions, numericLeads, existing.convRate);
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

function resolveAdCpl(bodyCpl, spend, leads, existingCpl = 0) {
  if (bodyCpl !== undefined && bodyCpl !== null) return Number(bodyCpl);
  if (leads > 0) return Number((spend / leads).toFixed(2));
  return existingCpl;
}

function resolveAdClicks(bodyClicks, leads, existingClicks) {
  if (bodyClicks !== undefined) return Number(bodyClicks);
  if (existingClicks) return existingClicks;
  return leads > 0 ? leads * 8 : 100;
}

function resolveAdImpressions(bodyImpressions, clicks, existingImpressions) {
  if (bodyImpressions !== undefined) return Number(bodyImpressions);
  if (existingImpressions) return existingImpressions;
  return clicks > 0 ? clicks * 30 : 3000;
}

function resolveAdCtr(bodyCtr, clicks, impressions, existingCtr = 2.5) {
  if (bodyCtr !== undefined && bodyCtr !== null) return Number(bodyCtr);
  if (impressions > 0) return Number(((clicks / impressions) * 100).toFixed(2));
  return existingCtr;
}

function resolveAdCpc(bodyCpc, spend, clicks, existingCpc = 5.0) {
  if (bodyCpc !== undefined && bodyCpc !== null) return Number(bodyCpc);
  if (clicks > 0) return Number((spend / clicks).toFixed(2));
  return existingCpc;
}

function computeAdMetrics(body, existing = {}) {
  const numericSpend = body.spend !== undefined ? Number(body.spend) : (existing.spend || 0);
  const numericLeads = body.leadsCount !== undefined ? Number(body.leadsCount) : (existing.leadsCount || 0);
  const computedCpl = resolveAdCpl(body.cpl, numericSpend, numericLeads, existing.cpl);
  const numericClicks = resolveAdClicks(body.clicks, numericLeads, existing.clicks);
  const numericImpressions = resolveAdImpressions(body.impressions, numericClicks, existing.impressions);
  const computedCtr = resolveAdCtr(body.ctr, numericClicks, numericImpressions, existing.ctr);
  const computedCpc = resolveAdCpc(body.cpc, numericSpend, numericClicks, existing.cpc);
  return { numericSpend, numericLeads, computedCpl, numericClicks, numericImpressions, computedCtr, computedCpc };
}

function buildNewCampaignObject(body, effectiveOwnerIdNumeric, effectiveOwnerName) {
  const numericSpend = Number(body.spend) || 0;
  const numericLeads = Number(body.leadsCount) || 0;
  const computedCpl = resolveCampaignCpl(body.cpl, numericSpend, numericLeads, 0);
  const numericConversions = Number(body.conversions) || 0;
  const computedConvRate = resolveCampaignConvRate(body.convRate, numericConversions, numericLeads, 0);

  return {
    id: `cmp_${crypto.randomBytes(4).toString('hex')}`,
    name: String(body.name).trim(),
    objective: String(body.objective || 'LEAD_GENERATION'),
    productId: body.productId || null,
    packageName: body.packageName || null,
    status: body.status || 'PLANNING',
    startDate: body.startDate || new Date().toISOString().split('T')[0],
    endDate: body.endDate || null,
    budget: Number(body.budget) || (numericSpend > 0 ? numericSpend * 1.5 : 50000),
    targetLeads: Number(body.targetLeads) || (numericLeads > 0 ? numericLeads * 1.2 : 300),
    targetCpl: Number(body.targetCpl) || 50,
    targetQualifiedPct: Number(body.targetQualifiedPct) || 60,
    targetConversionPct: Number(body.targetConversionPct) || 15,
    spend: numericSpend,
    leadsCount: numericLeads,
    cpl: computedCpl,
    qualifiedLeads: Number(body.qualifiedLeads) || 0,
    conversions: numericConversions,
    convRate: computedConvRate,
    revenue: Number(body.revenue) || numericConversions * 3000,
    ownerId: String(effectiveOwnerIdNumeric),
    ownerName: effectiveOwnerName,
    createdAt: new Date().toISOString().split('T')[0],
  };
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

function mapCampaignRow(row) {
  return {
    id: String(row.id),
    name: row.name,
    objective: row.objective || 'LEAD_GENERATION',
    productId: row.product_id || null,
    packageName: row.product_id ? (row.product_id === 'pkg_careermate' ? 'Careermate Package' : row.product_id) : 'General Funnel',
    status: row.status,
    startDate: row.start_date ? row.start_date.toISOString().split('T')[0] : '2026-10-01',
    endDate: row.end_date ? row.end_date.toISOString().split('T')[0] : null,
    budget: Number(row.budget) || 0,
    targetLeads: 500,
    targetCpl: Number(row.target_cpl) || 50,
    targetQualifiedPct: 60,
    targetConversionPct: 15,
    spend: Number(row.spend) || 0,
    leadsCount: Number(row.leads_count) || 0,
    cpl: Number(row.leads_count) > 0 ? Number((Number(row.spend) / Number(row.leads_count)).toFixed(2)) : 0,
    qualifiedLeads: Math.round(Number(row.leads_count) * 0.4),
    conversions: Math.round(Number(row.leads_count) * 0.1),
    convRate: 10,
    revenue: Math.round(Number(row.leads_count) * 0.1) * 3000,
    ownerId: String(row.owner_id || 'usr_dm_01'),
    ownerName: row.owner_name || 'Digital Marketer',
    createdAt: row.created_at ? row.created_at.toISOString().split('T')[0] : '2026-10-01',
  };
}

router.get('/campaigns', async (req, res) => {
  if (dbPool.isConnected()) {
    try {
      const [rows] = await dbPool.queryStrict(
        `SELECT c.*, u.full_name as owner_name 
         FROM campaigns c 
         LEFT JOIN users u ON c.owner_id = u.id 
         ORDER BY c.id DESC`
      );
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

  if (!req.body.name) {
    return res.status(400).json({ error: 'Campaign Name is required.' });
  }

  const effectiveOwnerIdNumeric = Number(req.user?.id);
  if (!Number.isSafeInteger(effectiveOwnerIdNumeric) || effectiveOwnerIdNumeric < 1) {
    return res.status(401).json({ error: 'Authenticated user ID is invalid.' });
  }
  const effectiveOwnerName = req.user.fullName || 'Digital Marketer';

  const newCmp = buildNewCampaignObject(req.body, effectiveOwnerIdNumeric, effectiveOwnerName);

  if (dbPool.isConnected()) {
    const [result] = await dbPool.queryStrict(
      `INSERT INTO campaigns (name, objective, product_id, status, budget, spend, leads_count, owner_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newCmp.name, 
        newCmp.objective, 
        newCmp.productId || 'pkg_careermate', 
        newCmp.status, 
        newCmp.budget, 
        newCmp.spend, 
        newCmp.leadsCount,
        newCmp.ownerId 
      ]
    );
    newCmp.id = String(result.insertId);
  }
  dbCampaignsStore.unshift(newCmp);

  await recordAuditLog(dbPool, {
    actorId: String(effectiveOwnerIdNumeric),
    actorEmail: req.user.email || 'admin@markops.io',
    action: 'CAMPAIGN_CREATED',
    entityType: 'Campaign',
    entityId: newCmp.id,
    newState: { name: newCmp.name, status: newCmp.status, budget: newCmp.budget },
    ipAddress: req.ip || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'],
  });

  emitRealtimeEvent('campaign:created', newCmp);
  return res.status(201).json(newCmp);
});

router.put('/campaigns/:id', requireRecordCreator('campaign'), async (req, res) => {
  const effectiveRole = String(req.user?.role || '').toUpperCase();
  const allowedRoles = ['ADMINISTRATOR', 'MARKETING_MANAGER', 'DIGITAL_MARKETING'];

  if (effectiveRole && !allowedRoles.includes(effectiveRole)) {
    return res.status(403).json({
      error: 'Access Denied: Only Marketing Manager, Digital Marketing Specialist, and Administrator can modify campaigns.',
    });
  }

  const { id } = req.params;
  const index = dbCampaignsStore.findIndex((c) => String(c.id) === String(id));

  if (index === -1) {
    return res.status(404).json({ error: `Campaign record #${id} not found.` });
  }

  const existing = dbCampaignsStore[index];
  const updated = buildUpdatedCampaign(existing, req.body);

  if (dbPool.isConnected()) {
    const [result] = await dbPool.queryStrict(
      `UPDATE campaigns 
       SET name = ?, objective = ?, status = ?, budget = ?, spend = ?, leads_count = ?, target_cpl = ?
       WHERE id = ?`,
      [
        updated.name,
        updated.objective,
        updated.status,
        updated.budget,
        updated.spend,
        updated.leadsCount,
        updated.targetCpl,
        id
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: `Campaign #${id} was not found in the database.` });
    }
  }

  dbCampaignsStore[index] = updated;

  await recordAuditLog(dbPool, {
    actorId: String(req.user?.id || 'usr_dm_01'),
    actorEmail: req.user.email || 'admin@markops.io',
    action: 'CAMPAIGN_UPDATED',
    entityType: 'Campaign',
    entityId: id,
    newState: { name: updated.name, status: updated.status, spend: updated.spend },
    ipAddress: req.ip || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'],
  });

  emitRealtimeEvent('campaign:updated', updated);
  return res.json(updated);
});

function mapAdRow(row) {
  const numSpend = Number(row.spend) || 0;
  const numLeads = Number(row.leads_count) || 0;
  const numClicks = Number(row.clicks) || 0;
  const numImpressions = Number(row.impressions) || 0;

  return {
    id: String(row.id),
    name: row.name,
    campaignId: String(row.campaign_id),
    campaignName: row.campaign_name || 'General Funnel',
    productId: row.product_id || null,
    packageName: row.product_id ? (row.product_id === 'pkg_careermate' ? 'Careermate Package' : row.product_id) : 'General Funnel',
    platform: row.platform || 'Meta',
    status: row.status,
    spend: numSpend,
    impressions: numImpressions,
    reach: Number(row.reach) || Math.round(numImpressions * 0.72),
    clicks: numClicks,
    ctr: numImpressions > 0 ? Number(((numClicks / numImpressions) * 100).toFixed(2)) : 2.5,
    cpc: numClicks > 0 ? Number((numSpend / numClicks).toFixed(2)) : 5.0,
    leadsCount: numLeads,
    cpl: numLeads > 0 ? Number((numSpend / numLeads).toFixed(2)) : 0,
    platformAdId: row.platform_ad_id || `ad_ext_${row.id}`,
    designId: row.design_id || null,
    designTitle: row.design_title || null,
    designImageUrl: row.design_image_url || null,
    adCreativeUrl: row.ad_creative_url || null,
    lastSyncedAt: row.last_synced_at ? row.last_synced_at.toISOString() : new Date().toISOString(),
  };
}

router.get('/ads', async (req, res) => {
  if (dbPool.isConnected()) {
    try {
      const [rows] = await dbPool.queryStrict(
        `SELECT a.*, c.name as campaign_name, c.product_id 
         FROM ads a 
         LEFT JOIN campaigns c ON a.campaign_id = c.id 
         ORDER BY a.id DESC`
      );
      if (Array.isArray(rows)) {
        const mapped = rows.map(mapAdRow);
        dbAdsStore.length = 0;
        dbAdsStore.push(...mapped);
        return res.json(mapped);
      }
    } catch (e) {
      console.log('[MySQL Error] Fetch ads failed:', e.message);
    }
  }

  return res.json(dbAdsStore);
});

router.post('/ads', async (req, res) => {
  const effectiveRole = String(req.user?.role || '').toUpperCase();
  const allowedRoles = ['ADMINISTRATOR', 'DIGITAL_MARKETING'];

  if (effectiveRole && !allowedRoles.includes(effectiveRole)) {
    return res.status(403).json({
      error: 'Access Denied: Only Digital Marketing Specialists and Administrators can create ads or ad metrics.',
    });
  }

  if (!req.body.name) {
    return res.status(400).json({ error: 'Ad Name is required.' });
  }

  const creatorId = Number(req.user?.id);
  if (!Number.isSafeInteger(creatorId) || creatorId < 1) {
    return res.status(401).json({ error: 'Authenticated user ID is invalid.' });
  }
  const id = `ad_${crypto.randomBytes(4).toString('hex')}`;
  const m = computeAdMetrics(req.body);
  const { campaignId, campaignName } = req.body;

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
      `UPDATE ads 
       SET name = ?, campaign_id = ?, platform = ?, status = ?, spend = ?, impressions = ?, clicks = ?, leads_count = ?
       WHERE id = ?`,
      [
        updatedAd.name,
        updatedAd.campaignId ? Number(updatedAd.campaignId) : null,
        updatedAd.platform,
        updatedAd.status,
        updatedAd.spend,
        updatedAd.impressions,
        updatedAd.clicks,
        updatedAd.leadsCount,
        id
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: `Ad #${id} was not found in the database.` });
    }
  }

  dbAdsStore[index] = updatedAd;

  await recordAuditLog(dbPool, {
    actorId: String(req.user?.id || 'usr_dm_01'),
    actorEmail: req.user.email || 'admin@markops.io',
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

router.post('/ads/sync', async (req, res) => {
  const syncTimestamp = new Date().toISOString();
  dbAdsStore.forEach((ad) => {
    ad.lastSyncedAt = syncTimestamp;
    ad.impressions += crypto.randomInt(100, 600);
    ad.clicks += crypto.randomInt(5, 25);
    ad.reach = Math.round(ad.impressions * 0.72);
    if (ad.impressions > 0) {
      ad.ctr = Number(((ad.clicks / ad.impressions) * 100).toFixed(2));
    }
    if (ad.clicks > 0) {
      ad.cpc = Number((ad.spend / ad.clicks).toFixed(2));
    }
  });

  if (dbPool.isConnected()) {
    try {
      await dbPool.queryStrict(
        `UPDATE ads 
         SET impressions = impressions + FLOOR(100 + RAND() * 500),
             clicks = clicks + FLOOR(5 + RAND() * 20),
             reach = FLOOR(impressions * 0.72)
         WHERE status = 'ACTIVE'`
      );
    } catch (e) {
      console.log('[MySQL Notice] Ads sync SQL skipped:', e.message);
    }
  }

  emitRealtimeEvent('ads:synced', { count: dbAdsStore.length, syncedAt: syncTimestamp });
  return res.json({ success: true, count: dbAdsStore.length, syncedAt: syncTimestamp });
});

router.post('/ads/link-design', async (req, res) => {
  const { adId, taskId, designTitle, designImageUrl } = req.body;
  if (!adId || !taskId) {
    return res.status(400).json({ error: 'adId and taskId are required.' });
  }

  const ad = dbAdsStore.find((a) => String(a.id) === String(adId));
  if (!ad) {
    return res.status(404).json({ error: `Ad record #${adId} not found.` });
  }

  ad.designId = String(taskId);
  ad.designTitle = designTitle || ad.designTitle || null;
  ad.designImageUrl = designImageUrl || ad.designImageUrl || null;
  ad.lastSyncedAt = new Date().toISOString();

  if (dbPool.isConnected()) {
    try {
      await dbPool.queryStrict(
        `UPDATE ads 
         SET design_id = ?, design_image_url = ?
         WHERE id = ?`,
        [ad.designId, ad.designImageUrl, adId]
      );
    } catch (e) {
      console.log('[MySQL Error] Link design to ad failed in DB:', e.message);
    }
  }

  emitRealtimeEvent('ad:updated', ad);
  return res.json({ success: true, ad });
});

module.exports = router;
