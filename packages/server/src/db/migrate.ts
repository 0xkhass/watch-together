import 'dotenv/config'; // Ensures .env is loaded before running
import { query, getDb } from './client';

async function runMigrations() {
  console.log('🚀 Starting database migrations...');

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL is not set. Cannot run migrations.');
    process.exit(1);
  }

  const schema = `
    CREATE TABLE IF NOT EXISTS rooms (
      id UUID PRIMARY KEY,
      code VARCHAR(6) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      host_id VARCHAR(255) NOT NULL,
      video_url TEXT,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL
    );

    -- Add an index on 'code' since we often look up rooms by their code
    CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(code);
  `;

  try {
    console.log('📦 Creating tables...');
    await query(schema);
    console.log('✅ Migrations completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    // We must close the pool so the script can exit successfully
    const pool = getDb();
    if (pool) {
      await pool.end();
      console.log('🔌 Database connection closed.');
    }
    process.exit(0);
  }
}

runMigrations();