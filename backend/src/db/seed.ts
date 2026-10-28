import { config } from '../config.js';
import { query, initDb, closeDb } from './index.js';
import { hashPassword } from '../auth/password.js';

async function seed() {
  if (config.NODE_ENV === 'production') {
    console.error('⛔ FATAL: Cannot run seed script in production environment!');
    process.exit(1);
  }

  console.log('🌱 Seeding synthetic demo users for local development...');
  await initDb();

  const demoUsers = [
    {
      email: 'supplier@demo.com',
      password: 'password1234',
      displayName: 'Alice Supplier',
      organisation: 'Acme Components Ltd',
      role: 'SUPPLIER',
    },
    {
      email: 'buyer@demo.com',
      password: 'password1234',
      displayName: 'Bob Buyer',
      organisation: 'Global Retail Corp',
      role: 'BUYER',
    },
    {
      email: 'financier@demo.com',
      password: 'password1234',
      displayName: 'Charlie Financier',
      organisation: 'Alpha Capital Finance',
      role: 'FINANCIER',
    },
  ];

  for (const user of demoUsers) {
    const existing = await query('SELECT id FROM users WHERE email = $1', [user.email]);
    if (existing.rows.length === 0) {
      const passwordHash = await hashPassword(user.password);
      await query(
        `INSERT INTO users (email, password_hash, display_name, organisation, role)
         VALUES ($1, $2, $3, $4, $5)`,
        [user.email, passwordHash, user.displayName, user.organisation, user.role]
      );
      console.log(`  ➕ Created ${user.role}: ${user.email} (password: ${user.password})`);
    } else {
      console.log(`  ℹ️ User ${user.email} already exists.`);
    }
  }

  console.log('✅ Demo users seeded successfully.');
}

seed()
  .catch((err) => {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await closeDb();
  });
