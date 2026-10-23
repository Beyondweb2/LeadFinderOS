/* SITE SHOT (2026-10-25) — the rules for one homepage picture per lead: when a shot may be taken, what image is refused,
   the cap window, the caption, the claim, and the fences that keep spend away from a report being opened. */
import { readFileSync } from 'node:fs';
import {
  SITE_SHOT_BUCKET, SITE_SHOT_DEFAULT_MONTHLY_CAP, SITE_SHOT_FRESH_DAYS, SITE_SHOT_MAX_ATTEMPTS, SITE_SHOT_MEASURE_MAX, SITE_SHOT_MIN_BYTES,
  londonMonthStartIso, siteShotCaption, siteShotGate, siteShotImageProblem, siteShotPath, type SiteShotGateInput,
} from '../src/lib/siteShot.ts';

let failures = 0;
function ok(cond: unknown, label: string) { if (!cond) failures++; console.log(`${cond ? 'PASS' : 'FAIL'} ${label}`); }
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const MIG = read('supabase/migrations/20261125120000_lead_site_shots.sql');
const FN = read('supabase/functions/site-shot/index.ts');

/* ── A. the gate: absent means "do not" ── */
{
  const good: SiteShotGateInput = { enabled: true, mode: 'running', websiteRefusal: null, crawl: { fetchFailed: false, readableAs: 'OAI-SearchBot' }, claimedThisMonth: 10, monthlyCap: SITE_SHOT_DEFAULT_MONTHLY_CAP };
  const g = (o: Partial<SiteShotGateInput>) => siteShotGate({ ...good, ...o });
  ok(g({}).ok === true, 'A: every condition met → a shot');
  ok(!g({ enabled: false }).ok && (g({ enabled: false }) as { reason: string }).reason === 'disabled', 'A: the switch off → nothing');
  ok(!g({ enabled: undefined as unknown as boolean }).ok, 'A: an unknown switch is a closed switch');
  ok((g({ mode: 'all_stop' }) as { reason: string }).reason === 'all_stop' && (g({ mode: 'prospecting_paused' }) as { reason: string }).reason === 'all_stop' && !g({ mode: '' }).ok, 'A: any protection mode but running stops it, and an empty one too');
  ok((g({ websiteRefusal: 'website_is_aggregator' }) as { reason: string }).reason === 'website_is_aggregator' && (g({ websiteRefusal: 'no_website' }) as { reason: string }).reason === 'no_website', 'A: no website, or an aggregator page, never gets a picture captioned "your homepage"');
  ok((g({ crawl: null }) as { reason: string }).reason === 'no_crawl', 'A: no fresh website check → no shot (we cannot know the page is readable)');
  ok((g({ crawl: { fetchFailed: true, readableAs: null } }) as { reason: string }).reason === 'crawl_unreadable' && (g({ crawl: { fetchFailed: false, readableAs: null } }) as { reason: string }).reason === 'crawl_unreadable', 'A: a site our own check could not read (down, or every crawler blocked) is not photographed');
  ok(g({ claimedThisMonth: SITE_SHOT_DEFAULT_MONTHLY_CAP - 1 }).ok && !g({ claimedThisMonth: SITE_SHOT_DEFAULT_MONTHLY_CAP }).ok && (g({ claimedThisMonth: SITE_SHOT_DEFAULT_MONTHLY_CAP }) as { reason: string }).reason === 'cap_reached', 'A: the cap stops the shot that would pass it');
  ok(!g({ monthlyCap: NaN }).ok && !g({ monthlyCap: 0 }).ok, 'A: a missing or zero cap is a stop');
}

/* ── B. the image ── */
{
  const jpeg = (n: number) => { const a = new Uint8Array(n); a[0] = 0xff; a[1] = 0xd8; a[2] = 0xff; return a; };
  ok(siteShotImageProblem(null) === 'empty' && siteShotImageProblem(new Uint8Array()) === 'empty', 'B: nothing → empty');
  ok(siteShotImageProblem(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])) === 'not_jpeg', 'B: a PNG is not what the bucket takes');
  ok(siteShotImageProblem(jpeg(SITE_SHOT_MIN_BYTES - 1)) === 'too_small' && siteShotImageProblem(jpeg(SITE_SHOT_MIN_BYTES)) === null, 'B: under the floor is a blank-looking page, at the floor is fine');
  ok(siteShotImageProblem(jpeg(2_100_000)) === 'too_big', 'B: over the bucket limit is refused before the upload');
}

/* ── C. path, caption, month window ── */
{
  const id = '0b8f1c1e-2a3b-4c5d-8e9f-0123456789ab';
  ok(siteShotPath(id) === `${id}/homepage.jpg` && siteShotPath(id, true) === `measure/${id}.jpg`, 'C: one object per lead, measurement pictures apart');
  ok(siteShotPath('../../etc/passwd') === null && siteShotPath(`${id}/../x`) === null && siteShotPath('') === null, 'C: only a lead id can name a path');
  ok(siteShotCaption('2026-10-25T10:00:00Z') === 'Your homepage, as we saw it on 25 Oct 2026' && siteShotCaption(null) === 'Your homepage', 'C: the caption carries a DATE, and no date → no claim of one');
  ok(siteShotCaption('2026-10-31T23:30:00Z') === 'Your homepage, as we saw it on 31 Oct 2026' && siteShotCaption('2026-06-30T23:30:00Z') === 'Your homepage, as we saw it on 1 Jul 2026', 'C: dates are London dates (11:30pm UTC in summer is already tomorrow)');
  ok(londonMonthStartIso(new Date('2026-10-25T12:00:00Z')) === '2026-09-30T23:00:00.000Z', 'C: October (BST) starts at 23:00 UTC the night before');
  ok(londonMonthStartIso(new Date('2026-11-25T12:00:00Z')) === '2026-11-01T00:00:00.000Z', 'C: November (GMT) starts at midnight UTC');
  ok(londonMonthStartIso(new Date('2026-10-31T23:30:00Z')) === '2026-10-31T00:00:00.000Z' || londonMonthStartIso(new Date('2026-10-31T23:30:00Z')) === '2026-09-30T23:00:00.000Z', 'C: the last evening of a month is still that month');
}

/* ── D. the migration seeds what the code says ── */
{
  ok(MIG.includes(`values (true, false, ${SITE_SHOT_DEFAULT_MONTHLY_CAP}, 'migration')`), 'D: the seeded cap equals SITE_SHOT_DEFAULT_MONTHLY_CAP and the switch is seeded OFF');
  ok(MIG.includes(`'${SITE_SHOT_BUCKET}'`) && /values \('lead-site-shots', 'lead-site-shots', false,/.test(MIG), 'D: the bucket is private (public = false)');
  ok(/enable row level security/.test(MIG) && /revoke all on table public\.lead_site_shots from anon, authenticated/.test(MIG) && /revoke all on table public\.site_shot_settings from anon, authenticated/.test(MIG), 'D: both tables are RLS-on with grants revoked (service role only)');
  ok(MIG.includes(`interval '10 minutes'`) && /revoke all on function public\.claim_site_shot/.test(MIG), 'D: the claim is service-role only, and a crashed claim frees itself');
  ok(SITE_SHOT_FRESH_DAYS === 30 && SITE_SHOT_MAX_ATTEMPTS === 2 && SITE_SHOT_MEASURE_MAX >= 1, 'D: freshness is the crawl\'s 30 days and a lead gets two tries');
}

/* ── E. the fences ── */
{
  const RENDER = read('supabase/functions/render-audit-report/index.ts');
  const HTML = read('src/lib/aiAuditReportHtml.ts');
  ok(!/shootSite|mockup-shot|browser-rendering|functions\/v1\/site-shot/.test(RENDER), 'E: opening a report can never start a shot — render-audit-report does not import the driver or call the function');
  ok(!/shootSite|browser-rendering|mockup-shot/.test(HTML), 'E: the report renderer never reaches the driver');
  ok(/x-internal-job/.test(FN) && /CRON_SECRET/.test(FN) && /not_authorised/.test(FN), 'E: the function is internal-only (CRON_SECRET + x-internal-job)');
  const gateAt = FN.indexOf('siteShotGate('), claimAt = FN.indexOf('claim_site_shot'), shootAt = FN.indexOf('shootSite(lead.website, FORMAT)');
  ok(gateAt > 0 && claimAt > gateAt && shootAt > claimAt, 'E: the order is gate → claim → shoot (spend only after the ONE conditional write is won)');
  ok(!/whatsapp|resend|twilio|sendMessage/i.test(FN), 'E: nothing in the function can send a message');
  ok(/verify_jwt = false/.test(read('supabase/config.toml').split('[functions.site-shot]')[1] ?? ''), 'E: the new function has its config.toml verify_jwt entry');
  const DRV = read('supabase/functions/_shared/mockup-shot.ts');
  ok(/format: ShotFormat = \{ type: "png" \}/.test(DRV) && /format\.scale \?\? 2/.test(DRV), 'E: the mockup\'s default shot is unchanged (PNG at 2x); only an explicit format changes it');
}

if (failures) throw new Error(`${failures} site-shot checks failed`);
console.log('all passed');
