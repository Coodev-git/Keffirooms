import pg from 'pg';
import { config } from '../config/index.js';

const { Pool } = pg;
const globalForPg = globalThis;

function needsSsl(url) {
  // Enable SSL when the connection string says so or DATABASE_SSL=true is set.
  // Never matches on a provider name — works with any PostgreSQL host.
  return /sslmode=require/i.test(url || '')
    || process.env.DATABASE_SSL === 'true';
}

function createPgPool() {
  const p = new Pool({
    connectionString: config.databaseUrl,
    ssl: needsSsl(config.databaseUrl) ? { rejectUnauthorized: false } : undefined,
    max: parseInt(process.env.DB_POOL_MAX || '20', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  p.on('error', (err) => {
    console.error('Unexpected idle client PostgreSQL pool error:', err.message);
  });

  return p;
}

/** Shared PostgreSQL pool instance */
export const pgPool = globalForPg.__keffiroomsPgPool ?? createPgPool();

if (process.env.NODE_ENV !== 'production') {
  globalForPg.__keffiroomsPgPool = pgPool;
}

/** Standard query wrapper */
export async function query(text, params = []) {
  return pgPool.query(text, params);
}

/** Execute a block within a database transaction */
export async function withTransaction(fn) {
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/** Legacy pool interface for health checks and scripts */
export const pool = {
  query: (text, params = []) => query(text, params),
  connect: () => pgPool.connect(),
  end: () => pgPool.end(),
};

