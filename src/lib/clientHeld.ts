/* ============================================================
   WHAT WE ALREADY HOLD — the one place that answers "do we have this?"

   ⛔ WHY THIS EXISTS. A client who fills in a form and is then asked the same questions assumes
   nobody read it. That is the single thing that makes a document like this feel automated in the bad
   way, and it costs more trust than any wording choice on the sheet.

   ⛔ ABSENCE IS NEVER AN ANSWER. This is the same trap as the serve gate, where a skipped question had
   to flag rather than block, and it is enforced here rather than remembered: `heldValue` is the ONLY
   way anything in this document decides it holds a value, and it treats null, undefined, an empty
   string, whitespace, an empty array and buildPlaybook's own placeholder text as "we do not have it".
   A partially-filled questionnaire is normal — `incomplete` rows exist by design — so a null column
   inside a submitted row means exactly what no questionnaire at all means, FOR THAT FIELD.

   ⚠️ A HELD-ONLY FIELD NEVER RENDERS AS A GAP. Accreditations appear when the client gave them and
   are simply absent when they did not. Rendering "Accreditations — MISSING" would CREATE an ask out
   of a sweep whose entire purpose is to remove them, which is the opposite of the point. Only fields
   the document already asks for may show as missing.

   ⚠️ THE QUESTIONNAIRE WINS OVER THE LEAD ROW where both hold a value. The lead's address comes from
   Google Places; the questionnaire's came from the owner, more recently, in their own words. It can
   never blank a value we already have — `heldValue` returning null leaves the existing field alone.
   ============================================================ */

/** The questionnaire columns that can satisfy something this document would otherwise ask for. */
export interface QuestionnaireHeld {
  business_name: string | null;
  confirmed_location: string | null;
  business_address: string | null;
  accreditations: string | null;
}

/** An empty QuestionnaireHeld — the state for a client who never saw the questionnaire at all. */
export const NO_ANSWERS: QuestionnaireHeld = {
  business_name: null, confirmed_location: null, business_address: null, accreditations: null,
};

/* buildPlaybook writes these INTO the value when it has nothing, rather than leaving it blank. They
   are placeholders, not data, and treating either as held would print operator text on a client's
   sheet or claim we hold a website that does not exist. */
const PLACEHOLDERS = new Set(['not held — ask the client', 'not held - ask the client', 'none']);

/**
 * The single absence rule. Returns the trimmed value, or null when we do not hold it.
 *
 * ⛔ Nothing in this document may decide it holds a value any other way. Every "is it there?" test —
 * step one fields, the extra held rows, the ask sweep — comes through here, so there is one place to
 * be right and one place to test.
 */
export function heldValue(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) {
    // TRIM EACH ELEMENT, not just the join. Filtering blanks but keeping " NICEIC " printed
    // "Gas Safe,  NICEIC " on a client's sheet — the padding is the questionnaire's, not theirs.
    const kept = v.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean);
    return kept.length ? kept.join(', ') : null;
  }
  /* ⛔ ONLY STRINGS AND ARRAYS OF THEM. None of the four columns is numeric, so a number arriving
     here means something upstream is wrong — and coercing it would print "0" as a business name.
     An earlier version accepted numbers and made 0 a held value, which is exactly the shape of
     mistake this file exists to prevent. */
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  if (PLACEHOLDERS.has(t.toLowerCase())) return null;
  return t;
}

/** Narrow a raw questionnaire row down to the four columns this document can be satisfied by. */
export function questionnaireHeld(row: Record<string, unknown> | null | undefined): QuestionnaireHeld {
  if (!row) return { ...NO_ANSWERS };
  return {
    business_name: heldValue(row.business_name),
    confirmed_location: heldValue(row.confirmed_location),
    business_address: heldValue(row.business_address),
    accreditations: heldValue(row.accreditations),
  };
}

/* Step one's field names are buildPlaybook's, and they are the join key. A name that does not appear
   here is simply never satisfied by the questionnaire — Phone and Website are not captured, so they
   keep asking, correctly. */
const FIELD_SOURCES: Record<string, keyof QuestionnaireHeld> = {
  'Business name': 'business_name',
  Town: 'confirmed_location',
  Address: 'business_address',
};

/** One step-one row, as the client document renders it. */
export interface HeldField {
  name: string;
  value: string;
  held: boolean;
  why?: string;
}

/**
 * Mark every step-one field the questionnaire already answers as held, with the client's own value.
 *
 * The `why` line goes with it: it explains why we need something, and a field we have does not need
 * explaining. Leaving it would print a justification for an ask that is no longer being made.
 */
export function applyHeld(fields: HeldField[], held: QuestionnaireHeld): HeldField[] {
  return fields.map((f) => {
    const col = FIELD_SOURCES[f.name];
    const v = col ? held[col] : null;
    if (!v) return f;
    return { name: f.name, value: v, held: true };
  });
}

/**
 * Rows that exist ONLY when the client gave them. Appended after the fields the document asks for,
 * so they read as "and here is what else we have from you" rather than as another gap.
 */
export function extraHeldFields(held: QuestionnaireHeld): HeldField[] {
  const out: HeldField[] = [];
  // Their own words, uncut: this is the file that just fixed a truncation bug, and clipping a
  // client's accreditations to fit a column would be the same mistake with better manners.
  if (held.accreditations) out.push({ name: 'Accreditations', value: held.accreditations, held: true });
  return out;
}

/* ⛔ THE ENFORCEMENT TABLE. For each column, the phrases that would mean the document is STILL asking
   for something we hold. The suite renders the sheet with each column populated and asserts none of
   these survive. Adding an ask that asks for a held field fails the test rather than reaching a
   client — which is the point: this rule is enforced, not remembered.
   Add a row here whenever a column becomes capable of satisfying an ask. */
export const ASKING_PHRASES: Record<keyof QuestionnaireHeld, RegExp[]> = {
  business_name: [/\bexact trading name\b/i],
  confirmed_location: [/\bwhich town we measure you in\b/i],
  business_address: [/\bholds everything up\b.*\bevery page we write\b/i, /\bUntil we have it there is nothing to publish\b/i],
  accreditations: [/\bwhat you are accredited\b/i, /\bsend us your accreditations\b/i],
};
