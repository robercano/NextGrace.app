-- Advisor access: who may spend the Claude key. Set on login from the Steam Web API (owns Elden Ring?) or by a moderator.
-- The Worker also adds these columns on the fly (functions/_lib.js ensureSchema), so running this by hand is optional.
ALTER TABLE users ADD COLUMN advisor TEXT NOT NULL DEFAULT 'unknown';   -- unknown | unavailable | error | owner | private | none | requested | manual | denied
ALTER TABLE users ADD COLUMN advisor_checked_at TEXT;                   -- last Steam check
ALTER TABLE users ADD COLUMN contact TEXT;                              -- e-mail given with a manual activation request
ALTER TABLE users ADD COLUMN advisor_note TEXT;                         -- note from the user (request) or the moderator (decision)
ALTER TABLE users ADD COLUMN advisor_requested_at TEXT;
ALTER TABLE users ADD COLUMN owns TEXT;                                 -- Steam library check result (owner | private | none | unavailable | error)
