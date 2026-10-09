const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config();

const mysqlModule = require('mysql2/promise');

let activePool = null;

const dbPool = {
  isConnected: () => Boolean(activePool),
  query: async (...args) => {
    if (!activePool) return [[]];
    try {
      const res = await activePool.query(...args);
      return res;
    } catch (e) {
      console.log('[MySQL Pool Query Notice]:', e?.message || e);
      return [[]];
    }
  },
  queryStrict: async (...args) => {
    if (!activePool) throw new Error('Database pool not connected');
    return activePool.query(...args);
  },
  getConnection: async (...args) => {
    if (!activePool) throw new Error('Database pool not connected');
    return activePool.getConnection(...args);
  },
};

const ROLE_MAP = {
  ADMINISTRATOR: { id: 1, name: 'Administrator', code: 'ADMINISTRATOR' },
  MARKETING_MANAGER: { id: 2, name: 'Marketing Manager', code: 'MARKETING_MANAGER' },
  DIGITAL_MARKETING: { id: 3, name: 'Digital Marketing', code: 'DIGITAL_MARKETING' },
  DESIGNER: { id: 4, name: 'Designer', code: 'DESIGNER' },
  TELECALLER: { id: 5, name: 'Telecaller', code: 'TELECALLER' },
  BDM: { id: 6, name: 'Business Development Manager', code: 'BDM' },
};

async function initDatabase() {
  try {
    let pool = null;
    const dbUrl = process.env.DATABASE_URL;
    let connected = false;

    if (dbUrl) {
      try {
        const cleanUrl = dbUrl.replace(/[?&]ssl-mode=[^&]*/i, '').replace(/\?$/, '');
        pool = mysqlModule.createPool({ uri: cleanUrl, ssl: { rejectUnauthorized: false }, connectTimeout: 10000, waitForConnections: true, connectionLimit: 10 });
        const conn = await pool.getConnection();
        conn.release();
        connected = true;
      } catch (err) {
        console.log('[MySQL DB Notice] Failed URI connection, trying host/port fallback:', err?.message || err);
      }
    }

    if (!connected) {
      pool = mysqlModule.createPool({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 3303,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || 'Ratheesh@17',
        database: process.env.DB_NAME || 'markops',
        connectTimeout: 10000,
        waitForConnections: true,
        connectionLimit: 10,
      });
      const conn = await pool.getConnection();
      conn.release();
      connected = true;
    }

    activePool = pool;
    console.log('[MySQL DB] Successfully connected to MySQL pool.');

    try { await activePool.query('ALTER TABLE notifications ADD COLUMN target_route VARCHAR(255) DEFAULT NULL'); } catch (e) {}
    try { await activePool.query('ALTER TABLE leads ADD COLUMN package_name VARCHAR(255) DEFAULT NULL'); } catch (e) {}
    try { await activePool.query('ALTER TABLE leads ADD COLUMN product_id VARCHAR(100) DEFAULT NULL'); } catch (e) {}
    try { await activePool.query('ALTER TABLE leads ADD COLUMN product_name VARCHAR(255) DEFAULT NULL'); } catch (e) {}
    try { await activePool.query('ALTER TABLE leads ADD COLUMN remarks TEXT DEFAULT NULL'); } catch (e) {}
    try { await activePool.query('ALTER TABLE leads ADD COLUMN notes TEXT DEFAULT NULL'); } catch (e) {}
    try { await activePool.query('ALTER TABLE leads ADD COLUMN assigned_telecaller_id INT DEFAULT NULL'); } catch (e) {}
    try { await activePool.query('ALTER TABLE leads ADD COLUMN assignment_status VARCHAR(50) DEFAULT "UNASSIGNED"'); } catch (e) {}
    try { await activePool.query('ALTER TABLE leads ADD COLUMN creator_id INT DEFAULT NULL'); } catch (e) {}
    try { await activePool.query('ALTER TABLE leads ADD COLUMN creator_name VARCHAR(255) DEFAULT NULL'); } catch (e) {}
    try { await activePool.query('ALTER TABLE leads ADD COLUMN creator_email VARCHAR(255) DEFAULT NULL'); } catch (e) {}
    try { await activePool.query('ALTER TABLE leads ADD COLUMN ad_id INT DEFAULT NULL'); } catch (e) {}
    try { await activePool.query('ALTER TABLE leads ADD COLUMN campaign_id VARCHAR(100) DEFAULT NULL'); } catch (e) {}
    try { await activePool.query('ALTER TABLE leads ADD COLUMN campaign_name VARCHAR(255) DEFAULT NULL'); } catch (e) {}
    try { await activePool.query('ALTER TABLE ads ADD COLUMN platform_ad_id VARCHAR(100) DEFAULT NULL'); } catch (e) {}
    try { await activePool.query('ALTER TABLE ads ADD COLUMN created_by INT DEFAULT NULL'); } catch (e) {}
    try { await activePool.query('UPDATE ads a JOIN campaigns c ON c.id = a.campaign_id SET a.created_by = c.owner_id WHERE a.created_by IS NULL'); } catch (e) {}
    try { await activePool.query('CREATE INDEX idx_ads_created_by ON ads (created_by)'); } catch (e) {}
    try { await activePool.query('ALTER TABLE ads ADD CONSTRAINT fk_ads_creator FOREIGN KEY (created_by) REFERENCES users (id)'); } catch (e) {}
    try { await activePool.query('ALTER TABLE ads ADD COLUMN design_id VARCHAR(100) DEFAULT NULL'); } catch (e) {}
    try { await activePool.query('ALTER TABLE ads ADD COLUMN design_image_url TEXT DEFAULT NULL'); } catch (e) {}
    try { await activePool.query('ALTER TABLE ads ADD COLUMN ad_creative_url TEXT DEFAULT NULL'); } catch (e) {}
    try { await activePool.query('ALTER TABLE ads ADD COLUMN impressions INT DEFAULT 0'); } catch (e) {}
    try { await activePool.query('ALTER TABLE ads ADD COLUMN clicks INT DEFAULT 0'); } catch (e) {}
    try { await activePool.query('ALTER TABLE ads ADD COLUMN leads_count INT DEFAULT 0'); } catch (e) {}
    try { await activePool.query('ALTER TABLE ads ADD COLUMN spend DECIMAL(12,2) DEFAULT 0.00'); } catch (e) {}
    try { await activePool.query('ALTER TABLE ads ADD COLUMN reach INT DEFAULT 0'); } catch (e) {}
    try { await activePool.query('ALTER TABLE campaigns ADD COLUMN product_id VARCHAR(100) DEFAULT NULL'); } catch (e) {}
    try { await activePool.query('ALTER TABLE campaigns ADD COLUMN leads_count INT DEFAULT 0'); } catch (e) {}
    try { await activePool.query('ALTER TABLE campaigns ADD COLUMN spend DECIMAL(12,2) DEFAULT 0.00'); } catch (e) {}
    try { await activePool.query('ALTER TABLE campaigns ADD COLUMN target_cpl DECIMAL(10,2) DEFAULT 0.00'); } catch (e) {}
  } catch (err) {
    console.log('[MySQL DB Notice] MySQL unreachable, operating in high-performance memory store mode:', err?.message || err);
    activePool = null;
  }
}

const dbUsersStore = [];
const dbTasksStore = [];
const dbCampaignsStore = [];
const dbAdsStore = [];
const dbLeadsStore = [];
const dbCallActivitiesStore = [];
const dbFollowUpsStore = [];
const dbTransactionsStore = [];
const dbNotificationsStore = [];
const dbPackagesStore = [];
const dbCommonTargetStore = {
  dailyCallsTarget: 30,
  dailyInterestedTarget: 5,
  dailyDurationTargetSeconds: 3600,
  updatedBy: 'Marketing Manager',
  updatedAt: new Date().toISOString(),
};
const dbTelecallerTargetsStore = [];

module.exports = {
  dbPool,
  ROLE_MAP,
  initDatabase,
  dbUsersStore,
  dbTasksStore,
  dbCampaignsStore,
  dbAdsStore,
  dbLeadsStore,
  dbCallActivitiesStore,
  dbFollowUpsStore,
  dbTransactionsStore,
  dbNotificationsStore,
  dbPackagesStore,
  dbCommonTargetStore,
  dbTelecallerTargetsStore,
};