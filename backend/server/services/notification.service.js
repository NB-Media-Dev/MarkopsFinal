const crypto = require('node:crypto');
const { dbPool, dbNotificationsStore, dbUsersStore } = require('../db');
const { emitUserRealtimeEvent } = require('../events');

function stripEmojis(str) {
  if (!str) return '';
  return String(str)
    .replace(/[\u{1F300}-\u{1FAFF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B50}\u{FE00}-\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}


const KNOWN_USER_ALIASES = {
  '1': 'usr_admin_01',
  'usr_admin_01': '1',
  '2': 'usr_bdm_01',
  'usr_bdm_01': '2',
  '3': 'usr_mktg_01',
  'usr_mktg_01': '3',
  '4': 'usr_digital_01',
  'usr_digital_01': '4',
  '5': 'usr_designer_01',
  'usr_designer_01': '5',
  '6': 'usr_telecaller_01',
  'usr_telecaller_01': '6',
};

function addMatchingUserStoreAliases(aliases, strId, strEmail) {
  if (!Array.isArray(dbUsersStore)) return;
  const userMatch = dbUsersStore.find(
    (u) =>
      (strId && (String(u.id).toLowerCase() === strId || String(u.id) === strId)) ||
      (strEmail && u.email?.toLowerCase() === strEmail)
  );
  if (userMatch) {
    if (userMatch.id) aliases.add(String(userMatch.id).toLowerCase());
    if (userMatch.email) aliases.add(userMatch.email.toLowerCase());
    if (userMatch.fullName) aliases.add(userMatch.fullName.toLowerCase());
  }
}

function resolveUserAliases(userIdentifier, _role = '', email = '', name = '') {
  const aliases = new Set();
  const strId = String(userIdentifier || '').toLowerCase().trim();
  const strEmail = String(email || '').toLowerCase().trim();
  const strName = String(name || '').toLowerCase().trim();

  if (strId) {
    aliases.add(strId);
    const mappedAlias = KNOWN_USER_ALIASES[strId];
    if (mappedAlias) aliases.add(mappedAlias);
  }

  if (strEmail) aliases.add(strEmail);
  if (strName) aliases.add(strName);

  addMatchingUserStoreAliases(aliases, strId, strEmail);

  return aliases;
}



function resolveNumericUserId(rId, recipient) {
  if (typeof rId === 'number') return rId;
  if (/^\d+$/.test(recipient)) return Number(recipient);
  return null;
}

function isRecentDuplicateNotification(notifObj) {
  return dbNotificationsStore.slice(0, 10).some(
    (n) =>
      String(n.userId).toLowerCase() === String(notifObj.userId).toLowerCase() &&
      n.title === notifObj.title &&
      n.message === notifObj.message &&
      Math.abs(new Date(n.createdAt).getTime() - new Date(notifObj.createdAt).getTime()) < 5000
  );
}

async function persistNotificationToDb(numericUserId, cleanTitle, cleanMessage, type, targetRoute) {
  const [res] = await dbPool.queryStrict(
    `INSERT INTO notifications (user_id, title, message, type, target_route, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, 0, NOW())`,
    [numericUserId, cleanTitle, cleanMessage, type, targetRoute || null]
  );
  if (!res?.insertId) throw new Error('Notification was not persisted by the database.');
  return String(res.insertId);
}

function validateRecipient(rId, numericUserId) {
  if (String(rId).trim().toUpperCase() === 'ALL') {
    throw new Error('Notification recipients must be explicit user IDs; ALL is not supported.');
  }
  if (dbPool.isConnected() && (!Number.isSafeInteger(numericUserId) || numericUserId < 1)) {
    throw new Error(`Notification recipient "${rId}" is not a valid database user ID.`);
  }
}

function storeInMemoryNotification(notifObj) {
  if (!isRecentDuplicateNotification(notifObj)) {
    dbNotificationsStore.unshift(notifObj);
    if (dbNotificationsStore.length > 500) {
      dbNotificationsStore.pop();
    }
  }
}

async function createNotificationForRecipient(rId, cleanTitle, cleanMessage, type, targetRoute) {
  const recipient = String(rId).trim();
  const numericUserId = resolveNumericUserId(rId, recipient);
  validateRecipient(rId, numericUserId);

  const notifObj = {
    id: `notif_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    userId: numericUserId || recipient,
    title: cleanTitle,
    message: cleanMessage,
    type,
    isRead: false,
    createdAt: new Date().toISOString(),
    targetRoute: targetRoute || null,
  };

  if (dbPool.isConnected() && numericUserId) {
    try {
      notifObj.id = await persistNotificationToDb(numericUserId, cleanTitle, cleanMessage, type, targetRoute);
    } catch (error) {
      console.error(`[Notification Service] Persistence failed for recipient ${numericUserId}:`, error?.message || error);
      throw error;
    }
  }

  storeInMemoryNotification(notifObj);
  return notifObj;
}

async function dispatchNotification({ userIds = [], title, message, type = 'INFO', targetRoute = null }) {
  const recipients = new Set();
  const arr = Array.isArray(userIds) ? userIds : [userIds];
  arr.forEach((u) => {
    if (u !== undefined && u !== null && u !== '') {
      recipients.add(u);
    }
  });

  const cleanTitle = stripEmojis(title);
  const cleanMessage = stripEmojis(message);
  const createdNotifs = [];

  for (const rId of recipients) {
    const notifObj = await createNotificationForRecipient(rId, cleanTitle, cleanMessage, type, targetRoute);
    createdNotifs.push(notifObj);
  }

  return createdNotifs;
}

module.exports = {
  stripEmojis,
  resolveUserAliases,
  dispatchNotification,
};
