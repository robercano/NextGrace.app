// Minimal Claude Messages API client for the lab scripts (Node 20+, no SDK). Key from ANTHROPIC_API_KEY.
export async function ask({ model, system, user, maxTokens = 8000, temperature }) {
  const key = process.env.ANTHROPIC_API_KEY; if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  const t0 = Date.now();
  const body = { model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] };
  if (temperature !== undefined) body.temperature = temperature;
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`model error ${r.status}: ${d.error && d.error.message || JSON.stringify(d).slice(0, 200)}`);
  const text = (d.content || []).filter(b => b.type === "text").map(b => b.text).join("").trim();
  return { text, usage: d.usage || {}, stop: d.stop_reason, seconds: Math.round((Date.now() - t0) / 1000), model: d.model || model };
}
// Rough prices in $ per million tokens (input, output) to estimate cost in the reports; update if they change.
export const PRICE = { "claude-opus-5-5": [15, 75], "claude-sonnet-5-5": [3, 15], "claude-haiku-5-5": [1, 5] };
export const cost = (model, u) => { const p = PRICE[model] || PRICE["claude-sonnet-5-5"]; return ((u.input_tokens || 0) * p[0] + (u.output_tokens || 0) * p[1]) / 1e6; };
