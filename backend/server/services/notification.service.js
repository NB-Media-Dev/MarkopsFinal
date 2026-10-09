const { dbPool, dbNotificationsStore, dbUsersStore } = require('../db');
const { emitUserRealtimeEvent } = require('../events');

function stripEmojis(str) {
  if (!str) return '';
  return String(str)
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2300}-\u{23FF}\u{2B50}\u{200D}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}


function resolveUserAliases(userIdentifier, role = '', email = '', name = '') {
  const aliases = new Set();
  const strId = String(userIdentifier || '').toLowerCase().trim();
  const strRole = String(role || '').toUpperCase().trim();
  const strEmail = String(email || '').toLowerCase().trim();
  const strName = String(name || '').toLowerCase().trim();

  if (strId) {
    aliases.add(strId);
  
    if (strId === '1' || strId === 'usr_admin_01') {
      aliases.add('1');
      aliases.add('usr_admin_01');
    } else if (strId === '2' || strId === 'usr_bdm_01') {
      aliases.add('2');
      aliases.add('usr_bdm_01');
    } else if (strId === '3' || strId === 'usr_mktg_01') {
      aliases.add('3');
      aliases.add('usr_mktg_01');
    } else if (strId === '4' || strId === 'usr_digital_01') {
      aliases.add('4');
      aliases.add('usr_digital_01');
    } else if (strId === '5' || strId === 'usr_designer_01') {
      aliases.add('5');
      aliases.add('usr_designer_01');
    } else if (strId === '6' || strId === 'usr_telecaller_01') {
      aliases.add('6');
      aliases.add('usr_telecaller_01');
    }
  }

  if (strEmail) aliases.add(strEmail);
  if (strName) aliases.add(strName);


  if (Array.isArray(dbUsersStore)) {
    const userMatch = dbUsersStore.find(
      (u) =>
        (strId && (String(u.id).toLowerCase() === strId || String(u.id) === strId)) ||
        (strEmail && u.email && u.email.toLowerCase() === strEmail)
    );
    if (userMatch) {
      if (userMatch.id) aliases.add(String(userMatch.id).toLowerCase());
      if (userMatch.email) aliases.add(userMatch.email.toLowerCase());
      if (userMatch.fullName) aliases.add(userMatch.fullName.toLowerCase());
    }
  }

  return aliases;
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
    if (String(rId).trim().toUpperCase() === 'ALL') {
      throw new Error('Notification recipients must be explicit user IDs; ALL is not supported.');
    }
    const recipient = String(rId).trim();
    const numericUserId = typeof rId === 'number'
      ? rId
      : (/^\d+$/.test(recipient) ? Number(recipient) : null);
    if (dbPool.isConnected() && (!Number.isSafeInteger(numericUserId) || numericUserId < 1)) {
      throw new Error(`Notification recipient "${rId}" is not a valid database user ID.`);
    }
    const notifObj = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      userId: numericUserId || recipient,
      title: cleanTitle,
      message: cleanMessage,
      type,
      isRead: false,
      createdAt: new Date().toISOString(),
      targetRoute: targetRoute || null,
    };


    const isDuplicate = dbNotificationsStore.slice(0, 10).some(
      (n) =>
        String(n.userId).toLowerCase() === String(notifObj.userId).toLowerCase() &&
        n.title === notifObj.title &&
        n.message === notifObj.message &&
        Math.abs(new Date(n.createdAt).getTime() - new Date(notifObj.createdAt).getTime()) < 5000
    );

    if (dbPool.isConnected() && numericUserId) {
      try {
        const [res] = await dbPool.queryStrict(
          `INSERT INTO notifications (user_id, title, message, type, target_route, is_read, created_at)
           VALUES (?, ?, ?, ?, ?, 0, NOW())`,
          [numericUserId, cleanTitle, cleanMessage, type, targetRoute || null]
        );
        if (!res?.insertId) throw new Error('Notification was not persisted by the database.');
        notifObj.id = String(res.insertId);
      } catch (error) {
        console.error(`[Notification Service] Persistence failed for recipient ${numericUserId}:`, error?.message || error);
        throw error;
      }
    }

    if (!isDuplicate) {
      dbNotificationsStore.unshift(notifObj);
    }

    emitUserRealtimeEvent('notification:created', notifObj, [notifObj.userId]);
    createdNotifs.push(notifObj);
  }

  return createdNotifs;
}

module.exports = {
  stripEmojis,
  resolveUserAliases,
  dispatchNotification,
};
