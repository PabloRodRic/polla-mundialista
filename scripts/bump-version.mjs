// Auto-increments the patch number in src/version.js.
// Invoked by the pre-commit git hook (.githooks/pre-commit) so the version
// bumps on every commit. Bump major/minor by hand in src/version.js when you
// want them; the patch keeps counting up from wherever you leave it.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, 'src', 'version.js');

const src = readFileSync(file, 'utf8');
const match = src.match(/APP_VERSION = '(\d+)\.(\d+)\.(\d+)'/);

if (!match) {
  console.error('bump-version: could not find APP_VERSION in src/version.js');
  process.exit(1);
}

const [, major, minor, patch] = match;
const next = `${major}.${minor}.${Number(patch) + 1}`;
const updated = src.replace(/APP_VERSION = '\d+\.\d+\.\d+'/, `APP_VERSION = '${next}'`);

writeFileSync(file, updated);
console.log(`bump-version: ${major}.${minor}.${patch} -> ${next}`);
