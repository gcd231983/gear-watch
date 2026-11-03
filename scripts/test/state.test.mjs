import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { emptyHistory, matchListings, applyRun, itemStatus } from '../lib/state.mjs';
import { planAlerts, sendAlerts } from '../lib/alerts.mjs';
import { parseFeed } from '../lib/rss.mjs';
import { parseRefurb } from '../lib/apple-refurb.mjs';

const root = new URL('../../', import.meta.url);
const watch = JSON.parse(fs.readFileSync(new URL('watch/watchlist.json', root), 'utf8'));
const srcCfg = JSON.parse(fs.readFileSync(new URL('watch/sources.json', root), 'utf8'));
const fx = (f) => fs.readFileSync(new URL('./fixtures/' + f, import.meta.url), 'utf8');
const cfg = { dealWords: srcCfg.dealWords, excludeEverywhere: watch.excludeEverywhere };
const feedSrc = { id: 'feed', name: 'Feed', type: 'rss' };
const refurbSrc = { id: 'refurb', name: 'Apple Refurbished (Mac)', type: 'apple-refurb' };
const items = watch.items;
const byItem = (ms) => Object.fromEntries(ms.map((m) => [m.itemId, m.offer.price]));

test('deal feed: each listing lands on the right item with the right price', () => {
  const ms = matchListings(parseFeed(fx('deals-feed.xml')), feedSrc, items, cfg);
  const got = ms.map((m) => `${m.itemId}=${m.offer.price}`).sort();
  assert.deepEqual(got, [
    'ipad-mini-a17=399',
    'mac-mini-m4=449',
    'mac-mini-m4=499',
    'mac-mini-m6=799',
    'macbook-neo=529',
    'macbook-pro-m5-pro=1899'
  ]);
});

test('refurb page: M5 base and M4 Pro models are not mistaken for watched items', () => {
  const ms = matchListings(parseRefurb(fx('apple-refurb-mac.html')).tiles, refurbSrc, items, cfg);
  assert.deepEqual(byItem(ms), { 'mac-mini-m4': 679, 'macbook-pro-m5-pro': 1869 });
  assert.ok(ms.every((m) => m.offer.kind === 'refurb'));
});

function run(h, now, { feed = true, refurbOk = true, refurbTiles } = {}) {
  const results = [];
  const raw = parseFeed(fx('deals-feed.xml'));
  results.push({ source: feedSrc, ok: feed, error: feed ? null : 'HTTP 403', count: raw.length, matches: feed ? matchListings(raw, feedSrc, items, cfg) : [] });
  const tiles = refurbTiles ?? parseRefurb(fx('apple-refurb-mac.html')).tiles;
  results.push({ source: refurbSrc, ok: refurbOk, error: refurbOk ? null : 'Timed out', count: tiles.length, matches: refurbOk ? matchListings(tiles, refurbSrc, items, cfg) : [] });
  return applyRun(h, items, results, now);
}

test('history: best price, week-old deals expire, refurb snapshot replaces old listings', () => {
  const h = run(emptyHistory(), '2026-11-03T12:00:00.000Z');
  // The $449 post is from Oct 12, older than a week, so the M4's best is the $499 clearance.
  assert.equal(h.items['mac-mini-m4'].best.price, 499);
  assert.equal(h.items['macbook-pro-m5-pro'].best.price, 1869); // refurb beats the $1,899 deal
  assert.equal(h.items['macbook-pro-m5-pro'].best.kind, 'refurb');
  assert.equal(h.items['macbook-neo'].lowest.price, 529);
  assert.deepEqual(h.items['macbook-neo'].daily, [{ d: '2026-11-03', low: 529 }]);
  assert.equal(h.items['ipad-mini-oled'].best, null);

  // Apple no longer lists the refurb M5 Pro: it disappears, the feed deal remains.
  run(h, '2026-11-03T14:00:00.000Z', { refurbTiles: parseRefurb(fx('apple-refurb-mac.html')).tiles.filter((t) => !/M5 Pro/.test(t.title)) });
  assert.equal(h.items['macbook-pro-m5-pro'].best.price, 1899);

  // Apple's page can't be read: refurb listings are kept for a grace period, then dropped.
  run(h, '2026-11-03T16:00:00.000Z', { refurbOk: false });
  assert.ok(h.items['mac-mini-m4'].offers.some((o) => o.kind === 'refurb'));
  assert.equal(h.sources.refurb.failStreak, 1);
  run(h, '2026-11-05T12:00:00.000Z', { refurbOk: false });
  assert.ok(!h.items['mac-mini-m4'].offers.some((o) => o.kind === 'refurb'));
  assert.equal(h.sources.refurb.failStreak, 2);
  assert.equal(h.sources.refurb.failingSince, '2026-11-03T16:00:00.000Z');

  // Ten days later every feed deal has expired.
  run(h, '2026-11-13T12:00:00.000Z', { refurbOk: false });
  assert.equal(h.items['macbook-neo'].best, null);
  assert.equal(itemStatus(items[0], h.items['macbook-neo']), 'none');
  assert.equal(h.items['macbook-neo'].lowest.price, 529, 'lowest ever is remembered');
});

function fakeGitHub() {
  const calls = [];
  let n = 0;
  const open = new Set();
  return {
    calls,
    open,
    async createIssue(title, body, labels) { n++; open.add(n); calls.push({ op: 'create', n, title, body, labels }); return n; },
    async comment(num, body) { calls.push({ op: 'comment', n: num, body }); },
    async close(num) { open.delete(num); calls.push({ op: 'close', n: num }); },
    async isOpen(num) { return open.has(num); }
  };
}

const ctx = { owner: 'gcd231983', pagesUrl: 'https://gcd231983.github.io/gear-watch/', sourceName: (id) => id };
const sources = [feedSrc, refurbSrc];
const quiet = () => {};

test('alerts: under target once, lower again, cleared, back under; nothing repeats', async () => {
  const gh = fakeGitHub();
  const h = run(emptyHistory(), '2026-11-03T12:00:00.000Z');
  await sendAlerts(planAlerts(h, items, sources), h, ctx, gh, quiet);
  const created = gh.calls.filter((c) => c.op === 'create').map((c) => c.title).sort();
  // Neo $529 <= 529, A17 $399 <= 449, M4 $499 <= 599, M6 $799 <= 799. The M5 Pro at $1,869 is over $1,849.
  assert.deepEqual(created, [
    'Mac mini (M4) is $499, under your $599 target',
    'Mac mini (M6) is $799, under your $799 target',
    'MacBook Neo is $529, under your $529 target',
    'iPad mini (A17 Pro) is $399, under your $449 target'
  ]);
  const neoIssue = gh.calls.find((c) => c.title.startsWith('MacBook Neo'));
  assert.match(neoIssue.body, /@gcd231983/);
  assert.match(neoIssue.body, /watch\.html#macbook-neo/);
  assert.deepEqual(neoIssue.labels, ['price-alert']);

  // Same prices next run: silence.
  gh.calls.length = 0;
  run(h, '2026-11-03T14:00:00.000Z');
  await sendAlerts(planAlerts(h, items, sources), h, ctx, gh, quiet);
  assert.equal(gh.calls.length, 0);

  // Neo drops further: a comment on the open issue, not a new issue.
  h.items['macbook-neo'].best = { ...h.items['macbook-neo'].best, price: 499 };
  await sendAlerts(planAlerts(h, items, sources), h, ctx, gh, quiet);
  assert.deepEqual(gh.calls.map((c) => c.op), ['comment']);
  assert.match(gh.calls[0].body, /dropped again, to \*\*\$499\*\*/);

  // Price goes above target: alert goes quiet. Gian closes the issue. Then it's back under: new issue.
  gh.calls.length = 0;
  h.items['macbook-neo'].best = { ...h.items['macbook-neo'].best, price: 579 };
  await sendAlerts(planAlerts(h, items, sources), h, ctx, gh, quiet);
  assert.equal(h.alerts['price:macbook-neo'].active, false);
  gh.open.delete(h.alerts['price:macbook-neo'].issue);
  h.items['macbook-neo'].best = { ...h.items['macbook-neo'].best, price: 519 };
  await sendAlerts(planAlerts(h, items, sources), h, ctx, gh, quiet);
  assert.equal(gh.calls.filter((c) => c.op === 'create').length, 1);
});

test('alerts: a source failing 3 checks in a row opens one issue, recovery closes it', async () => {
  const gh = fakeGitHub();
  const h = emptyHistory();
  for (const t of ['T10', 'T12', 'T14', 'T16']) {
    run(h, `2026-11-03${t}:00:00.000Z`, { feed: false });
    await sendAlerts(planAlerts(h, items, sources), h, ctx, gh, quiet);
  }
  const downs = gh.calls.filter((c) => c.op === 'create' && c.labels[0] === 'source-down');
  assert.equal(downs.length, 1);
  assert.equal(downs[0].title, "Gear Watch can't read Feed");
  assert.match(downs[0].body, /3 checks in a row/);
  run(h, '2026-11-03T18:00:00.000Z');
  await sendAlerts(planAlerts(h, items, sources), h, ctx, gh, quiet);
  assert.ok(gh.calls.some((c) => c.op === 'close' && c.n === downs[0].n));
  assert.equal(h.alerts['source:feed'].open, false);
});

test('alerts: a failed GitHub call leaves the alert to retry next run', async () => {
  const h = run(emptyHistory(), '2026-11-03T12:00:00.000Z');
  const broken = { ...fakeGitHub(), async createIssue() { throw new Error('GitHub POST /issues failed: 500'); } };
  const logs = [];
  await sendAlerts(planAlerts(h, items, sources), h, ctx, broken, (m) => logs.push(m));
  assert.equal(Object.keys(h.alerts).length, 0);
  assert.ok(logs.some((l) => l.includes('Could not send')));
});
