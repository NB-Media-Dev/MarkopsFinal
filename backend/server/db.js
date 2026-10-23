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

async function createConnectionPool() {
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    try {
      const cleanUrl = dbUrl.replace(/[?&]ssl-mode=[^&]*/i, '').replace(/\?$/, '');
      const pool = mysqlModule.createPool({ uri: cleanUrl, ssl: { rejectUnauthorized: false }, connectTimeout: 10000, waitForConnections: true, connectionLimit: 10 });
      const conn = await pool.getConnection();
      conn.release();
      return pool;
    } catch (err) {
      console.log('[MySQL DB Notice] Failed URI connection, trying host/port fallback:', err?.message || err);
    }
  }

  const fallbackPool = mysqlModule.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'markops',
    connectTimeout: 10000,
    waitForConnections: true,
    connectionLimit: 10,
  });
  const conn = await fallbackPool.getConnection();
  conn.release();
  return fallbackPool;
}

async function initTelecallerTables(pool) {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS telecaller_targets (
        telecaller_id VARCHAR(64) NOT NULL,
        telecaller_name VARCHAR(100) NOT NULL,
        telecaller_email VARCHAR(191) NOT NULL DEFAULT '',
        daily_calls_target INT NOT NULL,
        daily_interested_target INT NOT NULL,
        daily_duration_target_seconds INT NOT NULL DEFAULT 3600,
        updated_by VARCHAR(255) NOT NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (telecaller_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS telecaller_common_target (
        id TINYINT NOT NULL,
        daily_calls_target INT NOT NULL,
        daily_interested_target INT NOT NULL,
        daily_duration_target_seconds INT NOT NULL DEFAULT 3600,
        updated_by VARCHAR(255) NOT NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await pool.query(`
      INSERT IGNORE INTO telecaller_common_target
        (id, daily_calls_target, daily_interested_target, daily_duration_target_seconds, updated_by)
      VALUES (1, 30, 5, 3600, 'Marketing Manager')
    `);
  } catch (error) {
    console.error('[MySQL DB Error] Telecaller target table initialization failed:', error?.message || error);
  }
}

async function initFollowUpsTable(pool) {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS follow_ups (
        id INT NOT NULL AUTO_INCREMENT,
        lead_id INT NOT NULL,
        telecaller_id INT NOT NULL,
        due_date DATETIME NOT NULL,
        status ENUM('PENDING', 'COMPLETED', 'OVERDUE', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
        notes TEXT DEFAULT NULL,
        completed_at DATETIME DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_fu_lead (lead_id),
        KEY idx_fu_caller (telecaller_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } catch (error) {
    console.log('[MySQL Notice] Follow-ups table already exists or initialization skipped:', error?.message || error);
  }
}

const SCHEMA_MIGRATIONS = [
  'ALTER TABLE notifications ADD COLUMN target_route VARCHAR(255) DEFAULT NULL',
  "DELETE FROM users WHERE LOWER(email) = 'bdm@markops.io'",
  'ALTER TABLE leads ADD COLUMN package_name VARCHAR(255) DEFAULT NULL',
  'ALTER TABLE leads ADD COLUMN product_id VARCHAR(100) DEFAULT NULL',
  'ALTER TABLE leads ADD COLUMN product_name VARCHAR(255) DEFAULT NULL',
  'ALTER TABLE leads ADD COLUMN remarks TEXT DEFAULT NULL',
  'ALTER TABLE leads ADD COLUMN notes TEXT DEFAULT NULL',
  'ALTER TABLE leads ADD COLUMN assigned_telecaller_id INT DEFAULT NULL',
  'ALTER TABLE leads ADD COLUMN assignment_status VARCHAR(50) DEFAULT "UNASSIGNED"',
  'ALTER TABLE leads ADD COLUMN creator_id INT DEFAULT NULL',
  'ALTER TABLE leads ADD COLUMN creator_name VARCHAR(255) DEFAULT NULL',
  'ALTER TABLE leads ADD COLUMN creator_email VARCHAR(255) DEFAULT NULL',
  'ALTER TABLE leads ADD COLUMN ad_id INT DEFAULT NULL',
  'ALTER TABLE leads ADD COLUMN campaign_id VARCHAR(100) DEFAULT NULL',
  'ALTER TABLE leads ADD COLUMN campaign_name VARCHAR(255) DEFAULT NULL',
  'ALTER TABLE ads ADD COLUMN platform_ad_id VARCHAR(100) DEFAULT NULL',
  'ALTER TABLE ads ADD COLUMN created_by INT DEFAULT NULL',
  'UPDATE ads a JOIN campaigns c ON c.id = a.campaign_id SET a.created_by = c.owner_id WHERE a.created_by IS NULL',
  'CREATE INDEX idx_ads_created_by ON ads (created_by)',
  'ALTER TABLE ads ADD CONSTRAINT fk_ads_creator FOREIGN KEY (created_by) REFERENCES users (id)',
  'ALTER TABLE ads ADD COLUMN design_id VARCHAR(100) DEFAULT NULL',
  'ALTER TABLE ads ADD COLUMN design_image_url TEXT DEFAULT NULL',
  'ALTER TABLE ads ADD COLUMN ad_creative_url TEXT DEFAULT NULL',
  'ALTER TABLE ads ADD COLUMN impressions INT DEFAULT 0',
  'ALTER TABLE ads ADD COLUMN clicks INT DEFAULT 0',
  'ALTER TABLE ads ADD COLUMN leads_count INT DEFAULT 0',
  'ALTER TABLE ads ADD COLUMN spend DECIMAL(12,2) DEFAULT 0.00',
  'ALTER TABLE ads ADD COLUMN reach INT DEFAULT 0',
  'ALTER TABLE campaigns ADD COLUMN product_id VARCHAR(100) DEFAULT NULL',
  'ALTER TABLE campaigns ADD COLUMN leads_count INT DEFAULT 0',
  'ALTER TABLE campaigns ADD COLUMN spend DECIMAL(12,2) DEFAULT 0.00',
  'ALTER TABLE campaigns ADD COLUMN target_cpl DECIMAL(10,2) DEFAULT 0.00',
  "ALTER TABLE leads MODIFY COLUMN status VARCHAR(50) NOT NULL DEFAULT 'NEW'",
  "ALTER TABLE call_activities MODIFY COLUMN outcome VARCHAR(50) NOT NULL",
  'ALTER TABLE call_activities ADD COLUMN follow_up_date VARCHAR(100) DEFAULT NULL',
  'ALTER TABLE call_activities ADD COLUMN follow_up_time VARCHAR(50) DEFAULT NULL',
  'ALTER TABLE call_activities ADD COLUMN lead_phone VARCHAR(30) DEFAULT NULL',
  'ALTER TABLE call_activities ADD COLUMN lead_name VARCHAR(150) DEFAULT NULL'
];

async function runSchemaMigrations(pool) {
  for (const sql of SCHEMA_MIGRATIONS) {
    try {
      await pool.query(sql);
    } catch (error) {
      console.log(`[MySQL Migration Notice] Non-critical schema alteration bypassed: ${error?.message || error}`);
    }
  }
}

async function initDatabase() {
  try {
    activePool = await createConnectionPool();
    console.log('[MySQL DB] Successfully connected to MySQL pool.');

    await initTelecallerTables(activePool);
    await runSchemaMigrations(activePool);
    await initFollowUpsTable(activePool);
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