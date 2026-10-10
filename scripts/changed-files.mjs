/* THE CHANGED-FILES SET — shared by `npm run check:quick` and `npm run test:changed` (2026-10-10, verification tiers, CLAUDE.md §3a).
   "Changed" = everything that differs from origin/main: commits on this branch, staged and unstaged edits, and new untracked files.
   Falls back to HEAD when origin/main is not fetched. Deleted files are dropped (nothing to lint or find tests for).
   ⛔ This only SELECTS what to run while working. It never replaces the full gate (`npm run check`) before a commit / push / deploy. */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '..');
const git = (...args) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' }).stdout.split('\n').map((s) => s.trim()).filter(Boolean);

export function changedFiles() {
  const base = spawnSync('git', ['rev-parse', '--verify', '-q', 'origin/main'], { cwd: ROOT, encoding: 'utf8' }).status === 0 ? 'origin/main' : 'HEAD';
  const all = new Set([
    ...git('diff', '--name-only', `${base}...HEAD`),
    ...git('diff', '--name-only', 'HEAD'),
    ...git('diff', '--name-only', '--cached'),
    ...git('ls-files', '--others', '--exclude-standard'),
  ]);
  return [...all].filter((f) => existsSync(path.join(ROOT, f))).sort();
}

/** Paths that make the FULL gate mandatory whatever the size of the change (CLAUDE.md §3a): auth / tenancy / permissions, database and
 *  migrations, WhatsApp / SMS / email sending, payments, secrets handling, and the gate's own config. */
export const FULL_GATE_PATHS = [
  [/^supabase\/migrations\//, 'a database migration'],
  [/^supabase\/config\.toml$/, 'edge function auth config (verify_jwt)'],
  [/(^|\/)(access|auth|permissions?|rls|suppression|protection|leadAccess|leadPermissions|useAuth|RequireAdmin|salesPatchPlan|roleRules)\b[^/]*\.(ts|tsx)$/i, 'auth / permissions / tenancy'],
  [/(whatsapp|twilio|sms|instantly|send-|queue|inbound|first-reply|auto-reply|outreach-send|notify)/i, 'messaging / sending'],
  [/(stripe|checkout|payment|commission|billing|findableOffer|offer-price|delayed-subscription|webhook)/i, 'payments / money'],
  [/(secret|credential|token|\.env)/i, 'secrets handling'],
  [/^scripts\/(run-tests|check-[a-z-]+)\.mjs$|^package\.json$/, 'the gate itself'],
];

export function fullGateReasons(files) {
  const out = new Map();
  for (const f of files) {
    for (const [re, why] of FULL_GATE_PATHS) {
      if (re.test(f)) { out.set(why, [...(out.get(why) ?? []), f]); }
    }
  }
  return out;
}

export function printFullGateWarning(files) {
  const reasons = fullGateReasons(files);
  if (!reasons.size) return false;
  console.log('\n\x1b[33m⚠  FULL GATE REQUIRED before commit / push / deploy — this change touches:\x1b[0m');
  for (const [why, fs] of reasons) console.log(`   · ${why}: ${fs.slice(0, 4).join(', ')}${fs.length > 4 ? `, +${fs.length - 4} more` : ''}`);
  console.log('   Run `npm run check` once, after the work is finished. (Quick checks are not enough for these.)');
  return true;
}
