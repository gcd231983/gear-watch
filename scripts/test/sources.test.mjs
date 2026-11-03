import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseFeed, looksLikeFeed } from '../lib/rss.mjs';
import { parseRefurb, sliceObject } from '../lib/apple-refurb.mjs';

const fx = (f) => fs.readFileSync(new URL('./fixtures/' + f, import.meta.url), 'utf8');

test('RSS 2.0: titles, links, guid fallback, dates, CDATA and entities', () => {
  const items = parseFeed(fx('deals-feed.xml'));
  assert.equal(items.length, 9);
  assert.equal(items[0].title, "Apple's MacBook Neo falls to $529 at Amazon ($70 off)");
  assert.equal(items[0].url, 'https://example.com/deals/macbook-neo-529');
  assert.equal(items[0].publishedAt, '2026-11-02T15:00:00.000Z');
  assert.equal(items[7].url, 'https://example.com/deals/m6-mini');
  assert.ok(items[6].title.includes('& ships free'));
});

test('Atom feeds', () => {
  const items = parseFeed(fx('atom-feed.xml'));
  assert.deepEqual(items, [{ title: 'MacBook Neo 512GB deal hits $629 at Best Buy', url: 'https://example.com/atom/neo-512', publishedAt: '2026-11-03T08:00:00.000Z' }]);
});

test('a blocked or challenge page is not a feed', () => {
  assert.ok(looksLikeFeed(fx('deals-feed.xml')));
  assert.ok(looksLikeFeed(fx('atom-feed.xml')));
  assert.ok(!looksLikeFeed(fx('blocked.html')));
});

test('Apple refurb: reads the embedded product grid', () => {
  const { tiles, method } = parseRefurb(fx('apple-refurb-mac.html'));
  assert.equal(method, 'json');
  assert.equal(tiles.length, 4);
  const mini = tiles.find((t) => t.price === 679);
  assert.match(mini.title, /^Refurbished Mac mini Apple M4 Chip with 10-Core CPU/);
  assert.equal(mini.url, 'https://www.apple.com/shop/product/FU9D3LL/A/refurbished-mac-mini-m4');
});

test('Apple refurb: falls back to plain HTML when the grid data is missing', () => {
  const { tiles, method } = parseRefurb(fx('apple-refurb-fallback.html'));
  assert.equal(method, 'html');
  assert.equal(tiles.length, 1);
  assert.equal(tiles[0].price, 679);
  assert.match(tiles[0].title, /10-Core/);
});

test('Apple refurb: a page with no listings returns nothing', () => {
  assert.deepEqual(parseRefurb(fx('blocked.html')).tiles, []);
});

test('sliceObject ignores braces inside strings', () => {
  const s = 'x = {"a": "}{", "b": {"c": 1}} tail';
  assert.equal(sliceObject(s, s.indexOf('{')), '{"a": "}{", "b": {"c": 1}}');
});

import { getText } from '../lib/http.mjs';
test('network errors say which site and why', async () => {
  const boom = async () => { const e = new TypeError('fetch failed'); e.cause = { code: 'ENOTFOUND' }; throw e; };
  await assert.rejects(getText('https://9to5toys.com/feed/', { fetchImpl: boom, retryDelayMs: 0 }), /Couldn't connect to 9to5toys\.com \(ENOTFOUND\)/);
  const forbidden = async () => new Response('no', { status: 403 });
  await assert.rejects(getText('https://slickdeals.net/x', { fetchImpl: forbidden, retryDelayMs: 0 }), /HTTP 403 from slickdeals\.net/);
});
