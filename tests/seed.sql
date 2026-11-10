-- Test accounts for tests/run.sh (local D1 only). Session cookies: tl_session=test-admin (moderator), test-user (advisor approved), test-nobody.
INSERT OR REPLACE INTO users (steamid, name, role, advisor) VALUES ('76561198000000001', 'Tester', 'admin', 'owner');
INSERT OR REPLACE INTO users (steamid, name, role, advisor) VALUES ('76561198000000002', 'Other', 'user', 'manual');
INSERT OR REPLACE INTO users (steamid, name, role, advisor) VALUES ('76561198000000003', 'Nobody', 'user', NULL);
INSERT OR REPLACE INTO sessions (id, steamid, expires_at) VALUES ('db09d473d4b6461b91bfa47e4fed3ef55e0234df4132ca7a827b0a69e8927cac', '76561198000000001', datetime('now', '+1 day'));
INSERT OR REPLACE INTO sessions (id, steamid, expires_at) VALUES ('f85ac825d102b9f2d546aa1679ea991ae845994c1343730d564f3fcd0a2168c3', '76561198000000002', datetime('now', '+1 day'));
INSERT OR REPLACE INTO sessions (id, steamid, expires_at) VALUES ('a5cc8c996740a448ba09fa394b6cee32b7acc2b4604cd6776ed49a95c1312724', '76561198000000003', datetime('now', '+1 day'));
