-- Consejero: informe cacheado por personaje + registro de generaciones (coste/límites)
CREATE TABLE IF NOT EXISTS advice (
  char_key TEXT PRIMARY KEY,
  hash TEXT NOT NULL,                          -- hash del resumen con el que se generó
  model TEXT,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS advice_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  steamid TEXT NOT NULL,
  char_key TEXT NOT NULL,
  model TEXT,
  in_tokens INTEGER, out_tokens INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS advice_log_user ON advice_log(steamid, created_at);
