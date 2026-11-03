// node scripts/validate.mjs  -> checks the settings files, exits 1 with reasons if something's off.
import fs from 'node:fs';
import { validateConfig } from './lib/validate.mjs';
const read = (f) => JSON.parse(fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8'));
let problems;
try {
  problems = validateConfig(read('watch/watchlist.json'), read('watch/sources.json'), read('watch/picks.json'));
} catch (err) {
  problems = ['A settings file is not valid JSON: ' + err.message];
}
if (problems.length) {
  console.error('Settings problems:\n- ' + problems.join('\n- '));
  process.exit(1);
}
console.log('Settings look good.');
