// Browser tests (Playwright, Chromium) against the local Worker from tests/run.sh. They need a real save: TEST_SAVE=path/to/ER0000.sl2
// (saves are private, never committed), so they run locally, not in CI. Uses the test-admin session from tests/seed.sql.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright"); // require() also finds a global install (NODE_PATH)

const BASE = process.env.BASE || "http://127.0.0.1:8797", SAVE = process.env.TEST_SAVE, COOKIE = process.env.TEST_STEAMID ? "test-save" : "test-admin";
let browser, ctx, page, errors;
const quiet = () => errors.filter(e => !/agent-proxy|fonts\.|cdnjs|Allowed|For details|workers\.cloudflare|favicon/.test(e));

before(async () => {
  browser = await chromium.launch(); ctx = await browser.newContext({ viewport: { width: 420, height: 860 }, locale: "es-ES" });
  await ctx.addCookies([{ name: "tl_session", value: COOKIE, url: BASE }]);
  page = await ctx.newPage(); errors = []; page.on("pageerror", e => errors.push(e.message));
});
after(async () => { await browser.close(); });

test("sheet: the save loads, the characters appear in the drawer, the tabs render", async () => {
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.setInputFiles("#file", SAVE); await page.waitForSelector("#app:not([hidden])", { timeout: 30000 }); await page.waitForTimeout(1500);
  const who = (await page.textContent("#who")).trim(); assert.ok(who.length > 0, "character chip");
  await page.click("#menuBtn"); const slots = await page.$$("#chars [data-slot]"); assert.ok(slots.length >= 1); await page.keyboard.press("Escape"); await page.waitForTimeout(200);
  for (const t of ["status", "equip", "inv", "forge", "progress", "advice"]) { await page.click(`#tabs .tab[data-t="${t}"]`); await page.waitForTimeout(300); const sel = await page.$eval(".tab[aria-selected=true]", e => e.dataset.t); assert.equal(sel, t); }
  assert.deepEqual(quiet(), []);
});

test("progress: the collection pane counts and jumps to the inventory", async () => {
  await page.click('#tabs .tab[data-t="progress"]'); await page.waitForTimeout(400);
  const rows = await page.$$eval(".coll .bar", bs => bs.map(b => b.textContent.replace(/\s+/g, " ").trim())); assert.ok(rows.length >= 8, "collection rows: " + rows.length); assert.match(rows[0], /\d+ \/ \d+/);
  await page.click('.coll [data-coll="Talismanes"]'); await page.waitForTimeout(500);
  assert.equal(await page.$eval(".tab[aria-selected=true]", e => e.dataset.t), "inv");
  assert.match(await page.textContent("#count"), /por conseguir/);
});

test("inventory: owned mode lists items with pictures or names", async () => {
  await page.click('#tabs .tab[data-t="inv"]'); await page.waitForTimeout(300); await page.click('#mode [data-m="have"]'); await page.click('#chips [data-g="Todo"]'); await page.waitForTimeout(500);
  const n = await page.$$eval("#inv .cell", cs => cs.length); assert.ok(n > 20, "cells: " + n);
  await page.click("#inv .cell"); await page.waitForTimeout(200); assert.ok((await page.textContent("#invDetail")).trim().length > 3);
});

test("map: loads with the character, draws a route from the account and switches layers", async () => {
  const ck = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem("tl.last") || "{}"); const c = (s.chars || []).find(c => !c.error); return s.steamid + ":" + c.slot; });
  const r = await fetch(BASE + "/api/route/" + encodeURIComponent(ck), { method: "PUT", headers: { "content-type": "application/json", cookie: "tl_session=" + COOKIE }, body: JSON.stringify({ title: "UI test", stops: [{ name: "Church of Elleh", why: "a" }, { name: "Siofra River Bank", why: "b" }, { name: "Nowhere" }] }) });
  if (r.status !== 200) { console.log("route PUT skipped:", r.status, await r.text()); return; } // the save's steamid may not match the test account
  await page.goto(BASE + "/map.html#route=1", { waitUntil: "networkidle" }); await page.waitForTimeout(2500);
  assert.equal(await page.$eval("#route", e => e.hidden), false);
  const items = await page.$$eval("#route li", ls => ls.map(l => l.className)); assert.equal(items.length, 3); assert.ok(items[2].includes("text"));
  assert.deepEqual(await page.$$eval(".rpin", ps => ps.map(p => p.textContent)), ["1"]);
  await page.click('#route [data-go="1"]'); await page.waitForTimeout(800);
  assert.equal(await page.$eval("#layerSel", s => s.value), "gugr"); assert.deepEqual(await page.$$eval(".rpin", ps => ps.map(p => p.textContent)), ["2"]);
  await page.click("#menuBtn"); await page.waitForTimeout(200);
  const z = await page.$eval("#menu", m => +getComputedStyle(m).zIndex); assert.ok(z > 1000, "drawer above Leaflet: " + z);
  assert.deepEqual(quiet(), []);
});
