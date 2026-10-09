const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
require('dotenv').config();

const mysql = require('mysql2/promise');

async function runAlterTables() {
  console.log('Connecting to MySQL database...');
  let connection = null;

  try {
    const dbUrl = process.env.DATABASE_URL;
    if (dbUrl) {
      const cleanUrl = dbUrl.replace(/[?&]ssl-mode=[^&]*/i, '').replace(/\?$/, '');
      connection = await mysql.createConnection({ uri: cleanUrl, ssl: { rejectUnauthorized: false } });
    } else {
      connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 3303,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || 'Ratheesh@17',
        database: process.env.DB_NAME || 'markops',
      });
    }

    console.log('Connected to MySQL successfully. Running ALTER TABLE statements...');

    const columnsToAdd = [

      { table: 'leads', col: 'assigned_telecaller_id', type: 'INT DEFAULT NULL' },
      { table: 'leads', col: 'assignment_status', type: 'VARCHAR(50) DEFAULT "UNASSIGNED"' },
      { table: 'leads', col: 'creator_id', type: 'INT DEFAULT NULL' },
      { table: 'leads', col: 'creator_name', type: 'VARCHAR(255) DEFAULT NULL' },
      { table: 'leads', col: 'creator_email', type: 'VARCHAR(255) DEFAULT NULL' },
      { table: 'leads', col: 'package_name', type: 'VARCHAR(255) DEFAULT NULL' },
      { table: 'leads', col: 'product_id', type: 'VARCHAR(100) DEFAULT NULL' },
      { table: 'leads', col: 'product_name', type: 'VARCHAR(255) DEFAULT NULL' },
      { table: 'leads', col: 'remarks', type: 'TEXT DEFAULT NULL' },
      { table: 'leads', col: 'notes', type: 'TEXT DEFAULT NULL' },
      { table: 'leads', col: 'ad_id', type: 'INT DEFAULT NULL' },
      { table: 'leads', col: 'campaign_id', type: 'VARCHAR(100) DEFAULT NULL' },
      { table: 'leads', col: 'campaign_name', type: 'VARCHAR(255) DEFAULT NULL' },

      { table: 'ads', col: 'platform_ad_id', type: 'VARCHAR(100) DEFAULT NULL' },
      { table: 'ads', col: 'created_by', type: 'INT DEFAULT NULL' },
      { table: 'ads', col: 'design_id', type: 'VARCHAR(100) DEFAULT NULL' },
      { table: 'ads', col: 'design_image_url', type: 'TEXT DEFAULT NULL' },
      { table: 'ads', col: 'ad_creative_url', type: 'TEXT DEFAULT NULL' },
      { table: 'ads', col: 'impressions', type: 'INT DEFAULT 0' },
      { table: 'ads', col: 'clicks', type: 'INT DEFAULT 0' },
      { table: 'ads', col: 'leads_count', type: 'INT DEFAULT 0' },
      { table: 'ads', col: 'spend', type: 'DECIMAL(12,2) DEFAULT 0.00' },
      { table: 'ads', col: 'reach', type: 'INT DEFAULT 0' },

      { table: 'campaigns', col: 'product_id', type: 'VARCHAR(100) DEFAULT NULL' },
      { table: 'campaigns', col: 'leads_count', type: 'INT DEFAULT 0' },
      { table: 'campaigns', col: 'spend', type: 'DECIMAL(12,2) DEFAULT 0.00' },
      { table: 'campaigns', col: 'target_cpl', type: 'DECIMAL(10,2) DEFAULT 0.00' },

      { table: 'notifications', col: 'target_route', type: 'VARCHAR(255) DEFAULT NULL' },
    ];

    for (const item of columnsToAdd) {
      try {
        const [existing] = await connection.query(`
          SELECT COLUMN_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = ?
            AND COLUMN_NAME = ?
        `, [item.table, item.col]);

        if (existing.length === 0) {
          console.log(`Adding column ${item.table}.${item.col}...`);
          await connection.query(`ALTER TABLE \`${item.table}\` ADD COLUMN \`${item.col}\` ${item.type}`);
          console.log(`✓ Added column ${item.table}.${item.col}`);
        } else {
          console.log(`- Column ${item.table}.${item.col} already exists.`);
        }
      } catch (colErr) {
        console.warn(`! Error altering ${item.table}.${item.col}:`, colErr.message);
      }
    }

    console.log('All ALTER TABLE checks completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err.message);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

runAlterTables();
