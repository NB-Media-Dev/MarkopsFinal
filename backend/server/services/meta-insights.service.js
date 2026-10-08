const { dbPool } = require('../db');
const { META_API_VERSION } = require('./meta.service');

const SYNC_INTERVAL_MS = 3 * 60 * 60 * 1000;
let syncInProgress = false;

async function fetchInsights() {
  const accessToken = process.env.META_SYSTEM_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  if (!accessToken || !adAccountId) {
    throw new Error('META_SYSTEM_ACCESS_TOKEN and META_AD_ACCOUNT_ID must be configured');
  }

  let nextUrl = new URL(`https://graph.facebook.com/${META_API_VERSION}/${encodeURIComponent(adAccountId)}/insights`);
  nextUrl.searchParams.set('level', 'ad');
  nextUrl.searchParams.set('fields', 'campaign_id,campaign_name,ad_id,ad_name,spend,clicks,impressions');
  nextUrl.searchParams.set('date_preset', 'this_month');
  nextUrl.searchParams.set('access_token', accessToken);

  const insights = [];
  while (nextUrl) {
    const response = await fetch(nextUrl, { signal: AbortSignal.timeout(30000) });
    const payload = await response.json();
    if (!response.ok || payload.error) {
      throw new Error(`Meta insights request failed (${response.status}): ${payload.error?.message || 'unknown Graph API error'}`);
    }
    if (!Array.isArray(payload.data)) throw new Error('Meta insights response did not contain a data array');
    insights.push(...payload.data);

    if (!payload.paging?.next) {
      nextUrl = null;
    } else {
      const candidate = new URL(payload.paging.next);
      if (candidate.protocol !== 'https:' || candidate.hostname !== 'graph.facebook.com') {
        throw new Error('Meta insights response contained an unexpected pagination URL');
      }
      nextUrl = candidate;
    }
  }
  return insights;
}

async function upsertInsights(insights) {
  if (!dbPool) throw new Error('Database pool is not connected');
  const campaignTotals = new Map();

  for (const insight of insights) {
    if (!insight.campaign_id || !insight.ad_id) continue;
    const campaignId = String(insight.campaign_id);
    const spend = Number(insight.spend) || 0;
    const clicks = Number(insight.clicks) || 0;
    const impressions = Number(insight.impressions) || 0;
    const totals = campaignTotals.get(campaignId) || {
      name: String(insight.campaign_name || `Meta Campaign ${campaignId}`),
      spend: 0,
      clicks: 0,
      impressions: 0,
    };
    totals.spend += spend;
    totals.clicks += clicks;
    totals.impressions += impressions;
    campaignTotals.set(campaignId, totals);
  }

  for (const [metaCampaignId, totals] of campaignTotals) {
    await dbPool.queryStrict(
      `INSERT INTO campaigns
       (name, objective, status, start_date, budget, spend, leads_count, target_cpl, target_qualified_pct,
        target_conversion_pct, owner_id, meta_campaign_id, clicks, impressions)
       VALUES (?, 'LEAD_GENERATION', 'ACTIVE', CURDATE(), 0, ?, 0, 0, 0, 0, 1, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), spend = VALUES(spend), clicks = VALUES(clicks),
       impressions = VALUES(impressions), updated_at = CURRENT_TIMESTAMP`,
      [totals.name, totals.spend, metaCampaignId, totals.clicks, totals.impressions]
    );
  }

  let processed = 0;
  for (const insight of insights) {
    if (!insight.campaign_id || !insight.ad_id) continue;
    const metaCampaignId = String(insight.campaign_id);
    const metaAdId = String(insight.ad_id);
    const [campaignRows] = await dbPool.queryStrict(
      'SELECT id FROM campaigns WHERE meta_campaign_id = ? LIMIT 1',
      [metaCampaignId]
    );
    const campaign = campaignRows[0];
    if (!campaign) throw new Error(`Meta campaign ${metaCampaignId} was not persisted`);

    await dbPool.queryStrict(
      `INSERT INTO ads
       (campaign_id, platform, platform_ad_id, platform_campaign_id, name, status, spend, impressions, clicks, leads_count)
       VALUES (?, 'Meta', ?, ?, ?, 'ACTIVE', ?, ?, ?, 0)
       ON DUPLICATE KEY UPDATE campaign_id = VALUES(campaign_id), platform_campaign_id = VALUES(platform_campaign_id),
       name = VALUES(name), spend = VALUES(spend), impressions = VALUES(impressions), clicks = VALUES(clicks),
       updated_at = CURRENT_TIMESTAMP`,
      [
        campaign.id,
        metaAdId,
        metaCampaignId,
        String(insight.ad_name || `Meta Ad ${metaAdId}`),
        Number(insight.spend) || 0,
        Number(insight.impressions) || 0,
        Number(insight.clicks) || 0,
      ]
    );
    processed++;
  }
  return { campaigns: campaignTotals.size, ads: processed };
}

async function syncMetaInsights() {
  if (syncInProgress) {
    console.log('[Meta Insights] Skipping sync; previous sync is still running.');
    return;
  }
  syncInProgress = true;
  try {
    const insights = await fetchInsights();
    const totals = await upsertInsights(insights);
    console.log(`[Meta Insights] Synced ${totals.ads} ads across ${totals.campaigns} campaigns.`);
  } catch (error) {
    console.error('[Meta Insights Error] Scheduled synchronization failed:', error.message);
  } finally {
    syncInProgress = false;
  }
}

function startMetaInsightsScheduler() {
  if (!process.env.META_SYSTEM_ACCESS_TOKEN || !process.env.META_AD_ACCOUNT_ID || !dbPool.isConnected()) {
    console.warn('[Meta Insights] Scheduler disabled; configure Meta credentials and a database connection.');
    return null;
  }
  void syncMetaInsights();
  const timer = setInterval(() => void syncMetaInsights(), SYNC_INTERVAL_MS);
  timer.unref();
  return timer;
}

module.exports = {
  fetchInsights,
  startMetaInsightsScheduler,
  syncMetaInsights,
  upsertInsights,
};
