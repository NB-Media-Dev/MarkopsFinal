
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log('DATABASE_URL is not set. Run the "set" command first.');
    process.exit(1);
  }

  const conn = await mysql.createConnection({
    uri: url.split('?')[0],
    ssl: { rejectUnauthorized: false },
    multipleStatements: true,
  });


  const [cols] = await conn.query(
    `SELECT TABLE_NAME AS t, COLUMN_TYPE AS ty FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'updated_at'
     AND DATA_TYPE IN ('datetime','timestamp')`
  );
  for (const c of cols) {
    const m = /\((\d+)\)/.exec(c.ty);
    const now = m ? `CURRENT_TIMESTAMP(${m[1]})` : 'CURRENT_TIMESTAMP';
    await conn.query(
      `ALTER TABLE \`${c.t}\` MODIFY \`updated_at\` ${c.ty} NOT NULL DEFAULT ${now} ON UPDATE ${now}`
    );
  }
  console.log('Fixed updated_at on', cols.length, 'tables');

 
  const sql = fs
    .readFileSync(path.join(__dirname, 'prisma', 'seed.sql'), 'utf8')
    .replace(/^\s*USE\s+`?markops`?\s*;/gim, '');
  await conn.query(sql);

  const [rows] = await conn.query('SELECT email FROM users');
  console.log('Seed finished. Users in database:', rows.map((r) => r.email));
  await conn.end();
})().catch((e) => {
  console.log('Seed failed:', e.message);
  process.exit(1);
});