/* The send-whatsapp-message BUILD_ID, read the same way by every suite that asks "was the sender's
   deploy marker bumped for this change?" (2026-09-30).

   Suites used to pin the SHAPE "YYYY-MM-DD" + one letter. The lead-state release set
   "2026-09-30-leadstate" — a newer build in a different shape — and three suites went red on the
   format, not on the sender. The question they mean is "is the marker at least as new as the pass
   that needed it?": the date first, then (on the same day) the suffix. */
export function senderBuildId(src: string): string | null {
  return src.match(/^const BUILD_ID = "([^"]+)";/m)?.[1] ?? null;
}

/** True when the sender's BUILD_ID is dated after `min`'s date, or on the same day with a suffix that
 *  sorts at or after `min`'s ("2026-09-29a" ≤ "2026-09-29c"; any 2026-09-30 build is past both). */
export function senderBuildAtLeast(src: string, min: string): boolean {
  const id = senderBuildId(src);
  const m = id?.match(/^(\d{4}-\d{2}-\d{2})(.*)$/);
  const want = min.match(/^(\d{4}-\d{2}-\d{2})(.*)$/);
  if (!m || !want) return false;
  if (m[1] !== want[1]) return m[1] > want[1];
  return m[2] >= want[2];
}
