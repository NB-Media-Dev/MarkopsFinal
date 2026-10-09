const crypto = require('node:crypto');

const META_API_VERSION = process.env.META_API_VERSION || 'v26.0';

function normalizeFieldName(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function readField(fieldData, aliases) {
  const wanted = new Set(aliases.map(normalizeFieldName));
  const item = fieldData.find((field) => wanted.has(normalizeFieldName(field.name)));
  const value = Array.isArray(item?.values) ? item.values[0] : item?.values;
  return typeof value === 'string' ? value.trim() : '';
}

function parseLeadFields(fieldData) {
  const fields = Array.isArray(fieldData) ? fieldData : [];
  let firstName = readField(fields, ['full_name', 'name', 'first_name', 'firstname']);
  let lastName = readField(fields, ['last_name', 'lastname', 'surname']);

  if (firstName && !lastName && /\s/.test(firstName)) {
    const nameParts = firstName.split(/\s+/);
    firstName = nameParts.shift();
    lastName = nameParts.join(' ');
  }

  return {
    firstName,
    lastName,
    phone: readField(fields, ['phone_number', 'phone', 'mobile_phone', 'mobile', 'phone number']),
    email: readField(fields, ['email', 'email_address', 'email address']),
  };
}

function extractLeadEvents(payload) {
  const events = [];
  for (const entry of Array.isArray(payload?.entry) ? payload.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      if (change?.field !== 'leadgen' || !change?.value?.leadgen_id) continue;
      events.push({
        leadId: String(change.value.leadgen_id),
        formId: change.value.form_id ? String(change.value.form_id) : null,
        pageId: change.value.page_id ? String(change.value.page_id) : String(entry.id || ''),
        adId: change.value.ad_id ? String(change.value.ad_id) : null,
        campaignId: change.value.campaign_id ? String(change.value.campaign_id) : null,
      });
    }
  }
  return events;
}

function isValidMetaSignature(rawBody, signature, appSecret) {
  if (!Buffer.isBuffer(rawBody) || !signature || !appSecret) return false;
  const match = /^sha256=([a-f0-9]{64})$/i.exec(String(signature));
  if (!match) return false;

  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest();
  const provided = Buffer.from(match[1], 'hex');
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

async function fetchGraphLead(leadId) {
  const token = process.env.META_SYSTEM_ACCESS_TOKEN;
  if (!token) throw new Error('META_SYSTEM_ACCESS_TOKEN is not configured');

  const url = new URL(`https://graph.facebook.com/${META_API_VERSION}/${encodeURIComponent(leadId)}`);
  url.searchParams.set('fields', 'id,created_time,field_data,ad_id,form_id');
  url.searchParams.set('access_token', token);

  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const body = await response.json();
  if (!response.ok || body.error) {
    throw new Error(`Meta lead lookup failed (${response.status}): ${body.error?.message || 'unknown Graph API error'}`);
  }
  return body;
}

async function fetchGraphAd(adId) {
  const token = process.env.META_SYSTEM_ACCESS_TOKEN;
  if (!token) throw new Error('META_SYSTEM_ACCESS_TOKEN is not configured');

  const url = new URL(`https:
  url.searchParams.set('fields', 'id,name,campaign_id');
  url.searchParams.set('access_token', token);

  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const body = await response.json();
  if (!response.ok || body.error) {
    throw new Error(`Meta ad lookup failed (${response.status}): ${body.error?.message || 'unknown Graph API error'}`);
  }
  return body;
}

module.exports = {
  META_API_VERSION,
  extractLeadEvents,
  fetchGraphAd,
  fetchGraphLead,
  isValidMetaSignature,
  parseLeadFields,
};
