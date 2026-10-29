import { app } from './app.js';
import { config } from './config.js';
import { initDb } from './db/index.js';

async function startServer() {
  try {
    console.log('🔄 Initializing database and running migrations...');
    await initDb();
    console.log('✅ Database ready.');

    app.listen(config.PORT, () => {
      console.log(`🚀 Stock & Foil Backend API running on port ${config.PORT}`);
      console.log(`   Base API URL: http://localhost:${config.PORT}${config.VITE_API_BASE}`);
      console.log(`   Chain Mode:   ${config.CHAIN_MODE}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
