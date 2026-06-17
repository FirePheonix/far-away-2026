import Database, { type Database as SQLiteDatabase } from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

// Initialize the local SQLite database
const dbPath = path.resolve(process.cwd(), "local.db");
export const db: SQLiteDatabase = new Database(dbPath);

// Enable foreign keys and WAL mode for better concurrency
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Ensure the migrations table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS _migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

const migrationsDir = path.resolve(process.cwd(), "local-migrations");
if (fs.existsSync(migrationsDir)) {
  const files = fs.readdirSync(migrationsDir).sort();
  
  const getAppliedMigrations = db.prepare("SELECT name FROM _migrations").pluck().all() as string[];
  const appliedSet = new Set(getAppliedMigrations);

  for (const file of files) {
    if (file.endsWith(".sql") && !appliedSet.has(file)) {
      console.log(`[DB] Applying migration: ${file}`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, "utf-8");
      
      const applyMigration = db.transaction(() => {
        db.exec(sql);
        db.prepare("INSERT INTO _migrations (name) VALUES (?)").run(file);
      });

      applyMigration();
      console.log(`[DB] Migration applied successfully: ${file}`);
    }
  }
} else {
  console.log("[DB] No local-migrations directory found.");
}

export default db;
