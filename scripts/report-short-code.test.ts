/* ============================================================
   SHORT REPORT CODE — the /r/<code> link, its alphabet, and the ONE property that makes it safe:
   the TS resolver and the SQL generator must agree on the alphabet and length, or a code the DB
   produces could fail the TS guard (or vice-versa) and a prospect's link would 404.

   Run: npx tsx scripts/report-short-code.test.ts
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import {
  SHORT_CODE_ALPHABET, SHORT_CODE_LEN, isShortCode, shortReportUrl, auditCodeFromSlug,
} from '../src/lib/reportSlug.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
let failures = 0;
function ok(cond: boolean, msg: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  if (!cond) failures++;
}

console.log('\n── THE ALPHABET IS UNAMBIGUOUS ──');
ok(SHORT_CODE_LEN === 6, `length is 6 (got ${SHORT_CODE_LEN})`);
ok(SHORT_CODE_ALPHABET.length === 31, `alphabet is 31 chars (got ${SHORT_CODE_ALPHABET.length})`);
for (const bad of ['0', '1', 'o', 'l', 'i']) {
  ok(!SHORT_CODE_ALPHABET.includes(bad), `alphabet excludes the ambiguous char "${bad}"`);
}
ok(new Set(SHORT_CODE_ALPHABET).size === SHORT_CODE_ALPHABET.length, 'alphabet has no repeats');

console.log('\n── TS AND SQL AGREE (the whole point of this file) ──');
{
  const sql = fs.readFileSync(
    path.join(ROOT, 'supabase/migrations/20260917120000_ai_audits_short_code.sql'), 'utf8');
  // The generator's alphabet literal, and its 1..N loop bound.
  const alpha = sql.match(/alphabet\s+constant\s+text\s*:=\s*'([^']+)'/);
  ok(!!alpha && alpha[1] === SHORT_CODE_ALPHABET,
    `SQL gen_audit_short_code alphabet === SHORT_CODE_ALPHABET (got ${alpha?.[1]})`);
  const loop = sql.match(/FOR\s+i\s+IN\s+1\.\.(\d+)\s+LOOP/);
  ok(!!loop && Number(loop[1]) === SHORT_CODE_LEN,
    `SQL generator loops SHORT_CODE_LEN times (got ${loop?.[1]})`);
}

console.log('\n── isShortCode ACCEPTS ONLY A BARE 6-CHAR CODE ──');
ok(isShortCode('k4m2p9'), 'accepts the canonical example k4m2p9');
ok(isShortCode('K4M2P9'), 'accepts upper-case (stored lower, resolved case-insensitively)');
ok(!isShortCode('k4m2p'), 'rejects 5 chars');
ok(!isShortCode('k4m2p99'), 'rejects 7 chars');
ok(!isShortCode('k4m2p0'), 'rejects an ambiguous char (0)');
ok(!isShortCode('k4m2pl'), 'rejects an ambiguous char (l)');
ok(!isShortCode('143e5efb-1542-4e2a-bee0-e65d940d7897'), 'rejects a UUID');
ok(!isShortCode('dan-electrician-e8d4a0b0'), 'rejects a name+8-hex slug');
ok(!isShortCode(''), 'rejects empty');

console.log('\n── A SHORT CODE AND A LEGACY SLUG CAN NEVER BE CONFUSED ──');
// The legacy slug resolver requires a "-<8hex>" suffix; a bare short code has neither hyphen nor
// 8-hex tail, so exactly one of the two branches can ever claim any given string.
ok(auditCodeFromSlug('k4m2p9') === null, 'a short code is not read as a legacy 8-hex slug');
ok(!isShortCode('dan-e8d4a0b0'), 'a legacy slug is not read as a short code');

console.log('\n── THE URL ──');
ok(shortReportUrl('k4m2p9') === 'https://findable.live/r/k4m2p9', 'shortReportUrl builds findable.live/r/<code>');

console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
if (failures) throw new Error(`${failures} failures`);
