import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Phone, Bell, Ban, UserX } from "lucide-react";

/**
 * Bookings — Phase 4.
 *
 * The barber (site owner) sees their UPCOMING confirmed bookings and can cancel
 * or mark no-show. Reads/writes go through the standard (typed) Supabase client;
 * the Phase 1 owner RLS ("Owners read their bookings" / "Owners update their
 * bookings", both owns_site) scopes everything to the owner's own site.
 *
 * Only status='confirmed' future bookings are shown; cancelling / no-show flips
 * the status, which drops the row from this list AND (because the DB exclusion
 * constraint only blocks non-cancelled bookings) frees the slot to be booked
 * again — no extra work needed here.
 *
 * "New since last visit": a per-site localStorage timestamp (lastSeen). Bookings
 * created after it get a "New" badge + a header count. First-ever visit shows
 * NOTHING as new (we just record the timestamp). On each view we advance lastSeen
 * to now, so only genuinely newer bookings count next time.
 *
 * NOTE: reminder_opt_in isn't in the generated types yet (added via the SQL runner
 * after Lovable's last types regen), so rows are cast to a local type that adds it.
 * Selecting "*" returns it (and created_at) at runtime; before the column exists
 * reminder_opt_in is simply undefined → treated as "no reminder", which is correct.
 */

const TZ = "Europe/London";
const lastSeenKey = (siteId: string) => `barber:bookings:lastSeen:${siteId}`;

type BookingRow = {
  id: string;
  created_at: string;
  starts_at: string;
  ends_at: string;
  service_name: string;
  customer_name: string;
  customer_phone: string;
  status: string;
  reminder_opt_in: boolean | null;
  staff_id: string;
  booking_staff: { name: string } | null;
};

function fmtDayHeading(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
}
function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));
}
function dayKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

export function BookingsManager({ siteId }: { siteId: string }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [actingId, setActingId] = useState<string | null>(null);
  // The lastSeen value captured AT VIEW TIME (used for the badges this render).
  // null = first-ever visit → nothing is "new". We advance the stored value to
  // now after loading, but keep this captured value for the current render.
  const [seenThreshold, setSeenThreshold] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("bookings")
        .select("*, booking_staff(name)")
        .eq("site_id", siteId)
        .eq("status", "confirmed")
        .gt("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true });
      if (cancelled) return;
      if (error) {
        toast({ title: "Couldn't load bookings", description: error.message, variant: "destructive" });
        setLoading(false);
        return;
      }
      setBookings((data ?? []) as unknown as BookingRow[]);

      // "New since last visit": read the prior lastSeen (null on first visit →
      // nothing new), then advance it to now for next time.
      const stored = localStorage.getItem(lastSeenKey(siteId));
      setSeenThreshold(stored ? Date.parse(stored) : null);
      try {
        localStorage.setItem(lastSeenKey(siteId), new Date().toISOString());
      } catch { /* storage unavailable — badges just won't persist */ }

      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  const isNew = (b: BookingRow) =>
    seenThreshold !== null && Date.parse(b.created_at) > seenThreshold;

  const newCount = useMemo(() => bookings.filter(isNew).length, [bookings, seenThreshold]);

  // Soonest-first list grouped into days (the query is already ordered by time).
  const groups = useMemo(() => {
    const map = new Map<string, BookingRow[]>();
    for (const b of bookings) {
      const k = dayKey(b.starts_at);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(b);
    }
    return Array.from(map.values());
  }, [bookings]);

  const act = async (b: BookingRow, next: "cancelled" | "no_show") => {
    const verb = next === "cancelled" ? "Cancel" : "Mark a no-show for";
    if (!window.confirm(`${verb} ${b.customer_name}'s ${b.service_name} on ${fmtDayHeading(b.starts_at)} at ${fmtTime(b.starts_at)}?`)) {
      return;
    }
    setActingId(b.id);
    const { error } = await supabase.from("bookings").update({ status: next }).eq("id", b.id);
    setActingId(null);
    if (error) {
      toast({ title: "Action failed", description: error.message, variant: "destructive" });
      return;
    }
    setBookings((prev) => prev.filter((x) => x.id !== b.id));
    toast({
      title: next === "cancelled" ? "Booking cancelled" : "Marked as no-show",
      description: next === "cancelled" ? "That time slot is free to book again." : undefined,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          Bookings
          {newCount > 0 && (
            <span className="rounded-full bg-amber/15 px-2 py-0.5 text-xs font-semibold text-amber-soft">
              {newCount} new
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Your upcoming appointments. Cancel or mark a no-show to free the slot.</p>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : bookings.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            No upcoming bookings yet.
          </p>
        ) : (
          <div className="space-y-5">
            {groups.map((items) => (
              <div key={dayKey(items[0].starts_at)} className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {fmtDayHeading(items[0].starts_at)}
                </h4>
                {items.map((b) => (
                  <div key={b.id} className="rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-foreground">{fmtTime(b.starts_at)}</span>
                          <span className="text-sm text-muted-foreground">· {b.service_name}</span>
                          {isNew(b) && (
                            <span className="rounded-full bg-amber px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink">
                              New
                            </span>
                          )}
                          {b.reminder_opt_in && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber/30 bg-amber/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-soft" title="Wants a text reminder">
                              <Bell className="h-3 w-3" /> reminder
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-sm text-foreground">{b.customer_name}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          <a href={`tel:${b.customer_phone}`} className="inline-flex items-center gap-1 hover:text-foreground">
                            <Phone className="h-3 w-3" /> {b.customer_phone}
                          </a>
                          <span>with {b.booking_staff?.name ?? "staff"}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => act(b, "no_show")}
                          disabled={actingId === b.id}
                          className="text-muted-foreground"
                          title="Mark no-show"
                        >
                          {actingId === b.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserX className="h-4 w-4 sm:mr-1.5" />}
                          <span className="hidden sm:inline">No-show</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => act(b, "cancelled")}
                          disabled={actingId === b.id}
                          className="text-destructive hover:text-destructive"
                          title="Cancel booking"
                        >
                          {actingId === b.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4 sm:mr-1.5" />}
                          <span className="hidden sm:inline">Cancel</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
