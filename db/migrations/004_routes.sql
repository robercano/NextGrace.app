-- Routes: ordered stops a character should visit next (advisor report, user, or an agent through MCP). One row per character.
-- The Worker creates this table on the fly too (functions/_routes.js ensureRoutes), so running this by hand is optional.
CREATE TABLE IF NOT EXISTS routes (
  char_key   TEXT PRIMARY KEY,
  owner      TEXT NOT NULL,
  title      TEXT,
  json       TEXT NOT NULL,                       -- [{ name, kind: place|grace|boss|text, why, done }]
  source     TEXT,                                -- advisor | user | mcp
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
