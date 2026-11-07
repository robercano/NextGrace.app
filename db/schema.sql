-- Tarnished Ledger — D1 schema (alpha)
CREATE TABLE IF NOT EXISTS users (
  steamid TEXT PRIMARY KEY,
  name TEXT, avatar TEXT,
  role TEXT NOT NULL DEFAULT 'user',          -- 'user' | 'admin'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,                         -- random token (hashed)
  steamid TEXT NOT NULL REFERENCES users(steamid),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS characters (
  char_key TEXT PRIMARY KEY,                   -- "<save steamid>:<slot>"
  owner TEXT NOT NULL REFERENCES users(steamid),
  name TEXT, level INTEGER, class TEXT, playtime INTEGER,
  summary TEXT,                                -- JSON: progress counters, equipped, etc. (no full save)
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS characters_owner ON characters(owner);
CREATE TABLE IF NOT EXISTS marks (
  char_key TEXT NOT NULL,
  kind TEXT NOT NULL,                          -- place | item | boss | grace
  ref TEXT NOT NULL,                           -- id within kind
  state TEXT NOT NULL DEFAULT 'done',
  at TEXT NOT NULL,                            -- YYYY-MM-DD (client)
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (char_key, kind, ref)
);
CREATE TABLE IF NOT EXISTS markers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author TEXT NOT NULL REFERENCES users(steamid),
  layer TEXT NOT NULL,                         -- tlb | gugr | sote
  x REAL NOT NULL, y REAL NOT NULL,
  item TEXT,                                   -- item name (catalog) or null for a plain place note
  kind TEXT,                                   -- optional marker kind for the glyph
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending',      -- pending | approved | rejected
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_by TEXT, reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS markers_status ON markers(status);
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

-- Steam OpenID: verified response nonces, so a return URL opened twice (installed app + browser) still signs in. Created on the fly by the Worker too.
CREATE TABLE IF NOT EXISTS openid_nonces (
  nonce TEXT PRIMARY KEY,
  steamid TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- The Worker creates this table on the fly too (functions/_routes.js ensureRoutes), so running this by hand is optional.
CREATE TABLE IF NOT EXISTS routes (
  char_key   TEXT PRIMARY KEY,
  owner      TEXT NOT NULL,
  title      TEXT,
  json       TEXT NOT NULL,                       -- [{ name, kind: place|grace|boss|text, why, done }]
  source     TEXT,                                -- advisor | user | mcp
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
