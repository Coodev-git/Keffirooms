import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { config } from '../config/index.js';

const { Pool } = pg;
const globalForPrisma = globalThis;

function needsSsl(url) {
  return /neon\.tech/i.test(url)
    || /sslmode=require/i.test(url)
    || process.env.DATABASE_SSL === 'true';
}

function createPgPool() {
  return new Pool({
    connectionString: config.databaseUrl,
    ssl: needsSsl(config.databaseUrl) ? { rejectUnauthorized: false } : undefined,
    max: 20,
    idleTimeoutMillis: 30000,
  });
}

/** Shared PostgreSQL pool — used by Prisma adapter and raw SQL queries */
export const pgPool = globalForPrisma.__keffiroomsPgPool ?? createPgPool();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__keffiroomsPgPool = pgPool;
}

pgPool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err);
});

function createPrismaClient() {
  const adapter = new PrismaPg(pgPool);
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
}

/** Singleton Prisma client backed by the shared pg pool (Neon-ready) */
export const prisma = globalForPrisma.__keffiroomsPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__keffiroomsPrisma = prisma;
}

export async function disconnectPrisma() {
  await prisma.$disconnect();
  await pgPool.end();
}
