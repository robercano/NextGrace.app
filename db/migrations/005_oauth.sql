-- OAuth 2.1 server for the MCP endpoint (/mcp): registered clients, one-time codes, hashed tokens, consent nonces.
-- The Worker creates these on the fly too (functions/_oauth.js ensureOauth), so running this by hand is optional.
CREATE TABLE IF NOT EXISTS oauth_clients (client_id TEXT PRIMARY KEY, name TEXT, redirect_uris TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS oauth_codes (code TEXT PRIMARY KEY, client_id TEXT NOT NULL, redirect_uri TEXT NOT NULL, challenge TEXT NOT NULL, scope TEXT, steamid TEXT NOT NULL, resource TEXT, expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS oauth_tokens (id TEXT PRIMARY KEY, kind TEXT NOT NULL, client_id TEXT NOT NULL, steamid TEXT NOT NULL, scope TEXT, pair TEXT, expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));  -- id = sha256(token); kind access|refresh
CREATE TABLE IF NOT EXISTS oauth_consents (nonce TEXT PRIMARY KEY, steamid TEXT NOT NULL, expires_at TEXT NOT NULL);
