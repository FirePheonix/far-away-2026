import Database from 'better-sqlite3';
const db = new Database('local.db');
const rows = db.prepare('SELECT provider, clerk_user_id FROM oauth_connections;').all();
console.log(rows);
