// Reads RSS 2.0 and Atom feeds into { title, url, publishedAt } entries.
import { normalize, stripTags, decodeEntities } from './text.mjs';

function tag(block, name) {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i');
  const m = block.match(re);
  return m ? m[1] : '';
}

function clean(s) {
  return normalize(stripTags(s));
}

function toIso(s) {
  const d = new Date(clean(s));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function parseFeed(xml) {
  const text = String(xml ?? '');
  const entries = [];

  const items = text.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) || [];
  for (const block of items) {
    const title = clean(tag(block, 'title'));
    let url = clean(tag(block, 'link'));
    if (!url) {
      const guid = clean(tag(block, 'guid'));
      if (/^https?:\/\//.test(guid)) url = guid;
    }
    const publishedAt = toIso(tag(block, 'pubDate') || tag(block, 'dc:date'));
    if (title) entries.push({ title, url: decodeEntities(url), publishedAt });
  }

  if (!items.length) {
    const atom = text.match(/<entry(?:\s[^>]*)?>[\s\S]*?<\/entry>/gi) || [];
    for (const block of atom) {
      const title = clean(tag(block, 'title'));
      const alt = block.match(/<link[^>]*rel=["']alternate["'][^>]*>/i) || block.match(/<link[^>]*>/i);
      const href = alt ? (alt[0].match(/href=["']([^"']+)["']/i) || [])[1] : '';
      const publishedAt = toIso(tag(block, 'published') || tag(block, 'updated'));
      if (title) entries.push({ title, url: decodeEntities(href || ''), publishedAt });
    }
  }

  return entries;
}

export function looksLikeFeed(xml) {
  return /<(rss|feed|rdf:RDF)[\s>]/i.test(String(xml ?? '').slice(0, 2000));
}
