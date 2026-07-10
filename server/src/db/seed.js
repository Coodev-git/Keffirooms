import bcrypt from 'bcryptjs';
import { pool, query } from './pool.js';
import { config } from '../config/index.js';

async function seed() {
  console.log('Seeding database...');

  const existing = await query(
    'SELECT id FROM users WHERE email = $1 OR role = $2 LIMIT 1',
    [config.admin.email, 'admin']
  );

  if (existing.rows.length) {
    console.log('Admin user already exists — skipping seed.');
    await pool.end();
    return;
  }

  const hash = await bcrypt.hash(config.admin.password, 12);
  const { rows } = await query(
    `INSERT INTO users (email, phone, password_hash, role, name, email_verified)
     VALUES ($1, $2, $3, 'admin', $4, TRUE)
     RETURNING id`,
    [config.admin.email, config.admin.phone, hash, config.admin.name]
  );

  console.log(`Created admin user: ${config.admin.email}`);
  console.log('Change the default password immediately after first login.');

  await pool.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
