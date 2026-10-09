const test = require('node:test');
const assert = require('node:assert/strict');
const { dbLeadsStore, dbPool, dbUsersStore } = require('../db');
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
