/* WHATSAPP NUMBER QUALITY RATING / TIER — the one rule (src/lib/whatsappNumberHealth.ts) and its wiring
   (2026-10-21, docs/whatsapp-number-health.md). Since 2026-11-02 yellow and red are warnings only; cannot be read never slows or
   pauses. The existing pace rules are untouched. */
import { readFileSync } from 'node:fs';
import {
  HEALTH_STALE_AFTER_MIN, healthVerdict, normaliseRating,
  tierLimit, tierWords,
} from '../src/lib/whatsappNumberHealth.ts';

let failures = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('  ✓ ' + m); else { failures++; console.error('  ✗ ' + m); } };
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const now = new Date('2026-10-21T10:00:00Z');
const fresh = new Date(now.getTime() - 10 * 60_000).toISOString();
const stale = new Date(now.getTime() - (HEALTH_STALE_AFTER_MIN + 1) * 60_000).toISOString();
const at = (rating: string | null, okAt: string | null = fresh) => healthVerdict({ meta_quality_rating: rating, meta_messaging_tier: 'TIER_1K', meta_health_ok_at: okAt }, now);

console.log('ratings');
ok(normaliseRating('green') === 'GREEN' && normaliseRating(' Red ') === 'RED' && normaliseRating('NA') === 'UNKNOWN' && normaliseRating(null) === 'UNKNOWN', 'Meta words normalise; anything else is UNKNOWN');

console.log('green');
const g = at('GREEN');
ok(g.state === 'green' && g.limitText === null, 'green changes nothing');

console.log('yellow');
const y = at('YELLOW');
ok(y.state === 'yellow' && /warning/.test(y.limitText ?? ''), 'yellow is a warning');

console.log('red');
const r = at('RED');
ok(r.state === 'red' && /warning/.test(r.limitText ?? ''), 'red is a warning');
/* 2026-11-02: RED warns, nothing else (scripts/whatsapp-cold-guard.test.ts holds the tripwire and that no rating changes a cap). */

console.log('cannot be read');
for (const [why, v] of [['never read', healthVerdict(null, now)], ['stale', at('GREEN', stale)], ['UNKNOWN', at('UNKNOWN')], ['bad date', at('GREEN', 'nope')]] as const) {
  ok(v.state === 'unreadable' && /carries on/.test(v.limitText ?? ''), `${why}: never slows sending`);
}

console.log('tiers');
ok(tierLimit('TIER_250') === 250 && tierLimit('TIER_1K') === 1000 && tierLimit('TIER_10K') === 10000 && tierLimit('TIER_UNLIMITED') === null && tierLimit(null) === null, 'tier words → limits');
ok(tierWords('TIER_1K') === '1,000 new people a day' && tierWords('TIER_UNLIMITED') === 'Unlimited' && tierWords(null) === null, 'tier in plain words');

console.log('wiring');
const q = read('supabase/functions/process-whatsapp-queue/index.ts');
ok(/autoPauseVerdict\(rows\.length, failed\)/.test(q), 'the failure-burst auto-pause is still there');
ok(/SEND_GAP_JITTER_LOW \+ Math\.random\(\)/.test(q), 'the random gap is unchanged');
const w = read('supabase/functions/whatsapp-number-health/index.ts');
ok(/requireAdmin\(req, /.test(w) && /x-cron-secret/.test(w), 'the watcher is cron or admin only');
ok(!/\.send|messages`/.test(w) && !/console\.(log|error|warn)\([^)]*token/i.test(w), 'the watcher sends nothing and never logs the token');
ok(/if \(mode === "probe"\) return json/.test(w), 'probe answers before any write');
ok(/if \(!reading\.ok\) \{[\s\S]*?meta_health_error: reading\.error[\s\S]*?return json/.test(w), 'a failed read stores only the failure');
ok(!/if \(!reading\.ok\) \{[^}]*paused/.test(w), 'a failed read never pauses');
ok(!/paused: true/.test(w) && /tripwireReason\(/.test(w), 'the watcher pauses nothing; it latches the cold stop through the one rule');
ok(/\[functions\.whatsapp-number-health\]\nverify_jwt = false/.test(read('supabase/config.toml')), 'config.toml lists the watcher');
const m = read('supabase/migrations/20261119090000_whatsapp_number_health.sql');
ok(/enable row level security/.test(m) && /revoke all on public\.whatsapp_number_health_log from anon, authenticated/.test(m), 'the log is service role only');
ok(!/\b(drop table|delete from|truncate)\b/i.test(m), 'the migration is additive');
const ui = read('src/components/WhatsAppPaceSettings.tsx');
ok(/NumberHealthLine/.test(ui) && /queue-number-health/.test(ui), 'the pace settings show the rating and tier');

if (failures) { console.error(`\n${failures} failed`); process.exit(1); }
console.log('\nall passed');
