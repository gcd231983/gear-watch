// Text helpers shared by every source. No dependencies.

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…',
  ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
  dollar: '$', reg: '®', trade: '™', copy: '©', times: '×', minus: '−'
};

export function decodeEntities(s) {
  return String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    const v = NAMED[code.toLowerCase()];
    return v === undefined ? m : v;
  });
}

export function stripTags(s) {
  return String(s ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, ' ');
}

// Apple uses non-breaking hyphens ("14‑inch") and odd spaces; deal sites use curly quotes.
export function normalize(s) {
  return decodeEntities(String(s ?? ''))
    .normalize('NFKC')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, '-')
    .replace(/[\u00a0\u2007\u202f\u2009]/g, ' ')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

const cache = new Map();
function phraseRegex(phrase) {
  if (cache.has(phrase)) return cache.get(phrase);
  const esc = normalize(phrase)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/[ -]+/g, '[\\s-]*');
  // Whole words only: "M4" must not match "M40", "stand" must not match "standard".
  // A trailing "s" is allowed so "MacBook Pros" still counts.
  const re = new RegExp(`(?<![a-z0-9])${esc}s?(?![a-z0-9])`, 'i');
  cache.set(phrase, re);
  return re;
}

export function hasPhrase(text, phrase) {
  return phraseRegex(phrase).test(normalize(text));
}

export function matchesItem(title, item, excludeEverywhere = []) {
  const t = normalize(title);
  const m = item.match || {};
  const all = m.all || [];
  const any = m.any || [];
  const none = m.none || [];
  if (!all.length) return false;
  if (!all.every((p) => phraseRegex(p).test(t))) return false;
  if (any.length && !any.some((p) => phraseRegex(p).test(t))) return false;
  if (none.some((p) => phraseRegex(p).test(t))) return false;
  if (excludeEverywhere.some((p) => phraseRegex(p).test(t))) return false;
  return true;
}

export function hasDealWords(title, words = []) {
  if (!words.length) return true;
  const t = normalize(title);
  return words.some((w) => phraseRegex(w).test(t)) || /\$\s?\d[\d,]*(?:\.\d{2})?\s*\(\s*(?:reg|orig|was)/i.test(t);
}

// Every "$1,299.99"-style amount in the text, with what surrounds it.
export function findAmounts(text) {
  const t = normalize(text);
  const re = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?(k)?/gi;
  const out = [];
  let m;
  while ((m = re.exec(t))) {
    let value = Number(m[1].replace(/,/g, '') + (m[2] ? '.' + m[2] : ''));
    if (m[3]) value *= 1000;
    out.push({
      value,
      before: t.slice(Math.max(0, m.index - 16), m.index).toLowerCase(),
      after: t.slice(m.index + m[0].length, m.index + m[0].length + 18).toLowerCase()
    });
  }
  return out;
}

const NOT_A_PRICE_BEFORE = /(save|saving|savings|reg\.?|regular|orig\.?|originally|was|list|msrp|up to|value|worth|extra|additional|plus|get|bonus|credit|trade-in)\s*:?\s*\(?\s*$/;
const NOT_A_PRICE_AFTER = /^\s*(off|discount|savings|saving|less|cheaper|lower|gift|credit|rebate|bonus|cash back|reward|in savings|instant)/;

// The asking price in a deal title, or null. "price" is Apple's price, used to throw out
// numbers that can't be this product (a $29 case, "$300 off").
export function pickPrice(title, price, range) {
  const lo = range?.[0] ?? price * 0.35;
  const hi = range?.[1] ?? price * 3;
  const candidates = findAmounts(title).filter(
    (a) => !NOT_A_PRICE_BEFORE.test(a.before) && !NOT_A_PRICE_AFTER.test(a.after) && a.value >= lo && a.value <= hi
  );
  if (!candidates.length) return null;
  return Math.min(...candidates.map((c) => c.value));
}

export function money(n) {
  if (n == null || !Number.isFinite(n)) return '';
  const whole = Math.abs(n - Math.round(n)) < 0.005;
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
}
