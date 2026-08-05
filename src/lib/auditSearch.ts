/* ============================================================
   SEARCHING THE AUDIT LIST.

   A pure matcher, in its own file so it can be tested without mounting the page. The rules are small
   but every one of them is a decision:

   · NAME, TRADE AND TOWN — because an audit is remembered as "that Wisbech locksmith" at least as
     often as by company name. All three are already on the row the list renders, so matching them
     costs nothing and adds no query.
   · SUBSTRING, NOT WORD-PREFIX. "wisb" must find Wisbech, and "lock" must find both "Locksmith" and
     "Wellsecure Locksmiths Ltd". A word-boundary match would fail the first and a prefix match the
     second.
   · EVERY TERM MUST MATCH, ANYWHERE IN THE ROW. "wisbech locksmith" is two words that live in two
     different fields, so matching the query as one string against each field separately would find
     nothing. Joining the fields and requiring each term narrows the way a person expects.
   ============================================================ */

/** The searchable fields of one row. Everything here is already loaded — see the note above. */
export interface AuditSearchable {
  name: string | null;
  business_type: string | null;
  trade: string | null;
  location: string | null;
}

/** Split a raw query into terms. Empty array = no filter, which callers treat as "show everything".
 *  Trimmed and lowercased once per keystroke rather than once per row. */
export function auditSearchTerms(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

/** Does this row match every term? Vacuously true for an empty query, so a caller that forgets to
 *  short-circuit still shows the full list rather than nothing. */
export function auditMatches(row: AuditSearchable, terms: string[]): boolean {
  if (terms.length === 0) return true;
  const haystack = [row.name, row.business_type, row.trade, row.location]
    .filter(Boolean).join(" ").toLowerCase();
  return terms.every((t) => haystack.includes(t));
}
