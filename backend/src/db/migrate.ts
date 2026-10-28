import { initDb, closeDb } from './index.js';

async function main() {
  console.log('🔄 Running database migrations...');
  try {
    await initDb();
    console.log('✅ Migrations applied successfully.');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await closeDb();
  }
}

main();
