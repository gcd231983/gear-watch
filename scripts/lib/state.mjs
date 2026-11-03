// Turns one run's raw listings into offers per watched item and keeps a running history.
import { matchesItem, pickPrice, hasDealWords, hasPhrase } from './text.mjs';

export const DEAL_DAYS = 7;        // a deal post counts for a week after it's published
export const REFURB_GRACE_H = 30;  // keep refurb listings this long if Apple's page can't be read
export const DAILY_KEEP = 120;     // days of daily lows to keep

const H = 3600 * 1000;

export function emptyHistory() {
  return { version: 1, lastRun: null, runs: 0, items: {}, sources: {}, alerts: {} };
}

export function loadHistory(obj) {
  const h = obj && typeof obj === 'object' && obj.version === 1 ? obj : emptyHistory();
  h.items ||= {};
  h.sources ||= {};
  h.alerts ||= {};
  return h;
}

const needsDealWords = (source) => source.type !== 'apple-refurb' && !source.dealsOnly;

// Listings that mention a watched product but didn't count, with the reason.
// Saved to data/near-misses.json each run so matching rules are easy to tune.
export function explainMisses(raw, source, items, cfg, limit = 40) {
  const out = [];
  for (const r of raw) {
    const family = items.filter((it) => hasPhrase(r.title, it.match?.all?.[0] || ''));
    if (!family.length) continue;
    const matched = family.filter((it) => matchesItem(r.title, it, cfg.excludeEverywhere));
    let reason = null;
    if (needsDealWords(source) && !hasDealWords(r.title, cfg.dealWords)) reason = 'no deal words in the title';
    else if (!matched.length) reason = 'mentions ' + family[0].match.all[0] + ' but no watched item matched (other model, accessory or excluded word)';
    else if (r.price == null && matched.every((it) => pickPrice(r.title, it.price, it.range) == null)) reason = 'matched ' + matched.map((m) => m.id).join(', ') + ' but no believable price in the title';
    if (reason) out.push({ source: source.id, title: r.title, reason, ...(r.price != null ? { price: r.price } : {}) });
    if (out.length >= limit) break;
  }
  return out;
}

// raw: [{ title, url, price?, publishedAt?, query? }] from one source.
// Returns [{ itemId, offer }] for every listing that is one of the watched items.
export function matchListings(raw, source, items, cfg) {
  const out = [];
  for (const r of raw) {
    if (needsDealWords(source) && !hasDealWords(r.title, cfg.dealWords)) continue;
    for (const item of items) {
      if (!matchesItem(r.title, item, cfg.excludeEverywhere)) continue;
      const price = r.price ?? pickPrice(r.title, item.price, item.range);
      if (price == null) continue;
      out.push({
        itemId: item.id,
        offer: {
          price,
          title: r.title,
          url: r.url || '',
          source: source.id,
          kind: source.type === 'apple-refurb' ? 'refurb' : 'deal',
          publishedAt: r.publishedAt || null
        }
      });
    }
  }
  return out;
}

function dayKey(iso, tz = 'America/New_York') {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: tz });
}

// results: [{ source, ok, error, count, matches: [{itemId, offer}] }]
// cfg (optional): { excludeEverywhere }. When given, saved offers are rechecked against the
// current matching rules every run, so a rule change cleans up old entries right away.
export function applyRun(history, items, results, now, cfg = null) {
  const h = history;
  const nowMs = new Date(now).getTime();
  h.lastRun = now;
  h.runs = (h.runs || 0) + 1;

  for (const r of results) {
    const prev = h.sources[r.source.id] || {};
    h.sources[r.source.id] = r.ok
      ? { ok: true, lastOk: now, failStreak: 0, lastCount: r.count, lastError: null, failingSince: null }
      : {
          ok: false,
          lastOk: prev.lastOk || null,
          failStreak: (prev.failStreak || 0) + 1,
          lastCount: 0,
          lastError: String(r.error || 'Unknown error').slice(0, 300),
          failingSince: prev.ok === false && prev.failingSince ? prev.failingSince : now
        };
  }

  for (const item of items) {
    const rec = (h.items[item.id] ||= { offers: [], daily: [], lowest: null });
    let offers = rec.offers || [];

    for (const r of results) {
      if (!r.ok) continue;
      const fresh = r.matches.filter((m) => m.itemId === item.id).map((m) => m.offer);
      if (r.source.type === 'apple-refurb') {
        // The refurb page is a full snapshot: whatever isn't listed now is gone.
        const before = new Map(offers.filter((o) => o.source === r.source.id).map((o) => [o.url + '|' + o.price, o]));
        offers = offers.filter((o) => o.source !== r.source.id);
        for (const o of fresh) {
          const old = before.get(o.url + '|' + o.price);
          offers.push({ ...o, firstSeen: old?.firstSeen || now, lastSeen: now });
        }
      } else {
        for (const o of fresh) {
          const key = (o.url || o.title) + '|' + o.price;
          const i = offers.findIndex((x) => (x.url || x.title) + '|' + x.price === key);
          if (i >= 0) offers[i] = { ...offers[i], lastSeen: now };
          else offers.push({ ...o, firstSeen: now, lastSeen: now });
        }
      }
    }

    if (cfg) offers = offers.filter((o) => matchesItem(o.title, item, cfg.excludeEverywhere));
    offers = offers.filter((o) => {
      if (o.kind === 'refurb') return nowMs - new Date(o.lastSeen).getTime() <= REFURB_GRACE_H * H;
      const t = new Date(o.publishedAt || o.firstSeen).getTime();
      return nowMs - t <= DEAL_DAYS * 24 * H;
    });
    offers.sort((a, b) => a.price - b.price);
    rec.offers = offers.slice(0, 25);

    const best = rec.offers[0] || null;
    rec.best = best;
    if (best) {
      if (!rec.lowest || best.price < rec.lowest.price) rec.lowest = { ...best, at: now };
      const d = dayKey(now);
      const last = rec.daily[rec.daily.length - 1];
      if (last && last.d === d) last.low = Math.min(last.low, best.price);
      else rec.daily.push({ d, low: best.price });
      if (rec.daily.length > DAILY_KEEP) rec.daily = rec.daily.slice(-DAILY_KEEP);
    }
  }

  // Forget items that were removed from the watchlist.
  const ids = new Set(items.map((i) => i.id));
  for (const id of Object.keys(h.items)) if (!ids.has(id)) delete h.items[id];

  return h;
}

export function itemStatus(item, rec) {
  const best = rec?.best;
  if (!best) return 'none';
  return best.price <= item.target ? 'hit' : 'watching';
}
