import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { config } from '../config.js';

export interface DbResult<T = any> {
  rows: T[];
  rowCount: number;
}

export interface DbClient {
  query<T = any>(text: string, params?: any[]): Promise<DbResult<T>>;
}

let pool: pg.Pool | null = null;
let pgliteInstance: PGlite | null = null;
let isInitialized = false;

export async function getDb(): Promise<DbClient> {
  if (config.DATABASE_URL) {
    if (!pool) {
      pool = new pg.Pool({
        connectionString: config.DATABASE_URL,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });
    }
    return {
      query: async <T = any>(text: string, params?: any[]): Promise<DbResult<T>> => {
        const res = await pool!.query(text, params);
        return {
          rows: res.rows as T[],
          rowCount: res.rowCount ?? 0,
        };
      },
    };
  }

  // Local / testing fallback: in-process PGlite
  if (!pgliteInstance) {
    pgliteInstance = new PGlite();
  }

  return {
    query: async <T = any>(text: string, params?: any[]): Promise<DbResult<T>> => {
      const res = await pgliteInstance!.query(text, params);
      return {
        rows: (res.rows || []) as T[],
        rowCount: res.affectedRows ?? res.rows.length,
      };
    },
  };
}

export async function query<T = any>(text: string, params?: any[]): Promise<DbResult<T>> {
  if (!isInitialized) {
    await initDb();
  }
  const db = await getDb();
  return db.query<T>(text, params);
}

export async function transaction<T = any>(
  callback: (client: DbClient) => Promise<T>
): Promise<T> {
  if (!isInitialized) {
    await initDb();
  }

  if (config.DATABASE_URL && pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const txClient: DbClient = {
        query: async <R = any>(text: string, params?: any[]): Promise<DbResult<R>> => {
          const res = await client.query(text, params);
          return {
            rows: res.rows as R[],
            rowCount: res.rowCount ?? 0,
          };
        },
      };
      const result = await callback(txClient);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // PGlite transaction
  if (!pgliteInstance) {
    pgliteInstance = new PGlite();
  }
  return await pgliteInstance.transaction(async (tx) => {
    const txClient: DbClient = {
      query: async <R = any>(text: string, params?: any[]): Promise<DbResult<R>> => {
        const res = await tx.query(text, params);
        return {
          rows: (res.rows || []) as R[],
          rowCount: res.affectedRows ?? res.rows.length,
        };
      },
    };
    return await callback(txClient);
  });
}

export async function runMigrations(): Promise<void> {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const migrationPath = path.join(currentDir, 'migrations', '001_init.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  if (config.DATABASE_URL) {
    const db = await getDb();
    await db.query(sql);
  } else {
    if (!pgliteInstance) {
      pgliteInstance = new PGlite();
    }
    await pgliteInstance.exec(sql);
  }
}

export async function initDb(): Promise<void> {
  if (isInitialized) return;
  await runMigrations();
  isInitialized = true;
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
  if (pgliteInstance) {
    await pgliteInstance.close();
    pgliteInstance = null;
  }
  isInitialized = false;
}
