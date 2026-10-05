/* findable-site-dir — ONE rule for which findable-site checkout the cross-repo tests read (2026-10-05).
   The manual-onboarding "failure" of 2026-10-05 was a stale sibling copy, not a product bug; the fix is a
   single resolver that prefers the clean clone. This suite pins its order and that no test keeps a
   private copy of the path rule. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findableSiteDir } from './findable-site-dir.mjs';

let failures = 0;
function ok(cond: boolean, msg: string) { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) failures++; }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fsd-'));
const root = path.join(tmp, 'LeadFinderOS-x');
fs.mkdirSync(root);
const saved = process.env.FINDABLE_SITE_DIR;
delete process.env.FINDABLE_SITE_DIR;
ok(findableSiteDir(root) === path.join(tmp, 'findable-site'), 'no clean clone beside it → the old ../findable-site fallback');
fs.mkdirSync(path.join(tmp, 'findable-site-current', 'src'), { recursive: true });
ok(findableSiteDir(root) === path.join(tmp, 'findable-site-current'), 'a clean clone ../findable-site-current is preferred over ../findable-site');
process.env.FINDABLE_SITE_DIR = path.join(tmp, 'explicit');
ok(findableSiteDir(root) === path.join(tmp, 'explicit'), 'FINDABLE_SITE_DIR always wins');
if (saved === undefined) delete process.env.FINDABLE_SITE_DIR; else process.env.FINDABLE_SITE_DIR = saved;
fs.rmSync(tmp, { recursive: true, force: true });

/* No second copy: nothing in scripts/ builds the findable-site path itself. */
const dir = path.resolve(import.meta.dirname);
const own = new Set(['findable-site-dir.mjs', 'findable-site-dir.test.ts']);
const offenders = fs.readdirSync(dir).filter((f) => /\.(test\.ts|mjs)$/.test(f) && !own.has(f)).filter((f) => {
  const t = fs.readFileSync(path.join(dir, f), 'utf8');
  return /process\.env\.FINDABLE_SITE_DIR\s*(\|\||\?)/.test(t) || /['"]\.\.\/findable-site\//.test(t) || /['"]\.\.['"],\s*['"](\.\.['"],\s*['"])?findable-site['"]/.test(t);
});
ok(offenders.length === 0, 'every test resolves findable-site through findable-site-dir.mjs' + (offenders.length ? ' — private copies in: ' + offenders.join(', ') : ''));

console.log('\n' + (failures ? failures + ' FAILURE(S)' : 'ALL PASSED'));
if (failures) process.exit(1);
