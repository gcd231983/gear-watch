import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, hasPhrase, matchesItem, pickPrice, findAmounts, money, hasDealWords } from '../lib/text.mjs';

test('normalize handles Apple hyphens, entities and spaces', () => {
  assert.equal(normalize('14\u2011inch MacBook\u00a0Pro &amp; more'), '14-inch MacBook Pro & more');
  assert.equal(normalize('Apple&#8217;s'), "Apple's");
});

test('phrases match whole words only', () => {
  assert.ok(hasPhrase('New M4 Mac mini', 'M4'));
  assert.ok(!hasPhrase('New M40 Mac mini', 'M4'));
  assert.ok(!hasPhrase('standard edition', 'stand'));
  assert.ok(hasPhrase('M5 Pro MacBook Pros drop', 'MacBook Pro'));
  assert.ok(hasPhrase('Mac-mini deal', 'Mac mini'));
  assert.ok(hasPhrase('the 8.5-inch iPad mini', '8.5-inch'));
});

test('item matching uses all / any / none and the global exclude list', () => {
  const m4 = { match: { all: ['Mac mini', 'M4'], none: ['M4 Pro'] } };
  assert.ok(matchesItem('M4 Mac mini clearance $499', m4));
  assert.ok(!matchesItem('M4 Pro Mac mini $1,199', m4));
  assert.ok(!matchesItem('M4 Mac mini stand for $29', m4, ['stand']));
  const oled = { match: { all: ['iPad mini'], any: ['OLED', 'A20'] } };
  assert.ok(matchesItem('OLED iPad mini first deal $649', oled));
  assert.ok(!matchesItem('iPad mini 7 $399', oled));
});

test('pickPrice finds the asking price and ignores savings, regular prices and accessories', () => {
  assert.equal(pickPrice('Amazon takes $300 off M5 Pro MacBook Pro, now $1,899 (Reg. $2,199)', 2199), 1899);
  assert.equal(pickPrice("MacBook Neo falls to $529 at Amazon ($70 off)", 599), 529);
  assert.equal(pickPrice('Mac mini M6 deal: save $100, now $799', 899), 799);
  assert.equal(pickPrice('M6 Mac mini from $849.99 with a $50 gift card', 899), 849.99);
  assert.equal(pickPrice('MacBook Neo deals with up to $100 off', 599), null);
  assert.equal(pickPrice('Mac mini up to $1.2k off', 899), null);
  assert.equal(pickPrice('No price here', 599), null);
});

test('findAmounts reads cents and thousands', () => {
  assert.deepEqual(findAmounts('$1,234.50 and $99').map((a) => a.value), [1234.5, 99]);
});

test('deal words', () => {
  const words = ['deal', 'off', 'drops'];
  assert.ok(hasDealWords('MacBook Neo drops to $529', words));
  assert.ok(!hasDealWords('Apple announces MacBook Neo at $599', words));
  assert.ok(hasDealWords('MacBook Neo $529 (Reg. $599)', words));
});

test('money', () => {
  assert.equal(money(1899), '$1,899');
  assert.equal(money(849.99), '$849.99');
});
