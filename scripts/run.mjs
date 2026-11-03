// Gear Watch: one check of every source. Run by the GitHub Action every 2 hours.
//   node scripts/run.mjs
// Environment (all optional):
//   GITHUB_TOKEN, GITHUB_REPOSITORY   send alerts as GitHub issues (set automatically in Actions)
//   GW_NOW                            pretend it's this time (tests)
//   GW_SOURCES                        path to a different sources.json (tests)
//   GW_GITHUB_API                     a different GitHub API base URL (tests)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getText } from './lib/http.mjs';
import { parseFeed, looksLikeFeed } from './lib/rss.mjs';
import { parseRefurb } from './lib/apple-refurb.mjs';
import { loadHistory, matchListings, applyRun, itemStatus, explainMisses } from './lib/state.mjs';
import { planAlerts, sendAlerts } from './lib/alerts.mjs';
import { makeGitHub } from './lib/github.mjs';
import { validateConfig } from './lib/validate.mjs';
import { money } from './lib/text.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (p, fallback) => {
  try {
    return JSON.parse(await fs.readFile(p, 'utf8'));
  } catch (err) {
    if (fallback !== undefined && err.code === 'ENOENT') return fallback;
    throw new Error(`Could not read ${path.relative(ROOT, p)}: ${err.message}`);
  }
};

export async function readSource(source, items, { get = getText } = {}) {
  if (source.type === 'apple-refurb') {
    const { tiles, method } = parseRefurb(await get(source.url));
    if (!tiles.length) throw new Error('No listings found on the page. Apple may have changed its layout.');
    return { raw: tiles, note: method };
  }
  if (source.type === 'rss') {
    const xml = await get(source.url);
    if (!looksLikeFeed(xml)) throw new Error('Got a web page instead of a feed. The site may be blocking automated requests.');
    const raw = parseFeed(xml);
    if (!raw.length) throw new Error('The feed came back empty.');
    return { raw };
  }
  if (source.type === 'rss-search') {
    const raw = [];
    const errors = [];
    const queries = [...new Set(items.map((i) => i.search).filter(Boolean))];
    for (const q of queries) {
      try {
        const xml = await get(source.url.replace('{query}', encodeURIComponent(q)));
        if (!looksLikeFeed(xml)) throw new Error('Got a web page instead of a feed. The site may be blocking automated requests.');
        for (const e of parseFeed(xml)) raw.push({ ...e, query: q });
      } catch (err) {
        errors.push(err);
      }
    }
    if (errors.length === queries.length && queries.length) throw errors[0];
    return { raw };
  }
  throw new Error(`Unknown source type "${source.type}"`);
}

export function pagesUrl(repo) {
  if (!repo) return './';
  const [owner, name] = repo.split('/');
  const host = `${owner.toLowerCase()}.github.io`;
  return name.toLowerCase() === host ? `https://${host}/` : `https://${host}/${name}/`;
}

export function buildSiteData(history, watchlist, sourcesCfg, picks, ctx) {
  const items = watchlist.items.map((item) => {
    const rec = history.items[item.id] || {};
    return {
      id: item.id,
      name: item.name,
      group: item.group,
      price: item.price,
      target: item.target,
      note: item.note || '',
      status: itemStatus(item, rec),
      best: rec.best || null,
      offers: (rec.offers || []).slice(0, 8),
      lowest: rec.lowest || null,
      daily: (rec.daily || []).slice(-60)
    };
  });
  const sources = sourcesCfg.sources
    .filter((s) => s.enabled !== false)
    .map((s) => ({ id: s.id, name: s.name, type: s.type, ...(history.sources[s.id] || { ok: null }) }));
  return {
    generatedAt: history.lastRun,
    everyHours: 2,
    pagesUrl: ctx.pagesUrl,
    repo: ctx.repo || null,
    groups: watchlist.groups,
    items,
    sources,
    picks
  };
}

export async function main({ root = ROOT, env = process.env, get, fetchImpl, log = console.log } = {}) {
  const watchlist = await readJson(path.join(root, 'watch/watchlist.json'));
  const sourcesCfg = await readJson(env.GW_SOURCES ? path.resolve(env.GW_SOURCES) : path.join(root, 'watch/sources.json'));
  const picks = await readJson(path.join(root, 'watch/picks.json'));
  const problems = validateConfig(watchlist, sourcesCfg, picks);
  if (problems.length) throw new Error('Fix these settings first:\n- ' + problems.join('\n- '));

  const historyPath = path.join(root, 'data/history.json');
  const history = loadHistory(await readJson(historyPath, {}));
  const now = env.GW_NOW || new Date().toISOString();
  const items = watchlist.items;
  const cfg = { dealWords: sourcesCfg.dealWords || [], excludeEverywhere: watchlist.excludeEverywhere || [] };
  const enabled = sourcesCfg.sources.filter((s) => s.enabled !== false);

  const results = await Promise.all(
    enabled.map(async (source) => {
      try {
        const { raw, note } = await readSource(source, items, { get: get || ((u) => getText(u, { fetchImpl })) });
        const matches = matchListings(raw, source, items, cfg);
        const misses = explainMisses(raw, source, items, cfg);
        return { source, ok: true, count: raw.length, matches, misses, note };
      } catch (err) {
        return { source, ok: false, error: err.message, count: 0, matches: [], misses: [] };
      }
    })
  );

  applyRun(history, items, results, now);

  const repo = env.GITHUB_REPOSITORY;
  const ctx = {
    repo,
    owner: repo ? repo.split('/')[0] : 'you',
    pagesUrl: pagesUrl(repo),
    sourceName: (id) => sourcesCfg.sources.find((s) => s.id === id)?.name || id
  };
  const gh = makeGitHub({ token: env.GITHUB_TOKEN, repo, api: env.GW_GITHUB_API, fetchImpl: fetchImpl || fetch });
  await sendAlerts(planAlerts(history, items, enabled), history, ctx, gh, log);

  await fs.mkdir(path.dirname(historyPath), { recursive: true });
  await fs.writeFile(historyPath, JSON.stringify(history, null, 1) + '\n');
  await fs.writeFile(
    path.join(root, 'data/near-misses.json'),
    JSON.stringify({ checkedAt: now, note: 'Listings that mention a watched product but did not count, and why. Rewritten every run.', misses: results.flatMap((r) => r.misses || []) }, null, 1) + '\n'
  );
  const site = buildSiteData(history, watchlist, sourcesCfg, picks, ctx);
  await fs.writeFile(path.join(root, 'site/data.json'), JSON.stringify(site) + '\n');

  const lines = [
    `Gear Watch check at ${now}`,
    '',
    '| Source | Status | Listings | Matches |',
    '|---|---|---|---|',
    ...results.map((r) => `| ${r.source.name} | ${r.ok ? 'OK' : 'Failed: ' + r.error} | ${r.count} | ${r.matches.length} |`),
    '',
    '| Item | Best now | Target |',
    '|---|---|---|',
    ...site.items.map((i) => `| ${i.name} | ${i.best ? money(i.best.price) : 'none seen'} | ${money(i.target)} |`)
  ];
  log(lines.join('\n'));
  if (env.GITHUB_STEP_SUMMARY) await fs.appendFile(env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
  return { history, site, results };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
