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