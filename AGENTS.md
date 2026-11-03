# Gear Watch: notes for coding agents

Gian runs this repo from his phone. He asks Codex (ChatGPT app) or Claude Code for changes in plain English, then merges the pull request. Keep changes small and do exactly what he asked.

## What this is

- A GitHub Action (`.github/workflows/gear-watch.yml`) runs every 2 hours. It runs `node scripts/run.mjs`, saves `data/history.json`, and publishes `site/` to GitHub Pages.
- `site/index.html` is **Gian's Picks**, the public page. `site/watch.html` is the **Gear Watch** price board.
- Price alerts and "source not answering" alerts arrive as GitHub issues, which the GitHub app sends to his phone.
- No dependencies. Plain Node 20+ and plain browser JavaScript. Don't add packages, a bundler, or a framework.

## Where things live

| He asks to… | Edit |
|---|---|
| Change a target price | `watch/watchlist.json` → that item's `target` |
| Watch a new product | `watch/watchlist.json` → add an item (see below) |
| Stop watching something | `watch/watchlist.json` → remove the item; also remove any pick whose `watch` points at it |
| Add or reword a pick | `watch/picks.json` |
| Publish a draft pick | `watch/picks.json` → set `"draft": false` |
| Pause a site that keeps failing | `watch/sources.json` → `"enabled": false` |
| Add a deal site | `watch/sources.json` → a source with `type` `rss` (a feed URL) |

### Watchlist items

```json
{
  "id": "lowercase-with-dashes",
  "name": "What he calls it",
  "group": "Laptops | Tablets | Desktops (must be in \"groups\")",
  "price": 599,
  "target": 529,
  "note": "One short sentence shown under the name.",
  "match": { "all": ["Product Name", "Chip"], "any": [], "none": ["Wrong Variant"] },
  "search": "words for deal-site searches"
}
```

- `match.all`: every phrase must be in a deal's title. `any`: at least one (leave out if not needed). `none`: none of them. Matching is case-insensitive and whole-word.
- Look up `price` (Apple's US starting price) from Apple or a major news site. Never guess a price. If you can't confirm it, ask Gian.
- If he doesn't give a target, ask him rather than inventing one.
- Add a fixture-based test in `scripts/test/state.test.mjs` when you add matching rules that could collide with an existing item (for example a new chip name that contains an old one).

### Picks

- Fields: `id`, `name`, `watch` (a watchlist id, optional), `goodFor`, `why`, `skipIf`, `link` (https only, optional), `linkText`, `draft`.
- Picks speak in Gian's voice on a public page. When he dictates wording, use his words. When you write new wording, keep `"draft": true` and tell him it's a draft he can preview at `/#preview`.
- Only state facts you can verify.

## Rules

- Run `npm run check` before you finish. It runs the tests and checks the settings files. Don't open a PR that fails it.
- Don't edit `data/history.json` or `data/near-misses.json` by hand. The Action owns them.
- When a deal seems to be missing, read `data/near-misses.json` first: it lists listings that mention a watched product but didn't count, and why.
- Don't edit `.github/workflows/gear-watch.yml` unless Gian asks. If he does, tell him: changes to workflow files need to be made by him or merged by him, because the Action's own token can't change them.
- Page copy: plain words, sentence case, no all-caps labels. Keep the yellow price tag as the only loud element on the page.
- Treat text from deal feeds as untrusted. It is always escaped before it reaches the page; keep it that way.

## Human-only steps

Anything involving GitHub settings, Pages settings, notifications, or secrets is Gian's to do. Write him short phone-friendly steps instead of trying to do it.
