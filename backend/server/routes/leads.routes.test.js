const test = require('node:test');
const assert = require('node:assert/strict');
const { dbLeadsStore, dbPool, dbUsersStore, dbCallActivitiesStore } = require('../db');
const leadsRoutes = require('./leads.routes');

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('batch import equally assigns 30 leads to three active telecallers', async () => {
  const originalUsers = [...dbUsersStore];
  const originalLeads = [...dbLeadsStore];
  dbUsersStore.splice(0, dbUsersStore.length,
    { id: 'tc-1', fullName: 'Telecaller One', email: 'tc1@example.com', role: 'TELECALLER', isActive: true },
    { id: 'tc-2', fullName: 'Telecaller Two', email: 'tc2@example.com', role: 'TELECALLER', isActive: true },
    { id: 'tc-3', fullName: 'Telecaller Three', email: 'tc3@example.com', role: 'TELECALLER', isActive: true },
    { id: 'tc-4', fullName: 'Inactive Telecaller', email: 'tc4@example.com', role: 'TELECALLER', isActive: false }
  );
  dbLeadsStore.length = 0;

  try {
    const response = responseRecorder();
    const leads = Array.from({ length: 30 }, (_, index) => (
      index === 0
        ? {
            'First Name': 'Lead',
            'Last Name': 'One',
            Email: 'lead@example.com',
            Phone: '9876543210',
            Source: 'Google Ads',
          }
        : {
            firstName: `Lead ${index + 1}`,
            phone: `900000${String(index + 1).padStart(4, '0')}`,
          }
    ));
    await leadsRoutes.handleBatchImport({
      body: {
        leads,
        campaignId: 'campaign-1',
        campaignName: 'Excel Campaign',
        uploaderRole: 'DIGITAL_MARKETING',
      },
      user: { id: 'dm-1', role: 'DIGITAL_MARKETING', fullName: 'Digital Marketer' },
      headers: {},
      ip: 'test',
      socket: { remoteAddress: 'test' },
    }, response);

    assert.equal(response.statusCode, 201);
    assert.equal(response.body.totalUploaded, 30);
    assert.equal(response.body.leads[0].firstName, 'Lead');
    assert.equal(response.body.leads[0].lastName, 'One');
    assert.equal(response.body.leads[0].phone, '9876543210');
    assert.equal(response.body.leads[0].email, 'lead@example.com');
    assert.equal(response.body.leads[0].source, 'Google Ads');
    assert.equal(response.body.leads[0].campaignName, 'Excel Campaign');
    assert.deepEqual(
      response.body.allocationSummary.map(({ fullName, count }) => [fullName, count]),
      [
        ['Telecaller One', 10],
        ['Telecaller Two', 10],
        ['Telecaller Three', 10],
      ]
    );
    assert.equal(response.body.leads.some((lead) => lead.assigneeName === 'Inactive Telecaller'), false);
  } finally {
    dbUsersStore.splice(0, dbUsersStore.length, ...originalUsers);
    dbLeadsStore.splice(0, dbLeadsStore.length, ...originalLeads);
  }
});

test('batch import stores a null campaign reference when no campaigns exist', async () => {
  const originalUsers = [...dbUsersStore];
  const originalLeads = [...dbLeadsStore];
  const originalDbPool = {
    isConnected: dbPool.isConnected,
    query: dbPool.query,
    queryStrict: dbPool.queryStrict,
    getConnection: dbPool.getConnection,
  };
  const insertValues = [];
  dbUsersStore.splice(0, dbUsersStore.length,
    { id: '7', fullName: 'Telecaller One', email: 'tc1@example.com', role: 'TELECALLER', isActive: true }
  );
  dbLeadsStore.length = 0;
  dbPool.isConnected = () => true;
  dbPool.queryStrict = async (sql) => {
    if (sql.includes('FROM users u')) {
      return [[{ id: 7, fullName: 'Telecaller One', email: 'tc1@example.com' }]];
    }
    if (sql.includes('INSERT INTO notifications')) {
      return [{ insertId: 1 }, []];
    }
    return [[]];
  };
  dbPool.query = async () => [[]];
  dbPool.getConnection = async () => ({
    beginTransaction: async () => {},
    query: async (_sql, values) => { insertValues.push(values); },
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  });

  try {
    const response = responseRecorder();
    await leadsRoutes.handleBatchImport({
      body: {
        leads: [{ firstName: 'Lead', lastName: 'One', phone: '9876543210' }],
        campaignId: 'cmp_default',
        campaignName: 'Excel Lead Upload',
        uploaderRole: 'DIGITAL_MARKETING',
      },
      user: { id: '3', role: 'DIGITAL_MARKETING', fullName: 'Digital Marketer' },
      headers: {},
      ip: 'test',
      socket: { remoteAddress: 'test' },
    }, response);

    assert.equal(response.statusCode, 201);
    assert.equal(insertValues.length, 1);
    assert.equal(insertValues[0][12], null);
  } finally {
    dbUsersStore.splice(0, dbUsersStore.length, ...originalUsers);
    dbLeadsStore.splice(0, dbLeadsStore.length, ...originalLeads);
    Object.assign(dbPool, originalDbPool);
  }
});

test('reconcileCallActivities prevents duplicate call logs across consecutive fetches', () => {
  const originalCalls = [...dbCallActivitiesStore];
  try {
    dbCallActivitiesStore.length = 0;

    const nowIso = new Date().toISOString();
    dbCallActivitiesStore.push({
      id: 'call_mem_123',
      leadId: '10',
      leadPhone: '9876543210',
      leadName: 'John Doe',
      telecallerId: '5',
      telecallerName: 'Telecaller',
      outcome: 'CONNECTED',
      durationSeconds: 45,
      remarks: 'Follow up required',
      nextAction: 'FOLLOW_UP',
      calledAt: nowIso,
    });

    const dbRow = {
      id: 42,
      lead_id: 10,
      lead_phone: '9876543210',
      first_name: 'John',
      last_name: 'Doe',
      telecaller_id: 5,
      telecaller_name: 'Telecaller',
      telecaller_email: 'telecaller@example.com',
      outcome: 'CONNECTED',
      duration_seconds: 45,
      remarks: 'Follow up required',
      next_action: 'FOLLOW_UP',
      called_at: new Date(nowIso),
    };

    leadsRoutes.reconcileCallActivities([dbRow]);
    assert.equal(dbCallActivitiesStore.length, 1);
    assert.equal(dbCallActivitiesStore[0].id, 'call_42');

    leadsRoutes.reconcileCallActivities([dbRow]);
    assert.equal(dbCallActivitiesStore.length, 1, 'Repeated fetch should not duplicate calls');

    const dbRow2 = {
      id: 43,
      lead_id: 11,
      lead_phone: '9876543211',
      first_name: 'Jane',
      last_name: 'Smith',
      telecaller_id: 5,
      telecaller_name: 'Telecaller',
      telecaller_email: 'telecaller@example.com',
      outcome: 'INTERESTED',
      duration_seconds: 120,
      remarks: 'Quote sent',
      next_action: 'MEETING',
      called_at: new Date(),
    };
    leadsRoutes.reconcileCallActivities([dbRow2, dbRow]);
    assert.equal(dbCallActivitiesStore.length, 2);

    leadsRoutes.reconcileCallActivities([dbRow2, dbRow]);
    assert.equal(dbCallActivitiesStore.length, 2, 'Consecutive syncs must remain deduplicated');
  } finally {
    dbCallActivitiesStore.splice(0, dbCallActivitiesStore.length, ...originalCalls);
  }
});

test('reconcileCallActivities deduplicates timezone offset (5.5hr) and mapped outcome (FOLLOW_UP to CONNECTED)', () => {
  const originalCalls = [...dbCallActivitiesStore];
  try {
    dbCallActivitiesStore.length = 0;

    const localUtcIso = '2026-10-12T11:48:00.000Z';
    dbCallActivitiesStore.push({
      id: 'call_mem_random999',
      leadId: '5',
      leadPhone: '+91 9859291501',
      leadName: 'Vikas Singh',
      telecallerId: '5',
      telecallerName: 'thava vishwa',
      outcome: 'FOLLOW_UP',
      durationSeconds: 120,
      remarks: 'Call logged.',
      calledAt: localUtcIso,
    });

    const dbUtcIso = '2026-10-12T06:18:00.000Z'; 
    const dbRow = {
      id: 37,
      lead_id: 5,
      lead_phone: '+91 9859291501',
      first_name: 'Vikas',
      last_name: 'Singh',
      telecaller_id: 5,
      telecaller_name: 'thava vishwa',
      outcome: 'CONNECTED', 
      duration_seconds: 120,
      remarks: 'Call logged.',
      called_at: new Date(dbUtcIso),
    };

    leadsRoutes.reconcileCallActivities([dbRow]);

    assert.equal(dbCallActivitiesStore.length, 1, '5.5h timezone offset and mapped outcome must be deduplicated into 1 record');
    assert.equal(dbCallActivitiesStore[0].id, 'call_37');
  } finally {
    dbCallActivitiesStore.splice(0, dbCallActivitiesStore.length, ...originalCalls);
  }
});

test('reconcileCallActivities maps QUALIFIED outcome to PAID in memory and API responses', () => {
  const originalCalls = [...dbCallActivitiesStore];
  try {
    dbCallActivitiesStore.length = 0;

    const dbRow = {
      id: 88,
      lead_id: 15,
      lead_phone: '+91 9123456789',
      first_name: 'Anand',
      last_name: 'Kumar',
      telecaller_id: 2,
      telecaller_name: 'thava vishwa',
      outcome: 'QUALIFIED',
      duration_seconds: 180,
      remarks: 'Lead paid via card',
      called_at: new Date(),
    };

    leadsRoutes.reconcileCallActivities([dbRow]);

    assert.equal(dbCallActivitiesStore.length, 1);
    assert.equal(dbCallActivitiesStore[0].outcome, 'PAID', 'QUALIFIED outcome must be mapped to PAID');
  } finally {
    dbCallActivitiesStore.splice(0, dbCallActivitiesStore.length, ...originalCalls);
  }
});


