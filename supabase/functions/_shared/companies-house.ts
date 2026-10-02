// THE COMPANIES HOUSE LOOKUP (2026-10-02, docs/companies-house-age.md). Read-only public data API.
// Auth: HTTP Basic, username = the API key (COMPANIES_HOUSE_API_KEY), password blank. The key never
// leaves the server. At most CH_MAX_REQUESTS per business: one name search, a second search only when
// the first finds nothing usable, and the company profile only for a strong match.
// Every failure is an ANSWER, never a throw: "not_configured" (no key), "rate_limited" (429),
// "unavailable" (timeout, 5xx, network, malformed body). Nothing here writes anything.
// Pure apart from the injected fetch — scripts/companies-house.test.ts drives it with a fake one.
import {
  candidateFromSearchItem, classifyCompaniesHouse, postcodeOf, profileFromApi, searchQueries, townOf,
  type ChCandidate, type ChVerdict,
} from "../../../src/lib/companiesHouse.ts";

export const CH_API_BASE = "https://api.company-information.service.gov.uk";
/** One request's time limit. */
export const CH_REQUEST_TIMEOUT_MS = 8_000;
/** Search results read per query (the API's default page is 20). */
export const CH_ITEMS_PER_PAGE = 20;
/** Hard ceiling of requests for one business. */
export const CH_MAX_REQUESTS = 3;

export type ChFailure = "not_configured" | "rate_limited" | "unavailable";
export type ChLookup =
  | { ok: true; verdict: ChVerdict; listing: { postcode: string | null; town: string | null }; requests: number; durationMs: number }
  | { ok: false; error: ChFailure; detail: string; requests: number; durationMs: number };

type FetchLike = (url: string, init: { headers: Record<string, string>; signal?: AbortSignal }) => Promise<{ status: number; json: () => Promise<unknown> }>;

/** btoa is in Deno and in Node 16+. */
const basicAuth = (key: string) => `Basic ${btoa(`${key}:`)}`;

class ChError extends Error {
  constructor(public kind: ChFailure, detail: string) { super(detail); }
}

async function getJson(fetchImpl: FetchLike, key: string, path: string, timeoutMs: number): Promise<{ status: number; body: unknown }> {
  let res;
  try {
    res = await fetchImpl(`${CH_API_BASE}${path}`, { headers: { Authorization: basicAuth(key), Accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    throw new ChError("unavailable", name === "TimeoutError" || name === "AbortError" ? "Companies House did not answer in time" : "Could not reach Companies House");
  }
  if (res.status === 429) throw new ChError("rate_limited", "Companies House is busy (rate limit) — try again in a few minutes");
  if (res.status === 401 || res.status === 403) throw new ChError("not_configured", "The Companies House key was refused");
  if (res.status === 404) return { status: 404, body: null };
  if (res.status < 200 || res.status >= 300) throw new ChError("unavailable", `Companies House answered ${res.status}`);
  try {
    return { status: res.status, body: await res.json() };
  } catch {
    throw new ChError("unavailable", "Companies House sent an unreadable answer");
  }
}

function itemsOf(body: unknown): ChCandidate[] {
  const items = body && typeof body === "object" ? (body as Record<string, unknown>).items : null;
  if (!Array.isArray(items)) throw new ChError("unavailable", "Companies House sent an unreadable answer");
  return items.map(candidateFromSearchItem).filter((c): c is ChCandidate => !!c);
}

/** Look one business up. `apiKey` absent or blank → not_configured, with ZERO requests made. */
export async function lookUpCompany(
  input: { name: string; address: string | null },
  opts: { apiKey: string | null | undefined; fetchImpl?: FetchLike; timeoutMs?: number; now?: () => number },
): Promise<ChLookup> {
  const now = opts.now ?? Date.now;
  const t0 = now();
  let requests = 0;
  const key = String(opts.apiKey ?? "").trim();
  if (!key) return { ok: false, error: "not_configured", detail: "Companies House is not connected yet", requests: 0, durationMs: 0 };
  const fetchImpl = opts.fetchImpl ?? (fetch as unknown as FetchLike);
  const timeoutMs = opts.timeoutMs ?? CH_REQUEST_TIMEOUT_MS;
  const listing = { name: input.name, postcode: postcodeOf(input.address), town: townOf(input.address) };
  try {
    const candidates: ChCandidate[] = [];
    let verdict: ChVerdict | null = null;
    for (const q of searchQueries(input.name, listing.town)) {
      if (requests >= CH_MAX_REQUESTS - 1) break;
      requests++;
      const r = await getJson(fetchImpl, key, `/search/companies?q=${encodeURIComponent(q)}&items_per_page=${CH_ITEMS_PER_PAGE}`, timeoutMs);
      if (r.status !== 404) candidates.push(...itemsOf(r.body));
      verdict = classifyCompaniesHouse(listing, candidates);
      if (verdict.match !== "none") break;
    }
    verdict ??= classifyCompaniesHouse(listing, candidates);
    // A strong match: confirm against the company's own profile (date, status, registered office).
    if (verdict.match === "strong" && verdict.candidate && requests < CH_MAX_REQUESTS) {
      requests++;
      try {
        const p = await getJson(fetchImpl, key, `/company/${encodeURIComponent(verdict.candidate.number)}`, timeoutMs);
        const prof = p.status === 404 ? null : profileFromApi(p.body);
        if (prof) {
          const merged: ChCandidate = { ...verdict.candidate, ...Object.fromEntries(Object.entries(prof).filter(([, v]) => v != null)) } as ChCandidate;
          // The profile is the authority: re-judge on it (a status that changed since the search index).
          const again = classifyCompaniesHouse(listing, [merged, ...candidates.filter((c) => c.number !== merged.number)]);
          verdict = again.candidate?.number === merged.number || again.match === "none" ? again : { ...verdict, match: "possible", evidence: [...verdict.evidence, "The company profile did not confirm the match"] };
        }
      } catch (e) {
        // A 429 on the profile is still a rate limit; anything else keeps the search's verdict.
        if (e instanceof ChError && e.kind !== "unavailable") throw e;
      }
    }
    return { ok: true, verdict, listing: { postcode: listing.postcode, town: listing.town }, requests, durationMs: now() - t0 };
  } catch (e) {
    const err = e instanceof ChError ? e : new ChError("unavailable", "The Companies House check failed");
    return { ok: false, error: err.kind, detail: err.message, requests, durationMs: now() - t0 };
  }
}
