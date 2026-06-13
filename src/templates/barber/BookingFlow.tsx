import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BarberSiteContent, BarberService } from "./types";

/**
 * Public booking flow (Step 3b) for a generated site (/p/:slug).
 *
 * Flow: service → staff → day → time → details → confirmation.
 *
 * Architecture (the important bit): the CLIENT only shows UI and *suggests* slots.
 * The real booking goes through the `create-booking` edge function, which
 * re-validates everything server-side (published site, active staff, future slot,
 * inside working hours, no overlap) and inserts with return=minimal — because anon
 * can't read the bookings table and RLS can't enforce hours/past-slot.
 *
 * Availability (Option 2): anon can't read bookings directly, so taken slots are
 * fetched from the `get-availability` edge function, which returns ONLY busy time
 * ranges (no customer data). Those grey out slots in the picker; `create-booking`
 * is still the real guard on submit (and the DB exclusion constraint backstops the
 * race). All times are Europe/London.
 *
 * Staff + working hours ARE readable by anon for published sites (Phase 1 RLS), so
 * those load via the standard client (untyped for the not-yet-in-types tables).
 *
 * Theming: this single flow backs BOTH templates. `variant` selects a palette
 * bundle (see THEMES below) — the booking LOGIC is shared, only the class tokens
 * differ. Default is "barber"; its token strings are exactly the original classes,
 * and since Tailwind class ORDER doesn't affect the rendered CSS, the barber
 * output is unchanged.
 */

const sb = supabase as unknown as SupabaseClient;
const TZ = "Europe/London";
const DEFAULT_DURATION = 30;
const DAYS_AHEAD = 21;

type Staff = { id: string; site_id: string; name: string; avatar_url: string | null; sort_order: number };
type WorkingHour = { staff_id: string; weekday: number; start_time: string; end_time: string };
type Busy = { starts_at: string; ends_at: string };
type DayOption = { y: number; mo: number; da: number; weekday: number; label: string };
type Step = "service" | "staff" | "day" | "time" | "details" | "confirm";

/** Visual variant — the booking flow is logic-identical across templates; only
 *  these palette tokens differ. */
export type BookingVariant = "barber" | "salon";

type BookingTheme = {
  overlay: string;
  panel: string;
  border: string;
  titleBase: string;
  sub: string;
  closeBtn: string;
  muted: string;
  faint: string;
  option: string;
  optionTitle: string;
  accent: string;
  avatar: string;
  dayBtn: string;
  timeTaken: string;
  timeFree: string;
  summary: string;
  input: string;
  checkbox: string;
  checkboxStrong: string;
  error: string;
  confirmIcon: string;
  primaryBtn: string;
  backBtn: string;
  rowLabel: string;
  rowValue: string;
};

const THEMES: Record<BookingVariant, BookingTheme> = {
  // Barber bundle — strings equal the historical classes verbatim (class order is
  // irrelevant to the rendered CSS), so the barber booking flow is unchanged.
  barber: {
    overlay: "bg-black/70",
    panel: "border border-white/10 bg-ink-card",
    border: "border-white/10",
    titleBase: "font-display uppercase tracking-wide text-white",
    sub: "text-zinc-400",
    closeBtn: "text-zinc-400 hover:bg-white/10 hover:text-white",
    muted: "text-zinc-400",
    faint: "text-zinc-500",
    option: "border border-white/10 bg-white/[0.03] hover:border-amber/50",
    optionTitle: "text-white",
    accent: "text-amber",
    avatar: "bg-amber/15 text-amber-soft",
    dayBtn: "border border-white/10 bg-white/[0.03] text-zinc-200 hover:border-amber/50",
    timeTaken: "cursor-not-allowed border-white/5 bg-white/[0.02] text-zinc-600 line-through",
    timeFree: "border-white/10 bg-white/[0.03] text-zinc-100 hover:border-amber/50",
    summary: "border border-white/10 bg-white/[0.03]",
    input: "border border-white/10 bg-white/[0.04] text-white placeholder-zinc-500 focus:border-amber/60",
    checkbox: "accent-amber",
    checkboxStrong: "text-zinc-100",
    error: "text-red-400",
    confirmIcon: "bg-amber/15 text-amber",
    primaryBtn: "bg-amber text-ink hover:bg-amber-soft",
    backBtn: "border border-white/10 text-zinc-300 hover:border-amber/40 hover:text-white",
    rowLabel: "text-zinc-500",
    rowValue: "text-zinc-100",
  },
  // Salon bundle — light/airy rose counterpart (scoped salon-* tokens).
  salon: {
    overlay: "bg-salon-ink/40",
    panel: "border border-salon-line bg-salon-bg",
    border: "border-salon-line",
    titleBase: "font-salon-display text-salon-ink",
    sub: "text-salon-muted",
    closeBtn: "text-salon-muted hover:bg-salon-rose/10 hover:text-salon-rose",
    muted: "text-salon-muted",
    faint: "text-salon-faint",
    option: "border border-salon-line bg-white hover:border-salon-rose/50",
    optionTitle: "text-salon-ink",
    accent: "text-salon-rose",
    avatar: "bg-salon-rose/10 text-salon-rose-deep",
    dayBtn: "border border-salon-line bg-white text-salon-ink hover:border-salon-rose/50",
    timeTaken: "cursor-not-allowed border-salon-line/60 text-salon-faint line-through",
    timeFree: "border-salon-line bg-white text-salon-ink hover:border-salon-rose/50",
    summary: "border border-salon-line bg-white",
    input: "border border-salon-line bg-white text-salon-ink placeholder-salon-faint focus:border-salon-rose/60",
    checkbox: "accent-salon-rose",
    checkboxStrong: "text-salon-ink",
    error: "text-red-500",
    confirmIcon: "bg-salon-rose/10 text-salon-rose",
    primaryBtn: "bg-salon-rose text-white hover:bg-salon-rose-deep",
    backBtn: "border border-salon-line text-salon-ink hover:border-salon-rose/40 hover:text-salon-rose",
    rowLabel: "text-salon-faint",
    rowValue: "text-salon-ink",
  },
};

// ── Europe/London time helpers (DST-correct via Intl) ────────────────────────
function londonOffsetMinutes(d: Date): number {
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
function londonInstant(y: number, mo: number, da: number, h: number, mi: number): Date {
  const utcGuess = Date.UTC(y, mo - 1, da, h, mi);
  const off = londonOffsetMinutes(new Date(utcGuess));
  return new Date(utcGuess - off * 60000);
}
function londonTodayYMD(): { y: number; mo: number; da: number } {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [y, mo, da] = s.split("-").map(Number);
  return { y, mo, da };
}
function hmToMinutes(t: string): number {
  const [h, m] = String(t).split(":");
  return parseInt(h, 10) * 60 + parseInt(m, 10);
}
function fmtDayLabel(y: number, mo: number, da: number): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" })
    .format(new Date(Date.UTC(y, mo - 1, da, 12, 0)));
}
function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));
}
function fmtDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(iso));
}

// Per-variant error copy. The barber map is verbatim the historical strings (so
// the barber flow is unchanged); the salon map only swaps the two entries whose
// wording mentioned "barber"/"shop".
const ERROR_COPY: Record<BookingVariant, Record<string, string>> = {
  barber: {
    slot_taken: "Sorry — that time was just booked. Please pick another slot.",
    outside_hours: "That time is outside this barber's working hours. Please pick another.",
    in_past: "That time has already passed. Please pick another slot.",
    invalid_staff: "That barber isn't available. Please start again.",
    not_published: "This site isn't taking bookings right now.",
    unknown_service: "That service isn't available. Please start again.",
    invalid_phone: "Please enter a valid phone number.",
    missing_fields: "Please fill in your name and phone number.",
    rate_limited: "Too many attempts — please wait a moment and try again.",
  },
  salon: {
    slot_taken: "Sorry — that time was just booked. Please pick another slot.",
    outside_hours: "That time is outside the salon's working hours. Please pick another.",
    in_past: "That time has already passed. Please pick another slot.",
    invalid_staff: "That stylist isn't available. Please start again.",
    not_published: "This site isn't taking bookings right now.",
    unknown_service: "That service isn't available. Please start again.",
    invalid_phone: "Please enter a valid phone number.",
    missing_fields: "Please fill in your name and phone number.",
    rate_limited: "Too many attempts — please wait a moment and try again.",
  },
};

export function BookingFlow({
  open,
  onClose,
  slug,
  content,
  variant = "barber",
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  content: BarberSiteContent;
  variant?: BookingVariant;
}) {
  const t = THEMES[variant];
  const [step, setStep] = useState<Step>("service");
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [hoursByStaff, setHoursByStaff] = useState<Record<string, WorkingHour[]>>({});

  const [service, setService] = useState<BarberService | null>(null);
  const [chosenStaff, setChosenStaff] = useState<Staff | null>(null);
  const [day, setDay] = useState<DayOption | null>(null);
  const [busy, setBusy] = useState<Busy[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotIso, setSlotIso] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [reminderOptIn, setReminderOptIn] = useState(false); // explicit opt-in, never pre-checked
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ service_name: string; staff_name: string; starts_at: string; business_name: string } | null>(null);

  const services = useMemo(() => (content.services ?? []).filter((s) => (s.name ?? "").trim()), [content.services]);
  const duration = service?.durationMins ?? DEFAULT_DURATION;

  // Reset to the start each time the flow is opened.
  useEffect(() => {
    if (!open) return;
    setStep("service");
    setService(null);
    setChosenStaff(null);
    setDay(null);
    setSlotIso(null);
    setName("");
    setPhone("");
    setReminderOptIn(false);
    setError(null);
    setConfirmed(null);
  }, [open]);

  // Load active staff + their hours (anon-readable for published sites).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoadingStaff(true);
      const { data: staffRows } = await sb
        .from("booking_staff")
        .select("id, site_id, name, avatar_url, sort_order, generated_sites!inner(site_name)")
        .eq("generated_sites.site_name", slug)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (cancelled) return;
      const list = ((staffRows ?? []) as Staff[]).map((s) => ({
        id: s.id, site_id: s.site_id, name: s.name, avatar_url: s.avatar_url, sort_order: s.sort_order,
      }));
      setStaff(list);
      if (list.length) {
        const { data: hourRows } = await sb
          .from("staff_working_hours")
          .select("staff_id, weekday, start_time, end_time")
          .in("staff_id", list.map((s) => s.id));
        if (cancelled) return;
        const grouped: Record<string, WorkingHour[]> = {};
        for (const h of (hourRows ?? []) as WorkingHour[]) {
          if (!grouped[h.staff_id]) grouped[h.staff_id] = [];
          grouped[h.staff_id].push(h);
        }
        setHoursByStaff(grouped);
      }
      setLoadingStaff(false);
    })();
    return () => { cancelled = true; };
  }, [open, slug]);

  // Days (next 3 weeks) on which the chosen staff has any working hours.
  const dayOptions = useMemo<DayOption[]>(() => {
    if (!chosenStaff) return [];
    const wh = hoursByStaff[chosenStaff.id] ?? [];
    const openWeekdays = new Set(wh.map((w) => w.weekday));
    const { y, mo, da } = londonTodayYMD();
    const base = Date.UTC(y, mo - 1, da);
    const out: DayOption[] = [];
    for (let i = 0; i < DAYS_AHEAD; i++) {
      const dt = new Date(base + i * 86400000);
      const wd = dt.getUTCDay();
      if (!openWeekdays.has(wd)) continue;
      const yy = dt.getUTCFullYear(), mm = dt.getUTCMonth() + 1, dd = dt.getUTCDate();
      out.push({ y: yy, mo: mm, da: dd, weekday: wd, label: fmtDayLabel(yy, mm, dd) });
    }
    return out;
  }, [chosenStaff, hoursByStaff]);

  // Candidate slots for the chosen day, stepped by the service duration.
  const slots = useMemo<{ iso: string; endMs: number }[]>(() => {
    if (!chosenStaff || !day || !service) return [];
    const wh = (hoursByStaff[chosenStaff.id] ?? []).filter((w) => w.weekday === day.weekday);
    const out: { iso: string; endMs: number }[] = [];
    for (const w of wh) {
      const startMin = hmToMinutes(w.start_time);
      const endMin = hmToMinutes(w.end_time);
      for (let m = startMin; m + duration <= endMin; m += duration) {
        const start = londonInstant(day.y, day.mo, day.da, Math.floor(m / 60), m % 60);
        out.push({ iso: start.toISOString(), endMs: start.getTime() + duration * 60000 });
      }
    }
    out.sort((a, b) => a.iso.localeCompare(b.iso));
    return out;
  }, [chosenStaff, day, service, hoursByStaff, duration]);

  // Fetch busy ranges for the chosen staff+day so taken slots can be greyed out.
  useEffect(() => {
    if (step !== "time" || !chosenStaff || !day) return;
    let cancelled = false;
    (async () => {
      setLoadingSlots(true);
      setBusy([]);
      const from = londonInstant(day.y, day.mo, day.da, 0, 0).toISOString();
      const to = new Date(londonInstant(day.y, day.mo, day.da, 0, 0).getTime() + 86400000).toISOString();
      const { data } = await supabase.functions.invoke("get-availability", {
        body: { staff_id: chosenStaff.id, from, to },
      });
      if (cancelled) return;
      setBusy(Array.isArray(data?.busy) ? (data.busy as Busy[]) : []);
      setLoadingSlots(false);
    })();
    return () => { cancelled = true; };
  }, [step, chosenStaff, day]);

  const isTaken = (iso: string, endMs: number) => {
    const startMs = new Date(iso).getTime();
    if (startMs <= Date.now()) return true; // past slot
    return busy.some((b) => startMs < new Date(b.ends_at).getTime() && endMs > new Date(b.starts_at).getTime());
  };

  const submit = async () => {
    if (!service || !chosenStaff || !slotIso) return;
    if (!name.trim() || phone.trim().length < 3) {
      setError("Please enter your name and phone number.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const { data, error: fnErr } = await supabase.functions.invoke("create-booking", {
      body: {
        slug,
        staff_id: chosenStaff.id,
        service_name: service.name,
        customer_name: name.trim(),
        customer_phone: phone.trim(),
        starts_at: slotIso,
        reminder_opt_in: reminderOptIn,
      },
    });
    setSubmitting(false);
    if (fnErr || !data) {
      setError("Something went wrong. Please try again.");
      return;
    }
    if (!data.ok) {
      const msg = ERROR_COPY[variant][data.error as string] || "Couldn't complete the booking. Please try again.";
      setError(msg);
      // If the slot was taken / invalid, send them back to re-pick a time.
      if (["slot_taken", "outside_hours", "in_past"].includes(data.error)) setStep("time");
      return;
    }
    setConfirmed(data.booking);
    setStep("confirm");
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
      <div className={`absolute inset-0 ${t.overlay} backdrop-blur-sm`} onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl ${t.panel} sm:rounded-2xl`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between border-b ${t.border} px-5 py-4`}>
          <div>
            <div className={`${t.titleBase} text-xl`}>
              {confirmed ? "You're booked" : "Book an appointment"}
            </div>
            {!confirmed && (
              <div className={`text-xs ${t.sub}`}>{content.businessName}</div>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className={`rounded-full p-1.5 ${t.closeBtn}`}>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {/* STEP: service */}
          {step === "service" && (
            <div className="space-y-2">
              <p className={`text-sm ${t.muted}`}>Choose a service</p>
              {services.length === 0 && <p className={`text-sm ${t.faint}`}>No services listed.</p>}
              {services.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => { setService(s); setStep("staff"); }}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl ${t.option} px-4 py-3 text-left transition-colors`}
                >
                  <div>
                    <div className={`font-semibold ${t.optionTitle}`}>{s.name}</div>
                    <div className={`text-xs ${t.muted}`}>{s.durationMins ?? DEFAULT_DURATION} min{s.price ? ` · ${s.price}` : ""}</div>
                  </div>
                  <span className={t.accent}>›</span>
                </button>
              ))}
            </div>
          )}

          {/* STEP: staff */}
          {step === "staff" && (
            <div className="space-y-2">
              <p className={`text-sm ${t.muted}`}>Choose who with</p>
              {loadingStaff && <p className={`text-sm ${t.faint}`}>Loading…</p>}
              {!loadingStaff && staff.length === 0 && (
                <p className={`text-sm ${t.faint}`}>No one is available to book online right now.</p>
              )}
              {staff.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => { setChosenStaff(st); setDay(null); setStep("day"); }}
                  className={`flex w-full items-center gap-3 rounded-xl ${t.option} px-4 py-3 text-left transition-colors`}
                >
                  {st.avatar_url ? (
                    <img src={st.avatar_url} alt={st.name} className={`h-10 w-10 rounded-full border ${t.border} object-cover`} />
                  ) : (
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full ${t.avatar} text-sm font-bold`}>
                      {st.name.trim().slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <span className={`font-semibold ${t.optionTitle}`}>{st.name}</span>
                </button>
              ))}
            </div>
          )}

          {/* STEP: day */}
          {step === "day" && (
            <div className="space-y-3">
              <p className={`text-sm ${t.muted}`}>Pick a day with {chosenStaff?.name}</p>
              {dayOptions.length === 0 ? (
                <p className={`text-sm ${t.faint}`}>No upcoming availability — please call the shop.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {dayOptions.map((d) => (
                    <button
                      key={`${d.y}-${d.mo}-${d.da}`}
                      type="button"
                      onClick={() => { setDay(d); setSlotIso(null); setStep("time"); }}
                      className={`rounded-lg ${t.dayBtn} px-2 py-2 text-center text-sm transition-colors`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* STEP: time */}
          {step === "time" && (
            <div className="space-y-3">
              <p className={`text-sm ${t.muted}`}>Pick a time on {day?.label}</p>
              {loadingSlots ? (
                <p className={`text-sm ${t.faint}`}>Checking availability…</p>
              ) : slots.length === 0 ? (
                <p className={`text-sm ${t.faint}`}>No times available this day.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {slots.map((sl) => {
                    const taken = isTaken(sl.iso, sl.endMs);
                    return (
                      <button
                        key={sl.iso}
                        type="button"
                        disabled={taken}
                        onClick={() => { setSlotIso(sl.iso); setError(null); setStep("details"); }}
                        className={`rounded-lg border px-2 py-2 text-center text-sm transition-colors ${
                          taken ? t.timeTaken : t.timeFree
                        }`}
                      >
                        {fmtTime(sl.iso)}
                      </button>
                    );
                  })}
                </div>
              )}
              <p className={`text-[11px] ${t.faint}`}>Crossed-out times are already booked.</p>
            </div>
          )}

          {/* STEP: details */}
          {step === "details" && (
            <div className="space-y-3">
              <div className={`rounded-lg ${t.summary} p-3 text-sm ${t.muted}`}>
                <div className={`font-semibold ${t.optionTitle}`}>{service?.name} · {duration} min</div>
                <div className={`text-xs ${t.muted}`}>
                  {chosenStaff?.name} · {slotIso ? fmtDateTime(slotIso) : ""}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className={`text-xs ${t.muted}`}>Your name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`w-full rounded-lg ${t.input} px-3 py-2 outline-none`}
                  placeholder="Full name"
                />
              </div>
              <div className="space-y-1.5">
                <label className={`text-xs ${t.muted}`}>Phone</label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  inputMode="tel"
                  className={`w-full rounded-lg ${t.input} px-3 py-2 outline-none`}
                  placeholder="Mobile number"
                />
              </div>
              {/* SMS reminder opt-in — explicit, never pre-checked. */}
              <label className={`flex cursor-pointer items-start gap-3 rounded-lg ${t.option} p-3`}>
                <input
                  type="checkbox"
                  checked={reminderOptIn}
                  onChange={(e) => setReminderOptIn(e.target.checked)}
                  className={`mt-0.5 h-4 w-4 shrink-0 ${t.checkbox}`}
                />
                <span className="text-sm">
                  <span className={t.checkboxStrong}>Text me a reminder 1 hour before my appointment</span>
                  <span className={`mt-0.5 block text-xs ${t.faint}`}>
                    We'll only text you about this booking, to the number above.
                  </span>
                </span>
              </label>
              {error && <p className={`text-sm ${t.error}`}>{error}</p>}
            </div>
          )}

          {/* STEP: confirmation */}
          {step === "confirm" && confirmed && (
            <div className="space-y-4 py-2 text-center">
              <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${t.confirmIcon}`}>
                <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <div>
                <div className={`${t.titleBase} text-2xl`}>Booking confirmed</div>
                <p className={`mt-1 text-sm ${t.muted}`}>A confirmation isn't sent by text yet — please keep these details.</p>
              </div>
              <div className={`mx-auto max-w-xs space-y-1 rounded-xl ${t.summary} p-4 text-left text-sm`}>
                <Row label="Service" value={confirmed.service_name} t={t} />
                <Row label="With" value={confirmed.staff_name} t={t} />
                <Row label="When" value={fmtDateTime(confirmed.starts_at)} t={t} />
                <Row label={variant === "salon" ? "Salon" : "Shop"} value={confirmed.business_name || content.businessName} t={t} />
              </div>
            </div>
          )}
        </div>

        {/* Footer / actions */}
        <div className={`flex items-center justify-between gap-3 border-t ${t.border} px-5 py-3`}>
          {step === "confirm" ? (
            <button type="button" onClick={onClose} className={`ml-auto rounded-full ${t.primaryBtn} px-6 py-2 text-sm font-bold`}>
              Done
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => goBack(step, setStep)}
                className={`rounded-full ${t.backBtn} px-4 py-2 text-sm`}
              >
                Back
              </button>
              {step === "details" ? (
                <button
                  type="button"
                  onClick={submit}
                  disabled={submitting}
                  className={`rounded-full ${t.primaryBtn} px-6 py-2 text-sm font-bold disabled:opacity-60`}
                >
                  {submitting ? "Booking…" : "Confirm booking"}
                </button>
              ) : (
                <span className={`text-xs ${t.faint}`}>
                  {service ? service.name : ""}{chosenStaff ? ` · ${chosenStaff.name}` : ""}
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, t }: { label: string; value: string; t: BookingTheme }) {
  return (
    <div className="flex justify-between gap-3">
      <span className={t.rowLabel}>{label}</span>
      <span className={`text-right font-medium ${t.rowValue}`}>{value}</span>
    </div>
  );
}

// Step-back navigation (mirrors the forward order).
function goBack(step: Step, setStep: (s: Step) => void) {
  const order: Step[] = ["service", "staff", "day", "time", "details"];
  const i = order.indexOf(step);
  setStep(order[Math.max(0, i - 1)]);
}
