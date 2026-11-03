/* ════════════════════════════════════════════════════════════════════════════════════════════════
   A WEBSITE ADDED TO A LEAD THAT HAD NONE IS CHECKED AT ONCE (Paul, 2026-11-03).

   The rule only: the lead had no website of its own (blank, or just a directory / social page) and now has one that is.
   The check itself is the app's existing website check (crawl-check, the same start every Crawl-site button makes) —
   src/hooks/useCheckNewWebsite.ts starts it. No new crawler. Pure.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { isAggregatorUrl } from '@/lib/aggregators';

/** A website of its own: something typed, and not a directory / social page. */
export function isOwnWebsite(raw: string | null | undefined): boolean {
  const w = String(raw ?? '').trim();
  return !!w && !isAggregatorUrl(w);
}

/** True when `next` is a website of its own and `prev` was not. A change from one real site to another is a person editing, not an add. */
export function websiteWasAdded(prev: string | null | undefined, next: string | null | undefined): boolean {
  return !isOwnWebsite(prev) && isOwnWebsite(next);
}
