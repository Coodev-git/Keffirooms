import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { config } from '../config/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

function needsSsl(url) {
  return /neon\.tech/i.test(url)
    || /sslmode=require/i.test(url)
    || process.env.DATABASE_SSL === 'true';
}

async function migrate() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  const pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: needsSsl(config.databaseUrl) ? { rejectUnauthorized: false } : undefined,
  });

  console.log('Running database migrations...');
  try {
    await pool.query(sql);
    console.log('Migrations complete.');
  } finally {
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
