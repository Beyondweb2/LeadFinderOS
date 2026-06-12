// Shared Europe/London time helpers for the barber dashboard (DST-correct via
// Intl). Bookings are stored as timestamptz; staff hours and the calendar are
// reasoned about in the shop's local (London) wall-clock time.

export const TZ = "Europe/London";

/** London's UTC offset (minutes, +60 during BST) at a given instant. */
export function londonOffsetMinutes(d: Date): number {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const m: Record<string, string> = {};
  for (const p of dtf.formatToParts(d)) m[p.type] = p.value;
  const asUTC = Date.UTC(+m.year, +m.month - 1, +m.day, +m.hour % 24, +m.minute, +m.second);
  return Math.round((asUTC - d.getTime()) / 60000);
}

/** Absolute instant for a London wall-clock Y-M-D H:M. */
export function londonInstant(y: number, mo: number, da: number, h: number, mi: number): Date {
  const utcGuess = Date.UTC(y, mo - 1, da, h, mi);
  const off = londonOffsetMinutes(new Date(utcGuess));
  return new Date(utcGuess - off * 60000);
}

/** London calendar date parts of an instant. */
export function londonYMD(d: Date): { y: number; mo: number; da: number } {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const [y, mo, da] = s.split("-").map(Number);
  return { y, mo, da };
}

/** London date-key ("YYYY-MM-DD") + minutes-of-day for a stored ISO instant. */
export function londonParts(iso: string): { dateKey: string; minutes: number } {
  const d = new Date(iso);
  const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const t = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d); // "HH:MM"
  const [hh, mm] = t.split(":").map(Number);
  return { dateKey, minutes: (hh % 24) * 60 + mm };
}

/** "2:30 pm" in London. */
export function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));
}

/** "HH:MM" label for a minutes-of-day value (24h, for the calendar axis). */
export function minLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** True when the user prefers reduced motion. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}
