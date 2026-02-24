DROP TABLE IF EXISTS notes;
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT,
  image_url TEXT,
  created_at INTEGER
);

/* ▼▼▼ ここから追加 ▼▼▼ */
DROP TABLE IF EXISTS assets;
CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  record_date TEXT,
  amount INTEGER,
  created_at INTEGER
);

/* (既存のnotesやassetsの記述はそのまま残してください) */

DROP TABLE IF EXISTS todos;
CREATE TABLE IF NOT EXISTS todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task TEXT,
  is_completed INTEGER DEFAULT 0,
  created_at INTEGER
);