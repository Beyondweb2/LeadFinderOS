/* ════════════════════════════════════════════════════════════════════════════════════════════════
   AI SEARCH HEALTH — Apify's success rate by engine, and ONE alert when it drops (Paul, 2026-11-19,
   v1-audits-self-healing: "alert me only when the rate drops, not per audit").

   What counts, per ask that settled (done or failed) in the window:
     • ChatGPT / Gemini: ASKED on every ask, except one refused for a budget reason (never the provider's fault);
       ANSWERED when the stored answer has text.
     • Google AI (display only): asked when the ask had a Google AI lane; answered when that lane came back.
   An ask being healed counts as it stands now; its re-run counts again when it settles (each try is a try).

   The alert: ChatGPT or Gemini answered on fewer than RATE_ALERT_BELOW of at least RATE_MIN_ASKS asks in the last
   RATE_WINDOW_MS → one bell row + one email, at most once per RATE_ALERT_EVERY_MS per engine. Google AI never alerts
   (display only, and it has been unreliable since 18 Nov).

   Pure. Reached by edge functions: relative imports with .ts.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { PROVIDER_FAILURE_ERRORS } from './auditSelfHeal.ts';

export const HEALTH_ENGINES = ['chatgpt', 'gemini', 'ai_overview'] as const;
export type HealthEngine = typeof HEALTH_ENGINES[number];
export const ALERTING_ENGINES: readonly HealthEngine[] = ['chatgpt', 'gemini'];
export const ENGINE_LABEL: Record<HealthEngine, string> = { chatgpt: 'ChatGPT', gemini: 'Gemini', ai_overview: 'Google AI' };

export const RATE_WINDOW_MS = 60 * 60_000;
export const RATE_MIN_ASKS = 8;
export const RATE_ALERT_BELOW = 0.8;
export const RATE_ALERT_EVERY_MS = 6 * 60 * 60_000;

/** One settled ask, the few fields the rate needs (read with JSON paths, never the whole answer). */
export interface HealthRow {
  status: string;
  updated_at: string | null;
  error?: string | null;
  chatgpt?: string | null;
  gemini?: string | null;
  /** The ask's _lanes.ai_overview.state, when it had one. */
  aio_lane?: string | null;
}

export interface EngineStat { engine: HealthEngine; asked: number; answered: number; rate: number | null }

/** answered / missed / not counted. */
export function engineOutcome(row: HealthRow, engine: HealthEngine): 'answered' | 'missed' | null {
  if (row.status !== 'done' && row.status !== 'failed') return null;
  const err = String(row.error ?? '').trim();
  if (row.status === 'failed' && !PROVIDER_FAILURE_ERRORS.has(err)) return null; // budget / refusal: not the provider
  if (engine === 'ai_overview') {
    if (!row.aio_lane) return null;
    return row.aio_lane === 'done' ? 'answered' : 'missed';
  }
  if (row.status === 'failed') return 'missed';
  const text = engine === 'chatgpt' ? row.chatgpt : row.gemini;
  return typeof text === 'string' && text.trim() ? 'answered' : 'missed';
}

/** Per-engine counts over the rows given. */
export function engineStats(rows: HealthRow[]): EngineStat[] {
  return HEALTH_ENGINES.map((engine) => {
    let asked = 0, answered = 0;
    for (const r of rows) {
      const o = engineOutcome(r, engine);
      if (!o) continue;
      asked++;
      if (o === 'answered') answered++;
    }
    return { engine, asked, answered, rate: asked ? answered / asked : null };
  });
}

/** The rows that settled in [fromMs, toMs). */
export function inWindow(rows: HealthRow[], fromMs: number, toMs: number): HealthRow[] {
  return rows.filter((r) => { const t = Date.parse(String(r.updated_at ?? '')); return Number.isFinite(t) && t >= fromMs && t < toMs; });
}

/** Hourly buckets (oldest first) for the last `hours` hours. */
export function hourlyStats(rows: HealthRow[], nowMs: number, hours = 24): { hourStart: string; stats: EngineStat[] }[] {
  const out: { hourStart: string; stats: EngineStat[] }[] = [];
  const top = Math.floor(nowMs / 3_600_000) * 3_600_000;
  for (let i = hours - 1; i >= 0; i--) {
    const from = top - i * 3_600_000;
    out.push({ hourStart: new Date(from).toISOString(), stats: engineStats(inWindow(rows, from, from + 3_600_000)) });
  }
  return out;
}

const pct = (r: number | null) => (r == null ? '–' : `${Math.round(r * 100)}%`);

/** One line for the admin view: "ChatGPT 97% (120 of 124) · Gemini 88% (…) · Google AI 70% (…)". */
export function healthLine(stats: EngineStat[]): string {
  return stats.filter((s) => s.asked > 0).map((s) => `${ENGINE_LABEL[s.engine]} ${pct(s.rate)} (${s.answered} of ${s.asked})`).join(' · ')
    || 'No AI searches settled in this window.';
}

/** The bell row's key: one per engine per RATE_ALERT_EVERY_MS block (the bell's unique key is the once-only claim). */
export function rateDropKey(engine: HealthEngine, nowMs: number): string {
  const block = Math.floor(nowMs / RATE_ALERT_EVERY_MS) * RATE_ALERT_EVERY_MS;
  return `ai_search_rate_drop:${engine}:${new Date(block).toISOString().slice(0, 13)}`;
}

export interface RateAlert { title: string; body: string; link: string; subject: string; lines: string[]; dedupeKey: string }

/** The alerts due now from the last hour's asks (at most one per alerting engine). */
export function rateDropAlerts(lastHour: EngineStat[], nowMs: number): RateAlert[] {
  const out: RateAlert[] = [];
  for (const s of lastHour) {
    if (!ALERTING_ENGINES.includes(s.engine) || s.asked < RATE_MIN_ASKS || s.rate == null || s.rate >= RATE_ALERT_BELOW) continue;
    const name = ENGINE_LABEL[s.engine];
    const title = `${name} answered ${pct(s.rate)} of AI searches in the last hour`;
    const body = `${s.answered} of ${s.asked} asks came back with a ${name} answer (normal is above ${pct(RATE_ALERT_BELOW)}). Audits missing it re-run themselves at 30 min, 2 h and 6 h; nothing to do unless this keeps happening.`;
    out.push({
      title, body, link: '/ai-audit', subject: `Findable: ${title}`,
      lines: [body, 'The AI Visibility Audit page shows the last 24 hours by engine.'],
      dedupeKey: rateDropKey(s.engine, nowMs),
    });
  }
  return out;
}
