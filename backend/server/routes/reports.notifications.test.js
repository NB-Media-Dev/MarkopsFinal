const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { dbPool, dbNotificationsStore } = require('../db');
const { setSocketIO } = require('../events');
const reportsRoutes = require('./reports.routes');

test('notification routes list, deliver, and update only the authenticated recipient', async () => {
  const originalIsConnected = dbPool.isConnected;
  const emissions = [];
  dbPool.isConnected = () => false;
  dbNotificationsStore.splice(
    0,
    dbNotificationsStore.length,
    {
      id: 'notification-user-1',
      userId: '1',
      title: 'For user one',
      message: 'Private notification',
      type: 'INFO',
      isRead: false,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'notification-user-2',
      userId: '2',
      title: 'For user two',
      message: 'Private notification',
      type: 'INFO',
      isRead: false,
      createdAt: new Date().toISOString(),
    }
  );
  setSocketIO({
    to(room) {
      return {
        emit(event, payload) {
          emissions.push({ room, event, payload });
        },
      };
    },
    emit() {
      assert.fail('A user notification must not be broadcast to every socket.');
    },
  });

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = {
      id: req.headers['x-test-user-id'] || '1',
      role: req.headers['x-test-user-role'] || 'TELECALLER',
    };
    next();
  });
  app.use('/api', reportsRoutes);
  const server = app.listen(0);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}/api/notifications`;
    const ownList = await fetch(`${baseUrl}?userId=2`, { headers: { 'x-user-id': '2' } });
    assert.equal(ownList.status, 200);
    assert.deepEqual((await ownList.json()).map((item) => item.id), ['notification-user-1']);

    const crossUserRead = await fetch(`${baseUrl}/notification-user-2/read`, { method: 'PATCH' });
    assert.equal(crossUserRead.status, 404);
    assert.equal(dbNotificationsStore.find((item) => item.id === 'notification-user-2').isRead, false);

    const readAll = await fetch(`${baseUrl}/read-all?userId=2`, { method: 'PATCH', headers: { 'x-user-id': '2' } });
    assert.equal(readAll.status, 200);
    assert.equal(dbNotificationsStore.find((item) => item.id === 'notification-user-1').isRead, true);
    assert.equal(dbNotificationsStore.find((item) => item.id === 'notification-user-2').isRead, false);

    const unauthorizedRole = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: '2', title: 'Test', message: 'Test' }),
    });
    assert.equal(unauthorizedRole.status, 403);

    const broadcastAttempt = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-test-user-role': 'MARKETING_MANAGER' },
      body: JSON.stringify({ userId: 'ALL', title: 'Test', message: 'Test' }),
    });
    assert.equal(broadcastAttempt.status, 400);

    const delivered = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-test-user-role': 'MARKETING_MANAGER' },
      body: JSON.stringify({ userId: '2', title: 'Assigned', message: 'New work', type: 'INFO' }),
    });
    assert.equal(delivered.status, 201);
    assert.equal(emissions.length, 1);
    assert.equal(emissions[0].room, 'user:2');
    assert.equal(emissions[0].event, 'notification:created');
  } finally {
    server.close();
    dbPool.isConnected = originalIsConnected;
    dbNotificationsStore.length = 0;
    setSocketIO(null);
  }
});
