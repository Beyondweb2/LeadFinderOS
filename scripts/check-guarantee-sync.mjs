/* ============================================================
   THE GUARANTEE MUST BE BYTE-IDENTICAL ACROSS BOTH REPOS.

   ⛔ WHY THIS IS A TEST AND NOT A COMMENT. Both files already carried a note asking for them to be
   kept in sync. They drifted anyway, and nobody noticed for weeks: LeadFinderOS's copy ended at "We
   do not promise you will be named." while findable-site's carried a further sentence. The result
   was that the sentence a customer AGREED TO at Stripe checkout was not the sentence they had read
   on the page that sold it to them. A comment cannot fail a build. This can.

   ⚠️ IT READS THE OTHER REPO OFF DISK, at a sibling path, because the two are separate git
   repositories with no shared package. If findable-site is not checked out beside this one the check
   SKIPS with a loud notice rather than passing — a silent skip would be the same failure as the
   comment, one level deeper.

   Run: node scripts/check-guarantee-sync.mjs
   ============================================================ */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MINE = path.join(HERE, '..', 'src', 'lib', 'findableOffer.ts');
const THEIRS = path.join(HERE, '..', '..', 'findable-site', 'src', 'lib', 'site.ts');

/** Pull a `export const NAME = "a" + "b";` string literal out of a source file, concatenated. */
function constant(file, name) {
  const src = fs.readFileSync(file, 'utf8');
  const m = src.match(new RegExp('export const ' + name + '\\s*=\\s*([\\s\\S]*?);'));
  if (!m) throw new Error(`${name} not found in ${file}`);
  const parts = m[1].match(/"(?:[^"\\]|\\.)*"/g);
  if (!parts) throw new Error(`${name} in ${file} is not a string literal`);
  return parts.map((p) => JSON.parse(p)).join('');
}

if (!fs.existsSync(THEIRS)) {
  console.error('SKIPPED: findable-site is not checked out at ' + THEIRS);
  console.error('The guarantee sync could NOT be verified. This is not a pass.');
  process.exit(2);
}

const mine = constant(MINE, 'FINDABLE_GUARANTEE');
const theirs = constant(THEIRS, 'GUARANTEE');

if (mine !== theirs) {
  console.error('FAIL: the guarantee has drifted between the two repos.\n');
  console.error('  LeadFinderOS  FINDABLE_GUARANTEE (' + mine.length + '):\n    ' + JSON.stringify(mine));
  console.error('  findable-site GUARANTEE          (' + theirs.length + '):\n    ' + JSON.stringify(theirs));
  const n = Math.min(mine.length, theirs.length);
  let i = 0; while (i < n && mine[i] === theirs[i]) i++;
  console.error(`\n  first difference at character ${i}:`);
  console.error('    ours  ...' + JSON.stringify(mine.slice(i, i + 60)));
  console.error('    theirs...' + JSON.stringify(theirs.slice(i, i + 60)));
  console.error('\n  This is the sentence the Stripe line item charges against. Fix BOTH.');
  process.exit(1);
}

console.log(`PASS: the guarantee is byte-identical across both repos (${mine.length} chars).`);
console.log('  ' + JSON.stringify(mine));
