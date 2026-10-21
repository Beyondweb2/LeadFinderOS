/* WHATSAPP NUMBER QUALITY RATING / TIER — the one rule (src/lib/whatsappNumberHealth.ts) and its wiring
   (2026-10-21, docs/whatsapp-number-health.md). Yellow halves the cap and blocks rises; red pauses ONCE and halves;
   cannot be read never slows or pauses, only blocks rises. The existing pace rules are untouched. */
import { readFileSync } from 'node:fs';
import {
  HEALTH_STALE_AFTER_MIN, RED_PAUSE_REASON, capRiseRefused, healthLimitedCap, healthVerdict, normaliseRating,
  shouldPauseForRating, tierLimit, tierWords,
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
ok(g.state === 'green' && !g.halveCap && !g.blockCapRise && g.limitText === null, 'green changes nothing');
ok(healthLimitedCap(800, g) === 800 && !capRiseRefused(400, 800, g), 'green: cap as set, rises allowed');

console.log('yellow');
const y = at('YELLOW');
ok(y.state === 'yellow' && y.halveCap && y.blockCapRise, 'yellow halves and blocks rises');
ok(healthLimitedCap(800, y) === 400 && healthLimitedCap(5, y) === 2 && healthLimitedCap(0, y) === 0, 'halving rounds down; 0 stays 0');
ok(capRiseRefused(400, 401, y) && !capRiseRefused(400, 400, y) && !capRiseRefused(400, 100, y), 'yellow: a rise is refused, the same or a cut is allowed');

console.log('red');
const r = at('RED');
ok(r.state === 'red' && r.halveCap && r.blockCapRise, 'red halves and blocks rises');
ok(shouldPauseForRating('GREEN', 'RED') && shouldPauseForRating(null, 'RED') && shouldPauseForRating('YELLOW', 'RED'), 'turning red pauses');
ok(!shouldPauseForRating('RED', 'RED'), 'staying red does not re-pause (a person resumed it)');
ok(!shouldPauseForRating('RED', 'YELLOW') && !shouldPauseForRating('GREEN', 'UNKNOWN'), 'nothing else pauses');
ok(/Resume/.test(RED_PAUSE_REASON), 'the red reason tells the person to resume');

console.log('cannot be read');
for (const [why, v] of [['never read', healthVerdict(null, now)], ['stale', at('GREEN', stale)], ['UNKNOWN', at('UNKNOWN')], ['bad date', at('GREEN', 'nope')]] as const) {
  ok(v.state === 'unreadable' && !v.halveCap && v.blockCapRise, `${why}: never slows sending, only blocks rises`);
  ok(healthLimitedCap(800, v) === 800, `${why}: cap untouched`);
}
ok(!shouldPauseForRating(null, 'UNKNOWN'), 'unreadable never pauses');

console.log('tiers');
ok(tierLimit('TIER_250') === 250 && tierLimit('TIER_1K') === 1000 && tierLimit('TIER_10K') === 10000 && tierLimit('TIER_UNLIMITED') === null && tierLimit(null) === null, 'tier words → limits');
ok(tierWords('TIER_1K') === '1,000 new people a day' && tierWords('TIER_UNLIMITED') === 'Unlimited' && tierWords(null) === null, 'tier in plain words');

console.log('wiring');
const q = read('supabase/functions/process-whatsapp-queue/index.ts');
ok(/dailyCap: healthLimitedCap\(setPace\.dailyCap, health\)/.test(q), 'the queue drips at the rating-limited cap');
ok(/capRiseRefused\(setPace\.dailyCap, nextCap, health\)/.test(q) && /cap_rise_blocked/.test(q), 'set_pace refuses a cap rise by the one rule');
ok(/const nextCap = \(patch\.daily_cap as number \| null\) \?\? DEFAULT_DAILY_CAP/.test(q), 'clearing the cap is compared as the default');
ok(/autoPauseVerdict\(rows\.length, failed\)/.test(q), 'the failure-burst auto-pause is still there');
ok(/SEND_GAP_JITTER_LOW \+ Math\.random\(\)/.test(q), 'the random gap is unchanged');
const w = read('supabase/functions/whatsapp-number-health/index.ts');
ok(/requireAdmin\(req, /.test(w) && /x-cron-secret/.test(w), 'the watcher is cron or admin only');
ok(!/\.send|messages`/.test(w) && !/console\.(log|error|warn)\([^)]*token/i.test(w), 'the watcher sends nothing and never logs the token');
ok(/if \(mode === "probe"\) return json/.test(w), 'probe answers before any write');
ok(/if \(!reading\.ok\) \{[\s\S]*?meta_health_error: reading\.error[\s\S]*?return json/.test(w), 'a failed read stores only the failure');
ok(!/if \(!reading\.ok\) \{[^}]*paused/.test(w), 'a failed read never pauses');
ok(/shouldPauseForRating\(prevRating, reading\.rating\) && prev\?\.paused !== true/.test(w), 'red pauses once, through the one rule');
ok(/pause_changed_source: "auto"/.test(w), 'the red pause is logged as the queue pausing itself');
ok(/\[functions\.whatsapp-number-health\]\nverify_jwt = false/.test(read('supabase/config.toml')), 'config.toml lists the watcher');
const m = read('supabase/migrations/20261119090000_whatsapp_number_health.sql');
ok(/enable row level security/.test(m) && /revoke all on public\.whatsapp_number_health_log from anon, authenticated/.test(m), 'the log is service role only');
ok(!/\b(drop table|delete from|truncate)\b/i.test(m), 'the migration is additive');
const ui = read('src/components/WhatsAppPaceSettings.tsx');
ok(/NumberHealthLine/.test(ui) && /queue-number-health/.test(ui), 'the pace settings show the rating and tier');

if (failures) { console.error(`\n${failures} failed`); process.exit(1); }
console.log('\nall passed');
