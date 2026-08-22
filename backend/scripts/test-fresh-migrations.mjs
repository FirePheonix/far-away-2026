/**
 * Applies local-migrations in order to an empty database, the way a fresh
 * clone or a new deploy would. Exits non-zero if any migration fails.
 */
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const target = path.join(os.tmpdir(), `fresh-${Date.now()}.db`);
const db = new Database(target);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const dir = path.resolve("local-migrations");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

let failed = 0;
for (const file of files) {
  const sql = fs.readFileSync(path.join(dir, file), "utf-8");
  try {
    db.exec(sql);
    console.log(`  ok    ${file}`);
  } catch (error) {
    console.log(`  FAIL  ${file}: ${error.message}`);
    failed += 1;
  }
}

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
  .pluck()
  .all();
console.log(`\ntables created: ${tables.length}`);

db.close();
fs.rmSync(target, { force: true });
fs.rmSync(`${target}-shm`, { force: true });
fs.rmSync(`${target}-wal`, { force: true });

process.exit(failed > 0 ? 1 : 0);
