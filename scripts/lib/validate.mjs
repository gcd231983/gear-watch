// Checks the three settings files and returns a list of plain-English problems (empty = fine).

const isNum = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;

export function validateConfig(watchlist, sourcesCfg, picks) {
  const p = [];
  const items = Array.isArray(watchlist?.items) ? watchlist.items : null;
  if (!items) return ['watch/watchlist.json needs an "items" list.'];
  const ids = new Set();
  const groups = new Set(watchlist.groups || []);
  for (const [i, it] of items.entries()) {
    const where = `watchlist item ${i + 1}${it?.name ? ` (${it.name})` : ''}`;
    if (!it.id || !/^[a-z0-9-]+$/.test(it.id)) p.push(`${where}: "id" must be lowercase letters, numbers and dashes.`);
    else if (ids.has(it.id)) p.push(`${where}: id "${it.id}" is used twice.`);
    ids.add(it.id);
    if (!it.name) p.push(`${where}: needs a "name".`);
    if (!isNum(it.price)) p.push(`${where}: "price" must be a number like 599.`);
    if (!isNum(it.target)) p.push(`${where}: "target" must be a number like 529.`);
    if (!it.match?.all?.length) p.push(`${where}: "match.all" needs at least one phrase.`);
    if (groups.size && !groups.has(it.group)) p.push(`${where}: group "${it.group}" isn't in "groups".`);
  }

  const srcs = Array.isArray(sourcesCfg?.sources) ? sourcesCfg.sources : null;
  if (!srcs) p.push('watch/sources.json needs a "sources" list.');
  else {
    const sids = new Set();
    for (const s of srcs) {
      if (!s.id || sids.has(s.id)) p.push(`source "${s.id}": id missing or used twice.`);
      sids.add(s.id);
      if (!['apple-refurb', 'rss', 'rss-search'].includes(s.type)) p.push(`source "${s.id}": type must be apple-refurb, rss or rss-search.`);
      if (!/^https:\/\//.test(s.url || '')) p.push(`source "${s.id}": url must start with https://`);
      if (s.type === 'rss-search' && !String(s.url).includes('{query}')) p.push(`source "${s.id}": url needs {query} where the search words go.`);
    }
  }

  if (!Array.isArray(picks?.sections)) p.push('watch/picks.json needs a "sections" list.');
  else {
    const pids = new Set();
    for (const sec of picks.sections) {
      if (!sec.name) p.push('a picks section is missing its "name".');
      for (const pk of sec.picks || []) {
        const where = `pick "${pk.name || pk.id}"`;
        if (!pk.id || pids.has(pk.id)) p.push(`${where}: id missing or used twice.`);
        pids.add(pk.id);
        if (!pk.name) p.push(`${where}: needs a "name".`);
        if (pk.watch && !ids.has(pk.watch)) p.push(`${where}: "watch" is "${pk.watch}", but no watchlist item has that id.`);
        if (pk.link && !/^https:\/\//.test(pk.link)) p.push(`${where}: "link" must start with https://`);
      }
    }
  }
  return p;
}
