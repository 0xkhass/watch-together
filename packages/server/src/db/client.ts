import { Pool, PoolConfig } from 'pg';
let pool: Pool | null = null;

export function getDb(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    
    if (!connectionString) {
      console.warn('[DB] No DATABASE_URL set — running without database persistence');
      return null as unknown as Pool;
    }

    const config: PoolConfig = {
      connectionString,
      // Supabase requires SSL for external connections
      ssl: process.env.NODE_ENV === 'production' 
        ? { rejectUnauthorized: false } 
        : false,
      
      // Safe limits for Supabase micro instances
      max: 15, 
      idleTimeoutMillis: 30000, 
      connectionTimeoutMillis: 10000, 
    };

    pool = new Pool(config);

    pool.on('error', (err) => {
      console.error('[DB] Unexpected error on idle client:', err);
    });

    pool.on('connect', () => {
      console.log('[DB] New client connected to Supabase');
    });
  }
  
  return pool;
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const db = getDb();
  if (!db) return [];
  
  try {
    const result = await db.query(text, params);
    return result.rows as T[];
  } catch (err) {
    console.error('[DB] Query error:', err);
    throw err;
  }
}