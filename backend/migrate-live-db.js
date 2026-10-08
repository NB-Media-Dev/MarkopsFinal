
const mysql = require('mysql2/promise');

require('dotenv').config();
const DB_URL = process.env.DATABASE_URL?.replace(/[?&]ssl-mode=[^&]*/i, '').replace(/\?$/, '');

async function run(conn, sql, label) {
  try {
    await conn.query(sql);
    console.log(`  ✅ ${label}`);
  } catch (e) {
    if (e.message.includes('Duplicate column') || e.message.includes('already exists')) {
      console.log(`  ⏩ ${label} (already exists)`);
    } else {
      console.log(`  ❌ ${label}: ${e.message}`);
    }
  }
}

(async () => {
  console.log('\n🔌 Connecting to live Aiven DB...');
  const conn = await mysql.createConnection({
    uri: DB_URL,
    ssl: { rejectUnauthorized: false },
    multipleStatements: true,
  });
  console.log('✅ Connected!\n');

  await conn.query('SET FOREIGN_KEY_CHECKS = 0');

 
  console.log('📋 Patching `tasks` table...');
  await run(conn, `ALTER TABLE tasks ADD COLUMN package_name VARCHAR(100) DEFAULT 'Careermate'`, 'tasks.package_name');
  await run(conn, `ALTER TABLE tasks ADD COLUMN attachment_url LONGTEXT DEFAULT NULL`, 'tasks.attachment_url');
  await run(conn, `ALTER TABLE tasks ADD COLUMN attachment_name VARCHAR(255) DEFAULT NULL`, 'tasks.attachment_name');
  await run(conn, `ALTER TABLE tasks ADD COLUMN content LONGTEXT DEFAULT NULL`, 'tasks.content');
  await run(conn, `ALTER TABLE tasks ADD COLUMN reviewer_feedback TEXT DEFAULT NULL`, 'tasks.reviewer_feedback');
 
  await run(conn,
    `ALTER TABLE tasks MODIFY COLUMN status ENUM('DRAFT','ASSIGNED','ACCEPTED','IN_PROGRESS','SUBMITTED','REDESIGN_REQUIRED','APPROVED') NOT NULL DEFAULT 'ASSIGNED'`,
    'tasks.status ENUM extended'
  );


  console.log('\n👥 Patching `leads` table...');
  await run(conn, `ALTER TABLE leads ADD COLUMN creator_id INT DEFAULT NULL`, 'leads.creator_id');
  await run(conn, `ALTER TABLE leads ADD COLUMN creator_name VARCHAR(100) DEFAULT NULL`, 'leads.creator_name');
  await run(conn, `ALTER TABLE leads ADD COLUMN creator_email VARCHAR(150) DEFAULT NULL`, 'leads.creator_email');
  await run(conn, `ALTER TABLE leads ADD COLUMN campaign_name VARCHAR(255) DEFAULT NULL`, 'leads.campaign_name');
  
  await run(conn,
    `ALTER TABLE leads MODIFY COLUMN status ENUM('NEW','ASSIGNED','CONTACTED','INTERESTED','NOT_INTERESTED','QUALIFIED','CONVERTED','LOST') NOT NULL DEFAULT 'NEW'`,
    'leads.status ENUM'
  );
  
  await run(conn, `ALTER TABLE leads MODIFY COLUMN last_name VARCHAR(100) DEFAULT NULL`, 'leads.last_name nullable');
  await run(conn, `ALTER TABLE leads MODIFY COLUMN email VARCHAR(191) DEFAULT NULL`, 'leads.email nullable');

  
  console.log('\n🔔 Patching `notifications` table...');
  await run(conn, `ALTER TABLE notifications ADD COLUMN target_route VARCHAR(255) DEFAULT NULL`, 'notifications.target_route');
  
  await run(conn,
    `ALTER TABLE notifications MODIFY COLUMN user_id INT NOT NULL`,
    'notifications.user_id'
  );


  console.log('\n📣 Patching `campaigns` table...');
  await run(conn, `ALTER TABLE campaigns ADD COLUMN spend DECIMAL(12,2) NOT NULL DEFAULT 0.00`, 'campaigns.spend');
  await run(conn, `ALTER TABLE campaigns ADD COLUMN leads_count INT NOT NULL DEFAULT 0`, 'campaigns.leads_count');
  await run(conn, `ALTER TABLE campaigns ADD COLUMN product_id VARCHAR(100) DEFAULT 'pkg_careermate'`, 'campaigns.product_id');

  await run(conn, `ALTER TABLE campaigns MODIFY COLUMN start_date DATE DEFAULT NULL`, 'campaigns.start_date nullable');
 
  await run(conn, `ALTER TABLE campaigns MODIFY COLUMN owner_id INT DEFAULT NULL`, 'campaigns.owner_id nullable');

 
  console.log('\n📢 Patching `ads` table...');
  await run(conn, `ALTER TABLE ads ADD COLUMN platform VARCHAR(50) DEFAULT 'Meta'`, 'ads.platform');
  await run(conn, `ALTER TABLE ads ADD COLUMN spend DECIMAL(12,2) NOT NULL DEFAULT 0.00`, 'ads.spend');
  await run(conn, `ALTER TABLE ads ADD COLUMN impressions INT NOT NULL DEFAULT 0`, 'ads.impressions');
  await run(conn, `ALTER TABLE ads ADD COLUMN clicks INT NOT NULL DEFAULT 0`, 'ads.clicks');
  await run(conn, `ALTER TABLE ads ADD COLUMN leads_count INT NOT NULL DEFAULT 0`, 'ads.leads_count');

  await run(conn, `ALTER TABLE ads MODIFY COLUMN campaign_id INT DEFAULT NULL`, 'ads.campaign_id nullable');


  console.log('\n📦 Ensuring `packages` table schema...');
  await run(conn, `
    CREATE TABLE IF NOT EXISTS packages (
      id INT NOT NULL AUTO_INCREMENT,
      product_id VARCHAR(100) NOT NULL,
      name VARCHAR(255) NOT NULL,
      image_url LONGTEXT DEFAULT NULL,
      price DECIMAL(10,2) DEFAULT NULL,
      description TEXT DEFAULT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
      created_by INT DEFAULT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_packages_product (product_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `, 'packages table');


  console.log('\n👤 Checking `users` table...');
  await run(conn, `ALTER TABLE users MODIFY COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1`, 'users.is_active');

  console.log('\n🌱 Seeding roles...');
  await run(conn, `
    INSERT INTO roles (id, name, code, description) VALUES
    (1, 'Administrator', 'ADMINISTRATOR', 'Full System Access'),
    (2, 'Marketing Manager', 'MARKETING_MANAGER', 'Campaign Operations'),
    (3, 'Digital Marketing', 'DIGITAL_MARKETING', 'Ad Operations'),
    (4, 'Designer', 'DESIGNER', 'Asset Design'),
    (5, 'Telecaller', 'TELECALLER', 'Lead Telecalling'),
    (6, 'Business Development Manager', 'BDM', 'Package Task Management & Designer Collaboration')
    ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description)
  `, 'roles seed');

  
  console.log('\n🌱 Seeding teams...');
  await run(conn, `
    INSERT INTO teams (id, name, description) VALUES
    (1, 'System Administration', 'Core administrative operations'),
    (2, 'Marketing Operations', 'Campaigns & Ads'),
    (3, 'Design & Creative', 'Asset creation and branding'),
    (4, 'Telecalling Team', 'Outreach and conversions'),
    (5, 'Business Development', 'Package and business development')
    ON DUPLICATE KEY UPDATE name = VALUES(name)
  `, 'teams seed');

  console.log('\n🌱 Seeding admin user...');

  await run(conn, `
    INSERT INTO users (id, email, password_hash, full_name, role_id, team_id, department, is_active) VALUES
    (1, 'admin@markops.io', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQOEg6Lruj3BoB6tK3y/G', 'System Administrator', 1, 1, 'Executive Operations', 1)
    ON DUPLICATE KEY UPDATE
      password_hash = VALUES(password_hash),
      full_name = VALUES(full_name),
      role_id = VALUES(role_id),
      is_active = VALUES(is_active)
  `, 'admin user seed');

  await conn.query('SET FOREIGN_KEY_CHECKS = 1');


  console.log('\n🔍 Final verification...');
  const checks = [
    ['tasks',         ['id','title','content','package_name','attachment_url','attachment_name','reviewer_feedback']],
    ['leads',         ['id','creator_id','creator_name','creator_email','campaign_name']],
    ['notifications', ['id','target_route']],
    ['campaigns',     ['id','spend','leads_count','product_id']],
    ['ads',           ['id','platform','spend','impressions','clicks','leads_count']],
    ['packages',      ['id','product_id','name','price','status']],
  ];

  for (const [table, expectedCols] of checks) {
    const [cols] = await conn.query('SHOW COLUMNS FROM ' + table);
    const existingCols = cols.map(c => c.Field);
    const missing = expectedCols.filter(c => !existingCols.includes(c));
    if (missing.length === 0) {
      console.log(`  ✅ ${table}: all required columns present`);
    } else {
      console.log(`  ❌ ${table}: STILL MISSING → ${missing.join(', ')}`);
    }
  }

  await conn.end();
  console.log('\n✅ Migration complete!\n');
})();
