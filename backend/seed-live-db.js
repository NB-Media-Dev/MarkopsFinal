require('dotenv').config();
const mysql = require('mysql2/promise');
const DB_URL = process.env.DATABASE_URL?.replace(/[?&]ssl-mode=[^&]*/i, '').replace(/\?$/, '');

(async () => {
  const conn = await mysql.createConnection({ uri: DB_URL, ssl: { rejectUnauthorized: false } });
  console.log('Connected!');

 
  const tables = ['roles', 'teams', 'users', 'campaigns', 'packages', 'ads', 'tasks', 'leads','product_catalog'];
  for (const t of tables) {
    try {
      await conn.query(`ALTER TABLE \`${t}\` MODIFY \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`);
      console.log(`Fixed updated_at for ${t}`);
    } catch (e) {
      console.log(`Skip ${t}: ${e.message}`);
    }
  }
  
   try {
    await conn.query(`
     CREATE TABLE product_catalog (
  id VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  short_name VARCHAR(100) NOT NULL,
  display_title VARCHAR(255) NOT NULL,
  tagline VARCHAR(255) NOT NULL,
  card_tagline VARCHAR(255) NOT NULL,
  icon VARCHAR(100) NOT NULL,
  badge_color VARCHAR(50) NOT NULL,
  card_theme VARCHAR(50) NOT NULL,
  logo_url VARCHAR(500) NOT NULL,
  card_image_url VARCHAR(500) NOT NULL,
  hero_image_url VARCHAR(500) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_product_catalog_short_name (short_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('Products table ensured');
  } catch (e) {
    console.log('Products table error:', e.message);
  }

  // Seed products
  try {
    await conn.query(`
     INSERT INTO product_catalog
  (id, name, short_name, display_title, tagline, card_tagline, icon, badge_color, card_theme, logo_url, card_image_url, hero_image_url, sort_order)
VALUES
  ('pkg_careermate', 'Vidhvaa CareerMate', 'Careermate', 'CareerMate', 'Learn • Grow • Build', 'CAREER & PLACEMENT SOLUTIONS', 'business_center', 'blue', 'careermate', '/vidhvaa-career-img.png', '/card-bg-careermate.jpg', '/careermate-hero-banner.jpg', 1),
  ('pkg_classmate', 'Vidhvaa Classmate', 'Classmate', 'Classmate', 'Learn • Discover • Excel', 'STUDENT & LEARNING SOLUTIONS', 'school', 'emerald', 'classmate', '/vidhvaa-class-img.png', '/card-bg-classmate.jpg', '/classmate-hero-banner.jpg', 2),
  ('pkg_jesus_messanger', 'Jesus the Messenger', 'Jesus the messanger', 'Jesus the Messenger', 'Share • Inspire • Empower', 'FAITH & MINISTRY SOLUTIONS', 'campaign', 'purple', 'jesus', '/jesus-img.png', '/card-bg-jesus.jpg', '/jesus-hero-banner.jpg', 3);
    `);
    console.log('Products seeded');
  } catch (e) {
    console.log('Products seed error:', e.message);
  }

 
  try {
    await conn.query(`
      INSERT INTO roles (id, name, code, description, created_at, updated_at) VALUES
      (1, 'Administrator', 'ADMINISTRATOR', 'Full System Access', NOW(), NOW()),
      (2, 'Marketing Manager', 'MARKETING_MANAGER', 'Campaign Operations', NOW(), NOW()),
      (3, 'Digital Marketing', 'DIGITAL_MARKETING', 'Ad Operations', NOW(), NOW()),
      (4, 'Designer', 'DESIGNER', 'Asset Design', NOW(), NOW()),
      (5, 'Telecaller', 'TELECALLER', 'Lead Telecalling', NOW(), NOW()),
      (6, 'Business Development Manager', 'BDM', 'Package Task Management', NOW(), NOW())
      ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description)
    `);
    console.log('Roles seeded');
  } catch (e) {
    console.log('Roles error:', e.message);
  }

 
  try {
    await conn.query(`
      INSERT INTO teams (id, name, description, created_at, updated_at) VALUES
      (1, 'System Administration', 'Core administrative operations', NOW(), NOW()),
      (2, 'Marketing Operations', 'Campaigns & Ads', NOW(), NOW()),
      (3, 'Design & Creative', 'Asset creation and branding', NOW(), NOW()),
      (4, 'Telecalling Team', 'Outreach and conversions', NOW(), NOW()),
      (5, 'Business Development', 'Package and business development', NOW(), NOW())
      ON DUPLICATE KEY UPDATE name = VALUES(name)
    `);
    console.log('Teams seeded');
  } catch (e) {
    console.log('Teams error:', e.message);
  }


  const hash = '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQOEg6Lruj3BoB6tK3y/G';
  try {
    await conn.query(`
      INSERT INTO users (id, email, password_hash, full_name, role_id, team_id, department, is_active, created_at, updated_at) VALUES
      (1, 'admin@markops.io', ?, 'System Administrator', 1, 1, 'Executive Operations', 1, NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        password_hash = VALUES(password_hash),
        full_name = VALUES(full_name),
        role_id = VALUES(role_id),
        is_active = VALUES(is_active),
        updated_at = NOW()
    `, [hash]);
    console.log('Admin user seeded');
  } catch (e) {
    console.log('Admin user error:', e.message);
  }

 
  const [roles] = await conn.query('SELECT id, name, code FROM roles ORDER BY id');
  console.log('\nRoles:', roles.map(r => `${r.id}:${r.code}`).join(', '));
  const [users] = await conn.query('SELECT id, email, full_name FROM users');
  console.log('Users:', users.map(u => u.email).join(', '));

  await conn.end();
  console.log('\nDone!');
})();


