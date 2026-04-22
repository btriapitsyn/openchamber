import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let dbInstance = null;

const getDbPath = () => {
  const configDir = path.join(os.homedir(), '.config', 'openchamber', 'teams');
  return path.join(configDir, 'team.db');
};

export const getDb = async () => {
  if (dbInstance) return dbInstance;

  const dbPath = getDbPath();
  const dbDir = path.dirname(dbPath);

  await fs.mkdir(dbDir, { recursive: true, mode: 0o700 });

  dbInstance = new Database(dbPath);
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');

  await runMigrations(dbInstance);

  return dbInstance;
};

const runMigrations = async (db) => {
  const migrationsDir = path.join(__dirname, 'migrations');
  
  // Ensure a simple migration tracking table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  const appliedRows = db.prepare('SELECT version FROM schema_migrations').all();
  const appliedVersions = new Set(appliedRows.map((r) => r.version));

  let files = [];
  try {
    files = await fs.readdir(migrationsDir);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const sqlFiles = files
    .filter((f) => f.endsWith('.sql'))
    .map((f) => {
      const match = f.match(/^(\d+)-/);
      return {
        file: f,
        version: match ? parseInt(match[1], 10) : 0,
      };
    })
    .filter((m) => m.version > 0)
    .sort((a, b) => a.version - b.version);

  for (const migration of sqlFiles) {
    if (!appliedVersions.has(migration.version)) {
      const content = await fs.readFile(path.join(migrationsDir, migration.file), 'utf8');
      
      const applyTx = db.transaction(() => {
        db.exec(content);
        db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
          migration.version,
          Date.now()
        );
      });
      
      try {
        applyTx();
        console.log(`Applied migration: ${migration.file}`);
      } catch (err) {
        console.error(`Failed to apply migration ${migration.file}:`, err);
        throw err;
      }
    }
  }
};

export const closeDb = () => {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
};
