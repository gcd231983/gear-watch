// Reads listings from Apple's Certified Refurbished store pages.
// Apple embeds the product grid as JSON (window.REFURB_GRID_BOOTSTRAP). If that ever
// disappears, a plain-HTML fallback looks for product links followed by a price.
// If both come up empty, the caller marks the source as not working.
import { normalize, stripTags, decodeEntities } from './text.mjs';

const ORIGIN = 'https://www.apple.com';

// Pull one balanced {...} object out of a string starting at "start".
export function sliceObject(src, start) {
  let depth = 0;
  let inStr = false;
  let quote = '';
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === quote) inStr = false;
      continue;
    }
    if (c === '"' || c === "'") { inStr = true; quote = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return null;
}

function absolute(url) {
  if (!url) return '';
  if (/^https?:\/\//.test(url)) return url;
  return ORIGIN + (url.startsWith('/') ? '' : '/') + url;
}

function priceFrom(obj) {
  // Known shape: price.currentPrice.raw_amount = "1189.00", amount = "$1,189.00"
  const seen = new Set();
  const stack = [obj];
  while (stack.length) {
    const o = stack.pop();
    if (!o || typeof o !== 'object' || seen.has(o)) continue;
    seen.add(o);
    if (o.raw_amount != null && Number.isFinite(Number(o.raw_amount))) return Number(o.raw_amount);
    if (typeof o.amount === 'string' && /\$\s?[\d,]+/.test(o.amount)) {
      return Number(o.amount.replace(/[^\d.]/g, ''));
    }
    for (const v of Object.values(o)) if (v && typeof v === 'object') stack.push(v);
  }
  return null;
}

function tilesFromJson(data) {
  const out = [];
  const seen = new Set();
  const stack = [data];
  while (stack.length) {
    const o = stack.pop();
    if (!o || typeof o !== 'object' || seen.has(o)) continue;
    seen.add(o);
    if (typeof o.title === 'string' && o.price && typeof o.price === 'object') {
      const price = priceFrom(o.price);
      if (price) {
        out.push({
          title: normalize(o.title),
          price,
          url: absolute(o.productDetailsUrl || o.url || o.link || '')
        });
        continue;
      }
    }
    for (const v of Object.values(o)) if (v && typeof v === 'object') stack.push(v);
  }
  return out;
}

export function parseRefurb(html) {
  const src = String(html ?? '');
  const marker = src.search(/REFURB_GRID_BOOTSTRAP\s*=\s*\{/);
  if (marker >= 0) {
    const start = src.indexOf('{', marker);
    const raw = sliceObject(src, start);
    if (raw) {
      try {
        const tiles = tilesFromJson(JSON.parse(raw));
        if (tiles.length) return { tiles, method: 'json' };
      } catch {
        // fall through to the HTML fallback
      }
    }
  }

  const tiles = [];
  const linkRe = /<a[^>]+href=["']([^"']*\/shop\/product\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = linkRe.exec(src))) {
    const title = normalize(stripTags(m[2]));
    if (!title || !/refurbished/i.test(title)) continue;
    const tail = src.slice(m.index + m[0].length, m.index + m[0].length + 1500);
    const p = stripTags(tail).match(/\$\s?(\d{1,3}(?:,\d{3})+|\d+)\.\d{2}/);
    if (!p) continue;
    tiles.push({ title, price: Number(p[1].replace(/,/g, '')), url: absolute(decodeEntities(m[1])) });
  }
  return { tiles, method: tiles.length ? 'html' : 'none' };
}
