import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { main, pagesUrl } from '../run.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fx = (f) => fs.readFile(path.join(ROOT, 'scripts/test/fixtures', f), 'utf8');

async function tempRepo() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gw-'));
  for (const d of ['watch', 'site', 'data']) await fs.mkdir(path.join(dir, d), { recursive: true });
  for (const f of ['watch/watchlist.json', 'watch/sources.json', 'watch/picks.json']) await fs.copyFile(path.join(ROOT, f), path.join(dir, f));
  return dir;
}

function fakeWeb(map) {
  const asked = [];
  return {
    asked,
    get: async (url) => {
      asked.push(url);
      for (const [needle, file] of map) if (url.includes(needle)) {
        if (file instanceof Error) throw file;
        return fx(file);
      }
      throw new Error('HTTP 404 from ' + new URL(url).host);
    }
  };
}

function fakeGitHubApi() {
  const calls = [];
  let n = 100;
  const labels = new Set();
  const issues = new Map();
  const fetchImpl = async (url, opts) => {
    const u = new URL(url);
    const p = u.pathname.replace('/repos/gcd231983/gear-watch', '');
    const body = opts.body ? JSON.parse(opts.body) : null;
    calls.push({ method: opts.method, path: p, body, auth: opts.headers.authorization });
    const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
    if (opts.method === 'POST' && p === '/labels') {
      if (labels.has(body.name)) return json(422, { message: 'Validation Failed' });
      labels.add(body.name);
      return json(201, body);
    }
    if (opts.method === 'POST' && p === '/issues') { n++; issues.set(n, 'open'); return json(201, { number: n }); }
    let m;
    if ((m = p.match(/^\/issues\/(\d+)$/)) && opts.method === 'GET') return issues.has(+m[1]) ? json(200, { state: issues.get(+m[1]) }) : json(404, { message: 'Not Found' });
    if ((m = p.match(/^\/issues\/(\d+)\/comments$/))) return json(201, {});
    if ((m = p.match(/^\/issues\/(\d+)$/)) && opts.method === 'PATCH') { issues.set(+m[1], body.state); return json(200, {}); }
    return json(404, { message: 'Not Found' });
  };
  return { calls, fetchImpl };
}

test('pages address', () => {
  assert.equal(pagesUrl('gcd231983/gear-watch'), 'https://gcd231983.github.io/gear-watch/');
  assert.equal(pagesUrl('GCD231983/gcd231983.github.io'), 'https://gcd231983.github.io/');
});

test('full run: sources, history, alerts as issues, page data, run summary', async () => {
  const dir = await tempRepo();
  const web = fakeWeb([
    ['refurbished/mac', 'apple-refurb-mac.html'],
    ['refurbished/ipad', 'apple-refurb-ipad.html'],
    ['9to5toys.com', 'deals-feed.xml'],
    ['macrumors.com', 'blocked.html'],
    ['appleinsider.com', new Error('Timed out after 25s (appleinsider.com)')],
    ['q=MacBook%20Neo', 'atom-feed.xml'],
    ['slickdeals.net', 'blocked.html']
  ]);
  const api = fakeGitHubApi();
  const summary = path.join(dir, 'summary.md');
  const env = { GITHUB_TOKEN: 'test-token', GITHUB_REPOSITORY: 'gcd231983/gear-watch', GITHUB_STEP_SUMMARY: summary, GW_NOW: '2026-11-03T12:00:00.000Z' };
  const logs = [];
  await main({ root: dir, env, get: web.get, fetchImpl: api.fetchImpl, log: (m) => logs.push(m) });

  // Slickdeals ran one search per watched item.
  assert.equal(web.asked.filter((u) => u.includes('slickdeals')).length, 7);

  const history = JSON.parse(await fs.readFile(path.join(dir, 'data/history.json'), 'utf8'));
  assert.equal(history.sources['9to5toys'].ok, true);
  assert.equal(history.sources.macrumors.ok, false);
  assert.match(history.sources.macrumors.lastError, /web page instead of a feed/);
  assert.match(history.sources.appleinsider.lastError, /Timed out/);
  assert.equal(history.sources.slickdeals.ok, true, 'one search working is enough');
  assert.equal(history.items['ipad-mini-a17'].best.price, 399);
  assert.equal(history.items['macbook-neo'].best.price, 529);

  const site = JSON.parse(await fs.readFile(path.join(dir, 'site/data.json'), 'utf8'));
  assert.equal(site.pagesUrl, 'https://gcd231983.github.io/gear-watch/');
  assert.equal(site.items.length, 7);
  assert.equal(site.items.find((i) => i.id === 'macbook-neo').status, 'hit');
  assert.equal(site.items.find((i) => i.id === 'ipad-mini-oled').status, 'none');
  assert.equal(site.sources.length, 6);
  assert.equal(site.picks.title, "Gian's Picks");

  const created = api.calls.filter((c) => c.method === 'POST' && c.path === '/issues');
  assert.equal(created.length, 4);
  assert.ok(api.calls.every((c) => c.auth === 'Bearer test-token'));
  assert.ok((await fs.readFile(summary, 'utf8')).includes('| MacRumors deals | Failed:'));

  // Two more failing runs: MacRumors and AppleInsider each get one "can't read" issue.
  for (const t of ['14', '16']) {
    await main({ root: dir, env: { ...env, GW_NOW: `2026-11-03T${t}:00:00.000Z` }, get: web.get, fetchImpl: api.fetchImpl, log: () => {} });
  }
  const down = api.calls.filter((c) => c.method === 'POST' && c.path === '/issues' && c.body.labels[0] === 'source-down').map((c) => c.body.title).sort();
  assert.deepEqual(down, ["Gear Watch can't read AppleInsider", "Gear Watch can't read MacRumors deals"]);
  assert.equal(api.calls.filter((c) => c.method === 'POST' && c.path === '/issues' && c.body.labels[0] === 'price-alert').length, 4, 'no repeat price alerts');
});

test('no token (running locally): alerts are printed, not sent, and not marked as sent', async () => {
  const dir = await tempRepo();
  const web = fakeWeb([['refurbished', 'apple-refurb-mac.html'], ['', 'deals-feed.xml']]);
  const logs = [];
  const { history } = await main({ root: dir, env: { GW_NOW: '2026-11-03T12:00:00.000Z' }, get: web.get, log: (m) => logs.push(m) });
  assert.ok(logs.some((l) => l.includes('not sent')));
  assert.deepEqual(history.alerts, {});
});

test('bad settings stop the run with a plain explanation', async () => {
  const dir = await tempRepo();
  const wl = JSON.parse(await fs.readFile(path.join(dir, 'watch/watchlist.json'), 'utf8'));
  wl.items[0].target = 'cheap';
  await fs.writeFile(path.join(dir, 'watch/watchlist.json'), JSON.stringify(wl));
  await assert.rejects(main({ root: dir, env: {}, get: async () => '', log: () => {} }), /"target" must be a number/);
});
