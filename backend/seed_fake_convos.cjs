const db = require('better-sqlite3')('local.db');
const clerk_user_id = 'user_3F7yyp1EsB7nD41u7y5IXngtL4S';

db.prepare('DELETE FROM assistant_requests').run();
db.prepare('DELETE FROM assistant_runs').run();
db.prepare('DELETE FROM assistant_steps').run();
db.prepare('DELETE FROM pending_tasks').run();

const stmt = db.prepare('INSERT INTO assistant_requests (id, clerk_user_id, transcript, status) VALUES (?, ?, ?, ?)');

stmt.run('req_1', clerk_user_id, JSON.stringify({ "Hannu": "Hey Kunal, did you get a chance to look at the PR?", "Kunal": "Yeah, I am reviewing it right now. Looks solid so far." }), 'completed');
stmt.run('req_2', clerk_user_id, JSON.stringify({ "Sparsh": "Shubham, can we sync on the new UI design?", "Shubham": "Sure, let us hop on a call in 10 minutes." }), 'completed');
stmt.run('req_3', clerk_user_id, JSON.stringify({ "Hannu": "Sparsh, the backend API is ready for testing.", "Sparsh": "Awesome, I will integrate it into the frontend today." }), 'completed');
stmt.run('req_4', clerk_user_id, JSON.stringify({ "Kunal": "Shubham, the build failed on CI.", "Shubham": "I see it, fixing it right now." }), 'completed');

console.log('Fake conversations added');
