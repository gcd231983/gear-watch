# Gear Watch

Gian's tech price tracker and the public **Gian's Picks** page.

- **Gian's Picks:** `https://<your-username>.github.io/gear-watch/`
- **Gear Watch price board:** `https://<your-username>.github.io/gear-watch/watch.html`
- **Preview draft picks:** add `#preview` to the end of the Picks address

## How it works

Every 2 hours a GitHub Action checks Apple's Certified Refurbished store and several deal feeds, matches listings to the items in `watch/watchlist.json`, saves the results in `data/history.json`, and republishes the pages. It costs nothing: no API keys, no AI calls, and public repos get free Actions minutes.

When an item is at or under its target, a GitHub issue opens and the GitHub app notifies your phone. If one source stops answering for 3 checks in a row, you get one issue about it, and it closes itself when the source recovers.

## Changing things

| To… | Edit |
|---|---|
| Change a target | `watch/watchlist.json` |
| Add or remove a product | `watch/watchlist.json` |
| Write, edit or publish a pick | `watch/picks.json` (`"draft": false` makes it public) |
| Pause a source | `watch/sources.json` (`"enabled": false`) |

Edit in the GitHub web editor, or ask Codex or Claude Code (see `AGENTS.md`). Every change you commit republishes the pages within a couple of minutes.

## For developers

`npm test` runs the tests. `npm run check` runs the tests and validates the settings files. `node scripts/run.mjs` does one check locally; without a `GITHUB_TOKEN` it prints alerts instead of sending them.
