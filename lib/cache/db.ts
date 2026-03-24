import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "cache.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("busy_timeout = 5000");
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_cache (
      cache_key TEXT PRIMARY KEY,
      response_json TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      ttl_seconds INTEGER NOT NULL DEFAULT 86400
    );

    CREATE TABLE IF NOT EXISTS investigations (
      id TEXT PRIMARY KEY,
      mode TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      chain TEXT,
      suspicion_score INTEGER,
      verdict TEXT,
      report_json TEXT NOT NULL,
      card_path TEXT,
      timeline_card_path TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      ttl_seconds INTEGER NOT NULL DEFAULT 86400
    );

    CREATE TABLE IF NOT EXISTS monitor_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      summary TEXT NOT NULL,
      data_json TEXT NOT NULL,
      investigated INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS rate_limits (
      ip TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS budget_tracking (
      date TEXT NOT NULL,
      credits_used REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (date)
    );

    CREATE INDEX IF NOT EXISTS idx_monitor_created ON monitor_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_investigations_subject ON investigations(subject_id, mode);
    CREATE INDEX IF NOT EXISTS idx_api_cache_ttl ON api_cache(created_at);
  `);
}
