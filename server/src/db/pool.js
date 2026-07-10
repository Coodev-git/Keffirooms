import { prisma, pgPool } from './prisma.js';

/** PostgreSQL-compatible query wrapper (pg driver — correct enum/json binding) */
export async function query(text, params = []) {
  return pgPool.query(text, params);
}

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
  end: () => disconnectAll(),
};

async function disconnectAll() {
  await prisma.$disconnect();
  await pgPool.end();
}
