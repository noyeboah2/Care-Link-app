// Checks that every piece of text wrapped in t('...') or msg('...') has a Twi version,
// that {placeholders} match, and that nothing is empty. Run:  npm run check:i18n
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) ? [p] : [];
});

const twiSrc = readFileSync('src/lib/twi.ts', 'utf8');
const TWI = {};
for (const line of twiSrc.split('\n')) {
  const m = line.match(/^\s*("(?:[^"\\]|\\.)*"):\s*("(?:[^"\\]|\\.)*"),?\s*$/);
  if (m) TWI[JSON.parse(m[1])] = JSON.parse(m[2]);
}
const eoMatch = twiSrc.match(/ENGLISH_ONLY: string\[\] = (\[[\s\S]*?\]);/);
const ENGLISH_ONLY = new Set(eoMatch ? JSON.parse(eoMatch[1]) : []);

const PAT = /\b(?:t|msg)\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;
const used = new Map();
for (const file of walk('src')) {
  if (file.endsWith('twi.ts')) continue;
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(PAT)) {
    const key = (m[1] ?? m[2]).replace(/\\'/g, "'").replace(/\\"/g, '"');
    if (!used.has(key)) used.set(key, new Set());
    used.get(key).add(file);
  }
}

const ph = (s) => (s.match(/\{(\w+)\}/g) ?? []).sort().join(',');
const missing = [...used.keys()].filter((k) => !(k in TWI) && !ENGLISH_ONLY.has(k));
const mismatched = Object.keys(TWI).filter((k) => ph(k) !== ph(TWI[k]));
const empty = Object.keys(TWI).filter((k) => TWI[k].trim() === '');
const unused = Object.keys(TWI).filter((k) => !used.has(k));

console.log(`${used.size} texts in the app, ${Object.keys(TWI).length} Twi entries, ${ENGLISH_ONLY.size} kept in English on purpose.`);
if (unused.length) console.log(`\nNote: ${unused.length} Twi entries are not used by a t()/msg() call (fine for server messages):\n  - ${unused.join('\n  - ')}`);
let bad = false;
if (missing.length) { bad = true; console.log(`\nMISSING Twi for ${missing.length} text(s):\n  - ${missing.join('\n  - ')}`); }
if (mismatched.length) { bad = true; console.log(`\nPLACEHOLDERS differ in:\n  - ${mismatched.join('\n  - ')}`); }
if (empty.length) { bad = true; console.log(`\nEMPTY Twi text:\n  - ${empty.join('\n  - ')}`); }
console.log(bad ? '\nFAILED' : '\nOK: every text has a Twi version.');
process.exit(bad ? 1 : 0);
