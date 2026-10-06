/* ════════════════════════════════════════════════════════════════════════════════════════════════
   FACTS FROM A PAID CLIENT'S OWN WHATSAPP REPLIES (Paul, 2026-10-07,
   docs/pre-sales-certification/sales-close-handoff-australia.md).

   Paul asks a client something on WhatsApp ("Which services do you most want to target?"); the client answers
   ("Boiler installations and bathroom plumbing"). The existing AI reader of inbound WhatsApp (fn
   conversation-triage — the one AI conversation system; no parallel WhatsApp system) also asks the model, for a
   PAID CLIENT's message only, whether it states an onboarding fact, and stores what it found
   (client_whatsapp_reads). The client intake then reads it as one more source: "Client on WhatsApp".

   ⛔ WHAT CAN HAPPEN TO A FACT — all decided by the intake merge (clientIntake.mergeField), never by a write:
      · an EMPTY field is filled (client grade, labelled "Client on WhatsApp");
      · a field the client already answered differently is flagged "Needs review — conflicting evidence";
      · a field Paul CONFIRMED keeps his value, always; the WhatsApp answer is listed for him to look at
        (whatsappReviewNotes) — never a silent overwrite;
      · an unclear reply yields no fact at all.
   ⛔ NOTHING IS INVENTED: every fact must carry the client's own words (quote), and the quote must actually
      appear in one of the client's inbound messages, or the fact is dropped. Confidence below
      FACT_MIN_CONFIDENCE is dropped. Only the fields below; only the shapes below.
   ⛔ SPEND: inside conversation-triage's own per-run and per-day caps (and the all-stop), or Paul's button.
   Pure. Edge-reachable: relative imports, explicit .ts.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import type { IntakeCandidate, IntakeFieldKey, ProfileField } from './clientIntake.ts';

export const FACT_MODEL = 'gpt-4o-mini';
export const FACT_PROMPT_VERSION = 'client-facts-2026-10-07';
export const FACT_MIN_CONFIDENCE = 0.7;

/** The intake fields a WhatsApp reply may answer. */
export const FACT_FIELDS = ['services', 'service_areas', 'contact_name', 'email', 'phone', 'website', 'town', 'address'] as const;
export type FactField = typeof FACT_FIELDS[number];
const LIST_FIELDS: ReadonlySet<string> = new Set(['services', 'service_areas']);

export interface ClientFact { field: FactField; value?: string; values?: string[]; quote: string; confidence: number }

const FILLER: ReadonlySet<string> = new Set(['ok', 'okay', 'thanks', 'thank', 'you', 'cheers', 'great', 'perfect', 'will', 'do', 'yes', 'no', 'sure', 'lovely', 'brilliant', 'nice', 'one', 'mate', 'ta', 'cool', 'sounds', 'good', 'fine', 'thx', 'yep', 'yeah', 'many', 'much']);
/** A message worth a model call: real words, not "ok" / "thanks" / an emoji / a media placeholder. */
export function worthReading(body: string | null | undefined): boolean {
  const t = String(body ?? '').trim();
  if (!t || /^\[[a-z_]+\]$/i.test(t)) return false;
  const letters = (t.match(/[A-Za-z]/g) ?? []).length;
  if (letters < 8) return false;
  /* Only courtesy words ("ok thanks", "great cheers mate") is not an answer to anything. */
  const words = t.toLowerCase().match(/[a-z']+/g) ?? [];
  return !words.every((w) => FILLER.has(w));
}

export const FACT_TOOL = {
  type: 'function',
  function: {
    name: 'record_client_facts',
    description: "Record facts the CLIENT stated about their own business in their latest messages. Leave the list empty when nothing is clearly stated.",
    parameters: {
      type: 'object', additionalProperties: false,
      properties: {
        facts: {
          type: 'array', maxItems: 8,
          items: {
            type: 'object', additionalProperties: false,
            properties: {
              field: { type: 'string', enum: [...FACT_FIELDS] },
              value: { type: 'string', maxLength: 200, description: 'For a single-value field (contact_name, email, phone, website, town, address).' },
              values: { type: 'array', maxItems: 12, items: { type: 'string', maxLength: 80 }, description: 'For services / service_areas: each service or area on its own.' },
              quote: { type: 'string', maxLength: 300, description: "The client's own words, copied exactly from one of their messages." },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
            },
            required: ['field', 'quote', 'confidence'],
          },
        },
      },
      required: ['facts'],
    },
  },
} as const;

export function factPrompt(i: { business: string | null; thread: readonly { direction: string; text: string }[] }): { system: string; user: string } {
  const system = [
    'You read a WhatsApp conversation between Findable (a marketing service) and one of its paying clients, a local business.',
    'Record ONLY facts the CLIENT clearly states about their own business that answer one of these: the services they offer or want more of (services), the towns or areas they work in or want work from (service_areas), the contact person\'s name (contact_name), an email address (email), a phone number (phone), their website address (website), their home town (town), their business address (address).',
    'Never guess, never infer, never use anything Findable said as a fact. If the reply is unclear, a question, or off-topic, return an empty list.',
    'quote must be the client\'s exact words from one of their messages.',
  ].join(' ');
  const lines = i.thread.map((m) => `${m.direction === 'inbound' ? 'CLIENT' : 'FINDABLE'}: ${m.text.replace(/\s+/g, ' ').slice(0, 600)}`);
  return { system, user: `Business: ${i.business ?? 'unknown'}\n\nConversation (oldest first):\n${lines.join('\n')}` };
}

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9@.+]+/g, ' ').replace(/\s+/g, ' ').trim();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');

/** The model's answer → facts we accept. ⛔ The quote must be in the CLIENT's own messages; shapes enforced. */
export function cleanFacts(args: unknown, clientTexts: readonly string[]): ClientFact[] {
  const raw = (args && typeof args === 'object' ? (args as { facts?: unknown }).facts : null);
  if (!Array.isArray(raw)) return [];
  const haystack = clientTexts.map(norm).join(' \n ');
  const out: ClientFact[] = [];
  const seen = new Set<string>();
  for (const f of raw.slice(0, 8)) {
    if (!f || typeof f !== 'object') continue;
    const r = f as Record<string, unknown>;
    const field = String(r.field ?? '') as FactField;
    if (!(FACT_FIELDS as readonly string[]).includes(field) || seen.has(field)) continue;
    const confidence = Number(r.confidence);
    if (!Number.isFinite(confidence) || confidence < FACT_MIN_CONFIDENCE) continue;
    const quote = clip(r.quote, 300);
    if (quote.length < 3 || !haystack.includes(norm(quote))) continue;
    if (LIST_FIELDS.has(field)) {
      const values = (Array.isArray(r.values) ? r.values : []).map((x) => clip(x, 80)).filter(Boolean);
      const uniq = [...new Map(values.map((x) => [x.toLowerCase(), x])).values()].slice(0, 12);
      if (!uniq.length) continue;
      out.push({ field, values: uniq, quote, confidence });
    } else {
      const value = clip(r.value, 200);
      if (!value) continue;
      if (field === 'email' && !EMAIL_RE.test(value)) continue;
      if (field === 'phone' && value.replace(/\D/g, '').length < 8) continue;
      if (field === 'website' && !/\.[a-z]{2,}/i.test(value)) continue;
      /* A single value must itself be in the client's words (a name / email / number they typed). */
      if (!haystack.includes(norm(value))) continue;
      out.push({ field, value, quote, confidence });
    }
    seen.add(field);
  }
  return out;
}

/** Stored reads → intake candidates: the NEWEST fact per field, source "whatsapp" (Client on WhatsApp). */
export function whatsappCandidates(reads: readonly { read_at: string; facts: unknown }[]): Partial<Record<IntakeFieldKey, IntakeCandidate[]>> {
  const newest = new Map<string, { at: string; f: ClientFact }>();
  for (const r of reads) {
    for (const f of (Array.isArray(r.facts) ? r.facts : []) as ClientFact[]) {
      if (!f || !(FACT_FIELDS as readonly string[]).includes(f.field)) continue;
      const cur = newest.get(f.field);
      if (!cur || String(r.read_at) > cur.at) newest.set(f.field, { at: String(r.read_at), f });
    }
  }
  const out: Partial<Record<IntakeFieldKey, IntakeCandidate[]>> = {};
  for (const [field, { f }] of newest) {
    out[field as IntakeFieldKey] = [{ source: 'whatsapp', ...(f.values ? { values: f.values } : { value: f.value ?? null }) }];
  }
  return out;
}

/** Where the client's WhatsApp answer differs from a value PAUL confirmed — shown to him, never applied. */
export function whatsappReviewNotes(profile: readonly ProfileField[]): { field: string; label: string; confirmed: string; whatsapp: string }[] {
  const out: { field: string; label: string; confirmed: string; whatsapp: string }[] = [];
  for (const p of profile) {
    if (p.status !== 'confirmed') continue;
    const wa = p.sources.find((s) => s.source === 'whatsapp' && !s.rejected);
    if (!wa) continue;
    const a = (p.kind === 'list' ? p.values.join(', ') : p.value ?? '').toLowerCase().trim();
    const b = (wa.values?.length ? wa.values.join(', ') : wa.value ?? '').toLowerCase().trim();
    if (a && b && a !== b) out.push({ field: p.key, label: p.label, confirmed: p.kind === 'list' ? p.values.join(', ') : p.value ?? '', whatsapp: wa.values?.length ? wa.values.join(', ') : wa.value ?? '' });
  }
  return out;
}
