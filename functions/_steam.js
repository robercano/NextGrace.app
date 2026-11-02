// Steam Web API: does this account own Elden Ring? Needs the STEAM_API_KEY secret (https://steamcommunity.com/dev/apikey).
// Using the Web API requires the "Powered by Steam" notice on the site (about.html).
const ELDEN_RING_APPID = 1245620;

/** → { state: "owner" | "none" | "private" | "unavailable" | "error", playtime? }  (playtime in minutes) */
export async function checkOwnership(env, steamid) {
  if (!env.STEAM_API_KEY) return { state: "unavailable" };
  try {
    const u = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${encodeURIComponent(env.STEAM_API_KEY)}&steamid=${steamid}&include_played_free_games=1&format=json`;
    const r = await fetch(u, { headers: { accept: "application/json" } });
    if (r.status === 401 || r.status === 403) return { state: "unavailable" }; // bad key
    if (!r.ok) return { state: "error" };
    const d = ((await r.json()) || {}).response || {};
    if (d.game_count === undefined) return { state: "private" }; // Steam answers {} when "game details" are not public
    const g = (d.games || []).find(x => x.appid === ELDEN_RING_APPID);
    return g ? { state: "owner", playtime: g.playtime_forever | 0 } : { state: "none" };
  } catch (e) { return { state: "error" }; }
}

/** Re-checks and stores the result unless the user was approved/denied by hand. Returns the user's new advisor state. */
export async function refreshOwnership(env, user) {
  if (user.advisor === "manual" || user.advisor === "denied" || user.advisor === "requested") return user.advisor;
  const r = await checkOwnership(env, user.steamid);
  // never downgrade a confirmed owner because of a transient failure
  const state = (r.state === "error" || r.state === "unavailable") && user.advisor === "owner" ? "owner" : r.state;
  await env.DB.prepare("UPDATE users SET advisor = ?, advisor_checked_at = datetime('now') WHERE steamid = ?").bind(state, user.steamid).run();
  return state;
}
