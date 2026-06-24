import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, Upload, UserPlus, Clock } from "lucide-react";

/**
 * Staff & Booking — Phase 2.
 *
 * The barber (site owner) manages their booking staff and each staff member's
 * weekly working hours, on top of the Phase 1 schema (booking_staff +
 * staff_working_hours) and its owner-scoped RLS. All reads/writes go through the
 * standard Supabase client; RLS guarantees an owner only ever touches rows for a
 * site they own. Solo shops add a single staff member manually (no auto-create).
 *
 * v1: one open interval per weekday (the schema supports split shifts via
 * multiple rows; this UI creates at most one row per day). Avatars reuse the
 * barber-site-images bucket + owner storage RLS, uploaded to the site's own
 * folder (<siteId>/...), exactly like the site images.
 *
 * NOTE: booking_staff / staff_working_hours are not in the generated Supabase
 * types yet (the Phase 1 migration was applied via the SQL runner, not Lovable,
 * so types.ts hasn't been regenerated). We use an untyped view of the same
 * client for those two tables; RLS still enforces all access.
 */

const sb = supabase as unknown as SupabaseClient;

const BUCKET = "barber-site-images";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

// The UI shows Mon→Sun, but the schema stores weekday as 0=Sun … 6=Sat
// (JS getDay()). This explicit mapping is the single source of truth for the
// conversion, so there's no off-by-one arithmetic anywhere.
const WEEKDAYS: { label: string; short: string; weekday: number }[] = [
  { label: "Monday", short: "Mon", weekday: 1 },
  { label: "Tuesday", short: "Tue", weekday: 2 },
  { label: "Wednesday", short: "Wed", weekday: 3 },
  { label: "Thursday", short: "Thu", weekday: 4 },
  { label: "Friday", short: "Fri", weekday: 5 },
  { label: "Saturday", short: "Sat", weekday: 6 },
  { label: "Sunday", short: "Sun", weekday: 0 },
];

const DEFAULT_OPEN = "09:00";
const DEFAULT_CLOSE = "17:00";

type Staff = {
  id: string;
  site_id: string;
  name: string;
  avatar_url: string | null;
  sort_order: number;
  is_active: boolean;
};

type WorkingHour = {
  id: string;
  staff_id: string;
  weekday: number;
  start_time: string; // 'HH:MM:SS' from the DB
  end_time: string;
};

type DayState = { open: boolean; start: string; end: string };

function validateImage(f: File): string | null {
  if (!ALLOWED.includes(f.type)) return "Avatar must be JPEG, PNG or WebP";
  if (f.size > MAX_BYTES) return "Avatar must be under 5 MB";
  return null;
}

async function uploadAvatar(file: File, siteId: string, staffId: string): Promise<string> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  // Owner storage RLS allows writes only under the site's own folder (<siteId>/…).
  const path = `${siteId}/staff-${staffId}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Build the 7-day editor state from a staff member's stored hours. v1 uses the
// first row per weekday; any extra rows (split shifts) are ignored by this UI.
function buildDays(hours: WorkingHour[]): Record<number, DayState> {
  const days: Record<number, DayState> = {};
  for (const d of WEEKDAYS) {
    days[d.weekday] = { open: false, start: DEFAULT_OPEN, end: DEFAULT_CLOSE };
  }
  for (const h of hours) {
    if (days[h.weekday] && !days[h.weekday].open) {
      days[h.weekday] = { open: true, start: h.start_time.slice(0, 5), end: h.end_time.slice(0, 5) };
    }
  }
  return days;
}

export function StaffManager({
  siteId,
  locked = false,
  onUpgrade,
}: {
  siteId: string;
  /** When true, online booking is a paid feature this barber hasn't unlocked —
   *  show an upgrade prompt instead of the staff/hours editor. Defaults to false
   *  (e.g. the salon shell passes nothing → unlocked). */
  locked?: boolean;
  onUpgrade?: () => void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [hoursByStaff, setHoursByStaff] = useState<Record<string, WorkingHour[]>>({});
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: staffRows, error } = await sb
        .from("booking_staff")
        .select("id, site_id, name, avatar_url, sort_order, is_active")
        .eq("site_id", siteId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (error) {
        toast({ title: "Couldn't load staff", description: error.message, variant: "destructive" });
        setLoading(false);
        return;
      }
      const list = (staffRows ?? []) as Staff[];
      setStaff(list);

      if (list.length) {
        const { data: hourRows } = await sb
          .from("staff_working_hours")
          .select("id, staff_id, weekday, start_time, end_time")
          .in("staff_id", list.map((s) => s.id));
        if (cancelled) return;
        const grouped: Record<string, WorkingHour[]> = {};
        for (const h of (hourRows ?? []) as WorkingHour[]) {
          if (!grouped[h.staff_id]) grouped[h.staff_id] = [];
          grouped[h.staff_id].push(h);
        }
        setHoursByStaff(grouped);
      } else {
        setHoursByStaff({});
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  const addStaff = async () => {
    const name = newName.trim();
    if (!name) {
      toast({ title: "Name required", description: "Enter the staff member's name first.", variant: "destructive" });
      return;
    }
    setAdding(true);
    const { data, error } = await sb
      .from("booking_staff")
      .insert({ site_id: siteId, name, sort_order: staff.length })
      .select("id, site_id, name, avatar_url, sort_order, is_active")
      .single();
    setAdding(false);
    if (error) {
      toast({ title: "Couldn't add staff", description: error.message, variant: "destructive" });
      return;
    }
    setStaff((prev) => [...prev, data as Staff]);
    setNewName("");
    toast({ title: "Staff added", description: `${name} can now be given a weekly schedule.` });
  };

  const onRemoved = (id: string) => setStaff((prev) => prev.filter((s) => s.id !== id));

  // Paid feature: free barbers can't add staff / set hours — show the upgrade
  // route to Stripe instead of the editor (defence-in-depth; the dashboard prompt
  // also routes unpaid users to checkout, but this catches a direct visit).
  if (locked) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Staff &amp; booking</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Online booking lets customers book your services 24/7, with automatic SMS reminders to
            cut no-shows. Set your weekly availability and your booking page goes live.
          </p>
          <Button
            onClick={() => onUpgrade?.()}
            className="rounded-full bg-amber font-bold text-ink hover:bg-amber-soft"
          >
            <Clock className="h-4 w-4 mr-2" /> Set up your bookings
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Staff &amp; booking</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Add the people who take appointments and set each person's weekly hours. A solo barber just
          adds themselves as one staff member. Once online booking goes live, customers pick a staff
          member and an available time.
        </p>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {staff.length === 0 && (
              <p className="text-sm text-muted-foreground">No staff yet — add your first below.</p>
            )}

            <div className="space-y-4">
              {staff.map((s) => (
                <StaffCard
                  key={s.id}
                  staff={s}
                  siteId={siteId}
                  initialHours={hoursByStaff[s.id] ?? []}
                  onRemoved={() => onRemoved(s.id)}
                />
              ))}
            </div>

            {/* Add a staff member */}
            <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center">
              <Input
                value={newName}
                placeholder="New staff member's name"
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void addStaff();
                  }
                }}
                className="sm:max-w-xs"
              />
              <Button variant="outline" size="sm" onClick={() => void addStaff()} disabled={adding}>
                {adding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserPlus className="h-4 w-4 mr-2" />}
                Add staff member
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function StaffCard({
  staff,
  siteId,
  initialHours,
  onRemoved,
}: {
  staff: Staff;
  siteId: string;
  initialHours: WorkingHour[];
  onRemoved: () => void;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(staff.name);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(staff.avatar_url);
  const [days, setDays] = useState<Record<number, DayState>>(() => buildDays(initialHours));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);

  const setDay = (weekday: number, patch: Partial<DayState>) =>
    setDays((prev) => ({ ...prev, [weekday]: { ...prev[weekday], ...patch } }));

  const onPickAvatar = async (file: File | null) => {
    if (!file) return;
    const vErr = validateImage(file);
    if (vErr) {
      toast({ title: "Invalid image", description: vErr, variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const url = await uploadAvatar(file, siteId, staff.id);
      const { error } = await sb.from("booking_staff").update({ avatar_url: url }).eq("id", staff.id);
      if (error) throw error;
      setAvatarUrl(url);
      toast({ title: "Photo updated" });
    } catch (e) {
      toast({ title: "Upload failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const remove = async () => {
    if (!window.confirm(`Remove ${staff.name}? They'll stop taking bookings (past bookings are kept).`)) return;
    setRemoving(true);
    const { error } = await sb.from("booking_staff").update({ is_active: false }).eq("id", staff.id);
    setRemoving(false);
    if (error) {
      toast({ title: "Remove failed", description: error.message, variant: "destructive" });
      return;
    }
    onRemoved();
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast({ title: "Name required", description: "A staff member needs a name.", variant: "destructive" });
      return;
    }
    // Validate every open day before writing anything.
    for (const d of WEEKDAYS) {
      const day = days[d.weekday];
      if (day.open && !(day.start < day.end)) {
        toast({
          title: `${d.label}: invalid hours`,
          description: "End time must be after start time.",
          variant: "destructive",
        });
        return;
      }
    }
    setSaving(true);
    try {
      if (trimmed !== staff.name) {
        const { error } = await sb.from("booking_staff").update({ name: trimmed }).eq("id", staff.id);
        if (error) throw error;
      }
      // Replace the whole schedule for this staff member (v1 = one row per open day).
      const { error: delErr } = await sb.from("staff_working_hours").delete().eq("staff_id", staff.id);
      if (delErr) throw delErr;
      const rows = WEEKDAYS.filter((d) => days[d.weekday].open).map((d) => ({
        staff_id: staff.id,
        weekday: d.weekday,
        start_time: days[d.weekday].start,
        end_time: days[d.weekday].end,
      }));
      if (rows.length) {
        const { error: insErr } = await sb.from("staff_working_hours").insert(rows);
        if (insErr) throw insErr;
      }
      toast({ title: "Saved", description: `${trimmed}'s details and schedule are updated.` });
    } catch (e) {
      toast({ title: "Save failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-border p-4 space-y-4">
      {/* Avatar + name + remove */}
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          {avatarUrl ? (
            <img src={avatarUrl} alt={name} className="h-14 w-14 rounded-full border border-border object-cover" />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
              {initials(name)}
            </div>
          )}
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
              <Loader2 className="h-4 w-4 animate-spin text-white" />
            </div>
          )}
        </div>

        <div className="flex-1 space-y-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Staff member name" />
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => onPickAvatar(e.target.files?.[0] ?? null)}
          />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Upload className="h-4 w-4 mr-2" /> {avatarUrl ? "Change photo" : "Add photo"}
          </Button>
        </div>

        <Button
          variant="ghost"
          size="icon"
          title="Remove staff member"
          onClick={() => void remove()}
          disabled={removing}
          className="text-muted-foreground hover:text-destructive"
        >
          {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </Button>
      </div>

      {/* Weekly schedule (Mon→Sun; closed by default) */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2 text-xs">
          <Clock className="h-3.5 w-3.5" /> Weekly hours
        </Label>
        <div className="space-y-1.5">
          {WEEKDAYS.map((d) => {
            const day = days[d.weekday];
            return (
              <div key={d.weekday} className="flex items-center gap-2">
                <span className="w-10 shrink-0 text-sm text-muted-foreground">{d.short}</span>
                <Switch checked={day.open} onCheckedChange={(v) => setDay(d.weekday, { open: v })} />
                {day.open ? (
                  <div className="flex flex-1 items-center gap-2">
                    <Input
                      type="time"
                      value={day.start}
                      onChange={(e) => setDay(d.weekday, { start: e.target.value })}
                      className="w-[120px]"
                    />
                    <span className="text-muted-foreground">–</span>
                    <Input
                      type="time"
                      value={day.end}
                      onChange={(e) => setDay(d.weekday, { end: e.target.value })}
                      className="w-[120px]"
                    />
                  </div>
                ) : (
                  <span className="flex-1 text-sm text-muted-foreground">Closed</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={() => void save()} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save staff member
        </Button>
      </div>
    </div>
  );
}
