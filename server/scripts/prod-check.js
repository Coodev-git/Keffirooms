#!/usr/bin/env node
/**
 * Validate production environment without starting the server.
 * Usage: NODE_ENV=production node scripts/prod-check.js
 * Or set vars in server/.env with NODE_ENV=production temporarily.
 */
import { getProductionReadiness } from '../src/config/validateProduction.js';
import { config } from '../src/config/index.js';
import { isCloudinaryConfigured, isGoogleConfigured, isSmtpConfigured } from '../src/config/index.js';

const result = getProductionReadiness();

console.log(`\nKeffiRooms production check (${config.env})\n`);
console.log(`  APP_URL:     ${config.appUrl}`);
console.log(`  CLIENT_URL:  ${config.clientUrl}`);
console.log(`  Database:    ${config.databaseUrl ? '(set)' : 'MISSING'}`);
console.log(`  SMTP:        ${isSmtpConfigured() ? 'ok' : 'missing'}`);
console.log(`  Cloudinary:  ${isCloudinaryConfigured() ? 'ok' : 'missing'}`);
console.log(`  Google OAuth:${isGoogleConfigured() ? 'ok' : 'missing'}\n`);

if (result.errors.length) {
  console.error('❌ Blockers (fix before deploy):\n');
  result.errors.forEach((e) => console.error(`   • ${e}`));
}
if (result.warnings.length) {
  console.warn('\n⚠️  Warnings:\n');
  result.warnings.forEach((w) => console.warn(`   • ${w}`));
}

if (result.ok) {
  console.log('\n✅ Production configuration looks good. Ready to deploy.\n');
  process.exit(0);
}

console.error('\n❌ Not production-ready yet.\n');
process.exit(1);
