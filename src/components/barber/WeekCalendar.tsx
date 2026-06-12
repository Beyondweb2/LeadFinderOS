import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { TZ, londonInstant, londonYMD, londonParts, fmtTime, minLabel } from "./london";

/**
 * Week-grid calendar — days (Mon→Sun) across the top, time down the side,
 * bookings rendered as blocks in their slots, page-able week by week.
 *
 * Data: the existing bookings table via the standard (typed) client; owner RLS
 * scopes it to this site. Shows non-cancelled bookings for the visible week.
 *
 * Design constraint: no new colours. All blocks use the amber accent; multiple
 * staff are distinguished by a LABEL on each block (staff name), not by hue.
 * Concurrent bookings (different staff at the same time) are laid out in side-by-
 * side lanes within their day so nothing overlaps.
 */

const HOUR_PX = 56;
const DEFAULT_START_MIN = 9 * 60;  // 09:00
const DEFAULT_END_MIN = 18 * 60;   // 18:00
const MIN_BLOCK_PX = 24;

type Row = {
  id: string;
  starts_at: string;
  ends_at: string;
  service_name: string;
  customer_name: string;
  status: string;
  staff_id: string;
  booking_staff: { name: string } | null;
};

type Block = Row & { dateKey: string; startMin: number; endMin: number; lane: number; lanes: number };

function staffInitial(name: string | undefined): string {
  return (name?.trim()?.[0] || "?").toUpperCase();
}

// Assign side-by-side lanes within a day so overlapping bookings don't stack.
function withLanes(items: (Row & { dateKey: string; startMin: number; endMin: number })[]): Block[] {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const laneEnds: number[] = [];
  const placed = sorted.map((it) => {
    let lane = laneEnds.findIndex((end) => end <= it.startMin);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(it.endMin); }
    else laneEnds[lane] = it.endMin;
    return { ...it, lane };
  });
  const lanes = Math.max(1, laneEnds.length);
  return placed.map((p) => ({ ...p, lanes }));
}

export function WeekCalendar({ siteId }: { siteId: string }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);

  // The 7 day columns (Mon→Sun) for the visible week, in London.
  const days = useMemo(() => {
    const { y, mo, da } = londonYMD(new Date());
    const todayUTC = Date.UTC(y, mo - 1, da);
    const dow = new Date(todayUTC).getUTCDay();        // 0=Sun … 6=Sat
    const sinceMonday = (dow + 6) % 7;                 // 0 if Monday
    const monUTC = todayUTC - sinceMonday * 86400000 + weekOffset * 7 * 86400000;
    const out = [];
    for (let i = 0; i < 7; i++) {
      const dt = new Date(monUTC + i * 86400000);
      const yy = dt.getUTCFullYear(), mm = dt.getUTCMonth() + 1, dd = dt.getUTCDate();
      const dateKey = `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
      out.push({
        dateKey,
        y: yy, mo: mm, da: dd,
        name: new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short" }).format(new Date(Date.UTC(yy, mm - 1, dd, 12))),
        num: dd,
        isToday: dateKey === `${y}-${String(mo).padStart(2, "0")}-${String(da).padStart(2, "0")}`,
      });
    }
    return out;
  }, [weekOffset]);

  // Fetch the week's non-cancelled bookings (owner RLS scopes to this site).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const start = londonInstant(days[0].y, days[0].mo, days[0].da, 0, 0);
      const afterSunday = new Date(Date.UTC(days[6].y, days[6].mo - 1, days[6].da) + 86400000);
      const end = londonInstant(afterSunday.getUTCFullYear(), afterSunday.getUTCMonth() + 1, afterSunday.getUTCDate(), 0, 0);
      const { data, error } = await supabase
        .from("bookings")
        .select("id, starts_at, ends_at, service_name, customer_name, status, staff_id, booking_staff(name)")
        .eq("site_id", siteId)
        .neq("status", "cancelled")
        .gte("starts_at", start.toISOString())
        .lt("starts_at", end.toISOString())
        .order("starts_at", { ascending: true });
      if (cancelled) return;
      setRows(error ? [] : ((data ?? []) as unknown as Row[]));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [siteId, days]);

  // Vertical range: 09:00–18:00, expanded to fit any earlier/later bookings.
  const { startMin, endMin } = useMemo(() => {
    let s = DEFAULT_START_MIN, e = DEFAULT_END_MIN;
    for (const r of rows) {
      const a = londonParts(r.starts_at).minutes;
      const z = londonParts(r.ends_at).minutes;
      if (a < s) s = Math.floor(a / 60) * 60;
      if (z > e) e = Math.ceil(z / 60) * 60;
    }
    return { startMin: s, endMin: e };
  }, [rows]);

  const totalPx = ((endMin - startMin) / 60) * HOUR_PX;
  const pxPerMin = HOUR_PX / 60;
  const hours = useMemo(() => {
    const out: number[] = [];
    for (let m = startMin; m <= endMin; m += 60) out.push(m);
    return out;
  }, [startMin, endMin]);

  // Bookings grouped per day, with overlap lanes.
  const blocksByDay = useMemo(() => {
    const map: Record<string, Block[]> = {};
    const buckets: Record<string, (Row & { dateKey: string; startMin: number; endMin: number })[]> = {};
    for (const r of rows) {
      const sp = londonParts(r.starts_at);
      const ep = londonParts(r.ends_at);
      if (!buckets[sp.dateKey]) buckets[sp.dateKey] = [];
      buckets[sp.dateKey].push({ ...r, dateKey: sp.dateKey, startMin: sp.minutes, endMin: ep.minutes });
    }
    for (const k of Object.keys(buckets)) map[k] = withLanes(buckets[k]);
    return map;
  }, [rows]);

  const multiStaff = useMemo(() => new Set(rows.map((r) => r.booking_staff?.name).filter(Boolean)).size > 1, [rows]);
  const weekLabel = `${days[0].name} ${days[0].num} – ${days[6].name} ${days[6].num}`;
  const totalThisWeek = rows.length;

  return (
    <div className="rounded-2xl border border-line bg-ink-card">
      {/* Week toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-3 sm:p-4">
        <div>
          <div className="font-display text-lg uppercase tracking-wide text-white">{weekLabel}</div>
          <div className="text-xs text-zinc-500">{totalThisWeek} booking{totalThisWeek === 1 ? "" : "s"} this week</div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon" aria-label="Previous week" onClick={() => setWeekOffset((w) => w - 1)}
            className="h-8 w-8 rounded-full border-line bg-white/[0.03] text-zinc-300 hover:border-amber/50 hover:text-white">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekOffset(0)} disabled={weekOffset === 0}
            className="rounded-full border-line bg-white/[0.03] text-zinc-300 hover:border-amber/50 hover:text-white disabled:opacity-40">
            Today
          </Button>
          <Button variant="outline" size="icon" aria-label="Next week" onClick={() => setWeekOffset((w) => w + 1)}
            className="h-8 w-8 rounded-full border-line bg-white/[0.03] text-zinc-300 hover:border-amber/50 hover:text-white">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[680px]">
            {/* Day headers */}
            <div className="flex border-b border-line">
              <div className="w-12 shrink-0 sm:w-14" />
              {days.map((d) => (
                <div key={d.dateKey} className="flex-1 px-1 py-2 text-center">
                  <div className="text-[11px] uppercase tracking-wider text-zinc-500">{d.name}</div>
                  <div className={`mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${
                    d.isToday ? "bg-amber text-ink" : "text-zinc-200"}`}>
                    {d.num}
                  </div>
                </div>
              ))}
            </div>

            {/* Grid body */}
            <div className="flex">
              {/* Time axis */}
              <div className="relative w-12 shrink-0 sm:w-14" style={{ height: totalPx }}>
                {hours.map((m) => (
                  <div key={m} className="absolute right-1 -translate-y-1/2 text-[10px] tabular-nums text-zinc-500"
                    style={{ top: (m - startMin) * pxPerMin }}>
                    {minLabel(m)}
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {days.map((d) => (
                <div key={d.dateKey} className="relative flex-1 border-l border-line" style={{ height: totalPx }}>
                  {/* hour gridlines */}
                  {hours.map((m) => (
                    <div key={m} className="absolute inset-x-0 border-t border-line/40" style={{ top: (m - startMin) * pxPerMin }} />
                  ))}
                  {/* booking blocks */}
                  {(blocksByDay[d.dateKey] ?? []).map((b) => {
                    const top = (b.startMin - startMin) * pxPerMin;
                    const height = Math.max((b.endMin - b.startMin) * pxPerMin, MIN_BLOCK_PX);
                    const widthPct = 100 / b.lanes;
                    return (
                      <div
                        key={b.id}
                        title={`${fmtTime(b.starts_at)} · ${b.customer_name} · ${b.service_name}${b.booking_staff?.name ? ` · ${b.booking_staff.name}` : ""}`}
                        className="absolute overflow-hidden rounded-md border-l-2 border-amber bg-amber/15 px-1.5 py-1 text-[10px] leading-tight text-zinc-100"
                        style={{ top, height, left: `${b.lane * widthPct}%`, width: `calc(${widthPct}% - 2px)` }}
                      >
                        <div className="font-semibold text-amber-soft">{fmtTime(b.starts_at)}</div>
                        <div className="truncate font-medium text-white">{b.customer_name}</div>
                        <div className="truncate text-zinc-400">{b.service_name}</div>
                        {multiStaff && b.booking_staff?.name && (
                          <div className="mt-0.5 inline-flex items-center gap-1 rounded-sm bg-white/10 px-1 text-[9px] font-semibold text-zinc-200">
                            <span className="inline-flex h-3 w-3 items-center justify-center rounded-full bg-amber/30 text-[8px] text-amber-soft">
                              {staffInitial(b.booking_staff.name)}
                            </span>
                            {b.booking_staff.name}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!loading && totalThisWeek === 0 && (
        <p className="border-t border-line py-6 text-center text-sm text-muted-foreground">No bookings this week.</p>
      )}
    </div>
  );
}
