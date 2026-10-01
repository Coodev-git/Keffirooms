import { execSync } from 'child_process';
import path from 'path';
import 'dotenv/config'; // Ensure env vars are loaded if run locally

function runBackup() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('⚠️  DATABASE_URL environment variable is required to run a backup.');
    process.exit(1);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `keffirooms-backup-${timestamp}.dump`;
  const dumpPath = path.resolve(process.cwd(), filename);

  console.log(`Starting backup of KeffiRooms database...`);
  console.log(`Target: ${dumpPath}`);
  console.log(`(This requires pg_dump to be installed and available in your PATH)`);

  try {
    // -F c: custom format (compressed, suitable for pg_restore)
    // --no-owner --no-acl: portable across different host environments
    const cmd = `pg_dump "${dbUrl}" -F c --no-owner --no-acl -f "${dumpPath}"`;
    
    execSync(cmd, { stdio: 'inherit' });
    console.log(`\n✅ Backup completed successfully: ${filename}`);
    console.log(`To restore: pg_restore -d "postgresql://user:pass@host/db" --no-owner --no-acl ${filename}`);
  } catch (err) {
    console.error('\n❌ Backup failed.');
    console.error('Make sure PostgreSQL client tools (pg_dump) are installed.');
    console.error(err.message);
    process.exit(1);
  }
}

runBackup();
