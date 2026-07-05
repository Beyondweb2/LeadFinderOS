import { useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, X, Sparkles } from "lucide-react";
import { enrichSocials } from "@/hooks/useEnrichBusiness";
import { SiteImagePicker, type SiteImagePickerHandle } from "@/components/SiteImagePicker";
import type { BarberSiteContent, BarberService, BarberOpeningHours } from "@/templates/barber/types";
import type { Json } from "@/integrations/supabase/types";
import { ServiceScanButton, type ServiceScanContext } from "@/components/ServiceScanButton";
import { BARBER_ACCENTS, BARBER_ACCENT_DEFAULT_HEX } from "@/config/barberAccents";

export type EditableSite = {
  id: string;
  site_name: string;
  status: string;
  content: BarberSiteContent;
  /** Design template ('barber' | 'salon' | 'plumber'); drives the image board's
   *  slots. Optional — defaults to barber/salon slots (hero/about/gallery). */
  template?: string;
};

// Preset accent colours (no free entry) — hexes chosen to read well on the dark
// template. "Amber" is the default (stored as unset). Soft/deep shades are
// derived by the template.
// Single source of truth for the palette (shared with the pre-sign-in dock).
const AMBER_HEX = BARBER_ACCENT_DEFAULT_HEX;
const ACCENT_PRESETS = BARBER_ACCENTS;

// Per-service appointment length presets (minutes). New services default to 30;
// existing services with no stored duration are treated as 30 at read time (no
// content migration — just a code-level fallback wherever duration is read).
const DURATION_OPTIONS = [15, 30, 45, 60, 90] as const;
const DEFAULT_DURATION = 30;

/** Trim + auto-prepend https://; empty → undefined (so the key drops on save and
 *  the social icon disappears). Non-blocking — the operator pastes verified URLs. */
function normalizeSocialUrl(v: string): string | undefined {
  const t = v.trim();
  if (!t) return undefined;
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

/**
 * Reusable barber-site editor: text + services/prices + images/logo, with one
 * "Save all changes" that commits text + pending image uploads in a single write.
 *
 * The save SPREADS the existing content and overwrites ONLY the edited keys, so
 * fields the form doesn't expose (businessName, category, hours, phone, address,
 * stats, googleRating, reviewCount, …) are preserved, never dropped.
 *
 * Styling is neutral (theme tokens) so it inherits the host page's look — used by
 * the admin Manage page and (Phase 2) the barber dashboard. `onSaved` hands the
 * freshly-saved full content back so the parent can sync its own copy. Optional
 * `children` render between the images card and the save bar (the admin page uses
 * that slot for its admin-only "Barber access" card).
 */
export function SiteEditor({
  site,
  onSaved,
  children,
  scanContext,
}: {
  site: EditableSite;
  onSaved?: (content: BarberSiteContent) => void;
  children?: ReactNode;
  /** When provided (a lead's website lives behind this site), the Services section
   *  offers a one-time "Scan website" button until the operator confirms services.
   *  Absent (e.g. the barber/salon owner dashboard) → no scan button. */
  scanContext?: ServiceScanContext;
}) {
  const { toast } = useToast();
  const pickerRef = useRef<SiteImagePickerHandle>(null);
  const [pickerDirty, setPickerDirty] = useState(false);

  const [heroHeadline, setHeroHeadline] = useState("");
  const [tagline, setTagline] = useState("");
  const [about, setAbout] = useState("");
  const [services, setServices] = useState<BarberService[]>([]);
  // True once the operator edits/adds/removes a service or applies a scan THIS
  // session. Only then does Save stamp content.servicesConfirmed — so saving an
  // unrelated field (e.g. the tagline) never hides the one-time scan helper.
  const servicesTouched = useRef(false);
  const [showExamplePrices, setShowExamplePrices] = useState(false);
  const [googleReviewsUrl, setGoogleReviewsUrl] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [hours, setHours] = useState<BarberOpeningHours[]>([]);
  const [accentColor, setAccentColor] = useState<string | undefined>(undefined);
  // Manual social URLs — SITE-only (content.facebookUrl/instagramUrl). Override
  // whatever auto-discovery put on the site; blank = no icon (honesty).
  const [facebookUrl, setFacebookUrl] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");

  const [textDirty, setTextDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [enrichingSocials, setEnrichingSocials] = useState(false);

  const anyDirty = textDirty || pickerDirty;

  // Seed local edit state from the loaded site (once per site id).
  useEffect(() => {
    const c = site.content || ({} as BarberSiteContent);
    setHeroHeadline(c.heroHeadline ?? "");
    setTagline(c.tagline ?? "");
    setAbout(c.about ?? "");
    setServices((c.services ?? []).map((s) => ({ ...s })));
    // Example prices are ON by default (only an explicit `false` turns them off),
    // so newly generated / never-toggled sites show illustrative prices.
    setShowExamplePrices(c.showExamplePrices !== false);
    setGoogleReviewsUrl(c.googleReviewsUrl ?? "");
    setPhone(c.phone ?? "");
    setAddress(c.address ?? "");
    setHours((c.hours ?? []).map((h) => ({ ...h })));
    setAccentColor(c.accentColor || undefined);
    setFacebookUrl(c.facebookUrl ?? "");
    setInstagramUrl(c.instagramUrl ?? "");
    setTextDirty(false);
    setPickerDirty(false);
    servicesTouched.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site.id]);

  // Warn before leaving (refresh / tab close) with unsaved edits.
  useEffect(() => {
    if (!anyDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [anyDirty]);

  const updateService = (i: number, field: keyof BarberService, value: string) => {
    setServices((prev) => prev.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)));
    servicesTouched.current = true;
    setTextDirty(true);
  };
  const updateServiceDuration = (i: number, mins: number) => {
    setServices((prev) => prev.map((s, idx) => (idx === i ? { ...s, durationMins: mins } : s)));
    servicesTouched.current = true;
    setTextDirty(true);
  };
  const addService = () => {
    // New services default to a 30-minute appointment length.
    setServices((prev) => [...prev, { name: "", durationMins: DEFAULT_DURATION }]);
    servicesTouched.current = true;
    setTextDirty(true);
  };
  const removeService = (i: number) => {
    setServices((prev) => prev.filter((_, idx) => idx !== i));
    servicesTouched.current = true;
    setTextDirty(true);
  };

  const updateHour = (i: number, field: keyof BarberOpeningHours, value: string) => {
    setHours((prev) => prev.map((h, idx) => (idx === i ? { ...h, [field]: value } : h)));
    setTextDirty(true);
  };
  const addHour = () => {
    setHours((prev) => [...prev, { day: "", open: "" }]);
    setTextDirty(true);
  };
  const removeHour = (i: number) => {
    setHours((prev) => prev.filter((_, idx) => idx !== i));
    setTextDirty(true);
  };

  // socialOverrides lets a programmatic caller (the Enrich-socials button) persist
  // freshly-fetched FB/IG in the SAME write without waiting for a setState flush
  // (React state is async — reading facebookUrl right after setFacebookUrl is stale).
  const handleSave = async (
    socialOverrides?: { facebookUrl?: string; instagramUrl?: string },
    opts?: { silentToast?: boolean },
  ) => {
    setSaving(true);
    try {
      const cleanedServices: BarberService[] = services
        .filter((s) => (s.name ?? "").trim())
        .map((s) => {
          const out: BarberService = { name: s.name.trim() };
          if (s.description && s.description.trim()) out.description = s.description.trim();
          if (s.price && s.price.trim()) out.price = s.price.trim();
          // Always persist a duration alongside name/price; absent → 30 minutes.
          out.durationMins = typeof s.durationMins === "number" ? s.durationMins : DEFAULT_DURATION;
          return out;
        });

      // Opening-hours rows: keep any with a day label, trimmed.
      const cleanedHours: BarberOpeningHours[] = hours
        .filter((h) => (h.day ?? "").trim())
        .map((h) => ({ day: h.day.trim(), open: (h.open ?? "").trim() }));

      // Spread the EXISTING content; overwrite ONLY the edited keys, so unedited
      // fields (businessName, category, stats, rating, …) are preserved and never
      // dropped.
      const base: BarberSiteContent = {
        ...site.content,
        heroHeadline: heroHeadline.trim(),
        tagline: tagline.trim(),
        about: about.trim(),
        services: cleanedServices,
        // Stamp servicesConfirmed once the operator has set their own services
        // (this session, or already true) — drives the one-time scan helper's gate.
        // Stays true once set; an unrelated save never sets it.
        servicesConfirmed: site.content?.servicesConfirmed || servicesTouched.current ? true : undefined,
        showExamplePrices,
        googleReviewsUrl: googleReviewsUrl.trim() || undefined,
        phone: phone.trim(),
        address: address.trim(),
        hours: cleanedHours,
        accentColor: accentColor || undefined,
        // Manual SITE socials → SocialLinks (header+footer). Trim + auto-prepend
        // https://; blank → undefined (key dropped on save → no icon, honesty).
        facebookUrl: normalizeSocialUrl(socialOverrides?.facebookUrl ?? facebookUrl),
        instagramUrl: normalizeSocialUrl(socialOverrides?.instagramUrl ?? instagramUrl),
      };

      // Re-host placed pool images + upload any picked files (singles, logo,
      // gallery) and merge them in — one combined content write.
      const finalContent = pickerRef.current ? await pickerRef.current.applyInto(base) : base;

      const { error } = await supabase
        .from("generated_sites")
        .update({ content: finalContent as unknown as Json })
        .eq("id", site.id);
      if (error) throw error;

      setServices(cleanedServices.map((s) => ({ ...s })));
      setHours(cleanedHours.map((h) => ({ ...h })));
      servicesTouched.current = false;
      setTextDirty(false);
      setPickerDirty(false);
      onSaved?.(finalContent);
      if (!opts?.silentToast) toast({ title: "Saved", description: "All changes saved." });
    } catch (e) {
      toast({ title: "Save failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // "Enrich socials": on-demand FULL web-results discovery for this lead. Fills the
  // FB/IG fields ONLY when empty (never overwrites a value the operator set), using
  // the values the cascade actually ATTACHED (res.facebook/instagram — location-matched
  // / Maps-listing / name-gated), NEVER the unconfirmed *Suggestion results. Auto-saves
  // via the shared handleSave with fresh overrides (avoids stale-state reads).
  const handleEnrichSocials = async () => {
    if (!scanContext?.leadId) return;
    setEnrichingSocials(true);
    try {
      const res = await enrichSocials({
        leadId: scanContext.leadId,
        placeId: scanContext.placeId ?? null,
        businessName: scanContext.businessName ?? null,
      });
      if (res.limitReached) {
        toast({ title: "Daily enrichment limit reached", description: "Try again tomorrow.", variant: "destructive" });
        return;
      }
      // Fill empty-only; keep any value already in the field.
      const added: string[] = [];
      let nextFb = facebookUrl;
      let nextIg = instagramUrl;
      if (!facebookUrl.trim() && res.facebook) { nextFb = res.facebook; setFacebookUrl(res.facebook); added.push("Facebook"); }
      if (!instagramUrl.trim() && res.instagram) { nextIg = res.instagram; setInstagramUrl(res.instagram); added.push("Instagram"); }

      if (added.length) {
        setTextDirty(true);
        // Persist through the shared save path with the fresh values (silent — we show
        // our own "Added …" toast below instead of the generic "Saved").
        await handleSave({ facebookUrl: nextFb, instagramUrl: nextIg }, { silentToast: true });
        toast({ title: `Added ${added.join(" + ")}`, description: "Saved to the site." });
      } else if (res.facebookSuggestion || res.instagramSuggestion) {
        // Found something, but not confident enough to auto-attach (not location-matched).
        toast({ title: "Found possible matches but not confident", description: "None added — verify manually if needed." });
      } else {
        toast({ title: "Found nothing new", description: "No confident Facebook/Instagram discovered." });
      }
    } catch (e) {
      toast({ title: "Enrich socials failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setEnrichingSocials(false);
    }
  };

  return (
    <>
      {/* Text content */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Text content</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Hero headline</Label>
            <Input value={heroHeadline} onChange={(e) => { setHeroHeadline(e.target.value); setTextDirty(true); }} />
          </div>
          <div className="space-y-1.5">
            <Label>Tagline</Label>
            <Input value={tagline} onChange={(e) => { setTagline(e.target.value); setTextDirty(true); }} />
          </div>
          <div className="space-y-1.5">
            <Label>About</Label>
            <Textarea rows={4} value={about} onChange={(e) => { setAbout(e.target.value); setTextDirty(true); }} />
          </div>

          <div className="space-y-3">
            <Label>Services &amp; prices</Label>
            {/* One-time "Scan website" helper: only while the site still has the
                generated default services (servicesConfirmed not yet stamped), a
                lead website is available, and the site isn't live/claimed. */}
            {scanContext?.website
              && !site.content?.servicesConfirmed
              && site.status !== "claimed"
              && site.status !== "published" && (
              <div className="flex flex-col gap-2 rounded-lg border border-violet-500/20 bg-violet-500/5 p-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  These are starter examples. Scan the shop's website to pull in their real services &amp; prices — you review before anything replaces the list.
                </p>
                <ServiceScanButton
                  context={scanContext}
                  onApply={(svcs) => {
                    setServices(svcs.map((s) => ({ name: s.name, price: s.price, durationMins: s.durationMins })));
                    servicesTouched.current = true;
                    setTextDirty(true);
                  }}
                />
              </div>
            )}
            {services.length === 0 && (
              <p className="text-sm text-muted-foreground">No services yet — add the shop's real menu below.</p>
            )}
            {services.map((s, i) => (
              <div key={i} className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <div className="flex-1 space-y-2">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_120px_130px]">
                      <Input value={s.name} placeholder="Service name" onChange={(e) => updateService(i, "name", e.target.value)} />
                      <Input value={s.price ?? ""} placeholder="Price (optional)" onChange={(e) => updateService(i, "price", e.target.value)} />
                      <Select
                        value={String(s.durationMins ?? DEFAULT_DURATION)}
                        onValueChange={(v) => updateServiceDuration(i, Number(v))}
                      >
                        <SelectTrigger aria-label="Appointment length">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DURATION_OPTIONS.map((m) => (
                            <SelectItem key={m} value={String(m)}>{m} min</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Input value={s.description ?? ""} placeholder="Description (optional)" onChange={(e) => updateService(i, "description", e.target.value)} />
                  </div>
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" title="Remove service" onClick={() => removeService(i)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addService}>
              <Plus className="h-4 w-4 mr-2" /> Add service
            </Button>
            <p className="text-xs text-muted-foreground">
              Enter the shop's real services and prices. Leave a price blank to show "Price on request" (or an example, below).
              Nothing is auto-generated. Duration is how long each appointment takes — it sizes the slots once online booking is on.
            </p>
          </div>

          <div className="space-y-4 border-t border-border pt-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label>Show example prices</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Services without a confirmed price show an illustrative <span className="font-medium">example</span> price
                  (clearly labelled) instead of "Price on request". Confirmed prices are never relabelled.
                </p>
              </div>
              <Switch checked={showExamplePrices} onCheckedChange={(v) => { setShowExamplePrices(v); setTextDirty(true); }} />
            </div>

            <div className="space-y-1.5">
              <Label>Google reviews / Maps URL</Label>
              <Input
                value={googleReviewsUrl}
                placeholder="https://maps.google.com/…"
                onChange={(e) => { setGoogleReviewsUrl(e.target.value); setTextDirty(true); }}
              />
              <p className="text-xs text-muted-foreground">
                Adds a "Read our Google reviews" link (with the Google logo) by the rating. Leave blank to hide it.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contact & opening hours */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Contact &amp; opening hours</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={phone} placeholder="020 7946 0123" onChange={(e) => { setPhone(e.target.value); setTextDirty(true); }} />
          </div>
          <div className="space-y-1.5">
            <Label>Address</Label>
            <Input value={address} placeholder="123 High Street, Town" onChange={(e) => { setAddress(e.target.value); setTextDirty(true); }} />
            <p className="text-xs text-muted-foreground">Used for the contact section and the embedded map.</p>
          </div>

          <div className="space-y-3 border-t border-border pt-4">
            <Label>Opening hours</Label>
            {hours.length === 0 && (
              <p className="text-sm text-muted-foreground">No hours yet — add a day below.</p>
            )}
            {hours.map((h, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input className="sm:max-w-[150px]" value={h.day} placeholder="Day" onChange={(e) => updateHour(i, "day", e.target.value)} />
                <Input value={h.open} placeholder="Hours (e.g. 9:00 – 18:00, or Closed)" onChange={(e) => updateHour(i, "open", e.target.value)} />
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" title="Remove day" onClick={() => removeHour(i)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addHour}>
              <Plus className="h-4 w-4 mr-2" /> Add day
            </Button>
            <p className="text-xs text-muted-foreground">
              Shown in the site's opening-hours section. Any format, e.g. "9:00 – 18:00" or "Closed".
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Accent colour */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Accent colour</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            The highlight colour used across your site — buttons, headings and links.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {ACCENT_PRESETS.map((p) => {
              const selected = (accentColor ?? AMBER_HEX).toLowerCase() === p.hex.toLowerCase();
              return (
                <button
                  key={p.hex}
                  type="button"
                  title={p.name}
                  aria-label={p.name}
                  aria-pressed={selected}
                  onClick={() => {
                    setAccentColor(p.hex === AMBER_HEX ? undefined : p.hex);
                    setTextDirty(true);
                  }}
                  className={`h-9 w-9 rounded-full ring-2 ring-offset-2 ring-offset-background transition ${
                    selected ? "ring-foreground scale-110" : "ring-transparent hover:scale-105"
                  }`}
                  style={{ backgroundColor: p.hex }}
                />
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            {ACCENT_PRESETS.find((p) => p.hex.toLowerCase() === (accentColor ?? AMBER_HEX).toLowerCase())?.name ?? "Amber"}
          </p>
        </CardContent>
      </Card>

      {/* Social links — manual, SITE-only. Override auto-discovery; blank = no icon. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Social links</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Shown as Facebook/Instagram icons in your site's header &amp; footer. Leave a field blank to show no icon.
            These override anything auto-discovery added to the site.
          </p>
          {/* On-demand FULL web-results social discovery. Fills EMPTY fields only with
              confident (location-matched) results, then auto-saves. Needs a linked lead. */}
          {scanContext?.leadId && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleEnrichSocials} disabled={enrichingSocials || saving}>
                {enrichingSocials ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Enrich socials
              </Button>
              <span className="text-xs text-muted-foreground">Finds Facebook/Instagram from Google — fills empty fields only.</span>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Facebook URL</Label>
            <Input
              value={facebookUrl}
              placeholder="https://facebook.com/yourpage"
              onChange={(e) => { setFacebookUrl(e.target.value); setTextDirty(true); }}
            />
            {facebookUrl.trim() && !/facebook\.com/i.test(facebookUrl) && (
              <p className="text-xs text-amber-500">Doesn't look like a facebook.com URL — it'll still be saved.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Instagram URL</Label>
            <Input
              value={instagramUrl}
              placeholder="https://instagram.com/yourhandle"
              onChange={(e) => { setInstagramUrl(e.target.value); setTextDirty(true); }}
            />
            {instagramUrl.trim() && !/instagram\.com/i.test(instagramUrl) && (
              <p className="text-xs text-amber-500">Doesn't look like an instagram.com URL — it'll still be saved.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Photos & logo — drag pool photos or upload your own, plus the logo. One
          merged section (replaces the old separate "Upload images & logo" card). */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Photos &amp; logo</CardTitle>
        </CardHeader>
        <CardContent>
          <SiteImagePicker
            ref={pickerRef}
            key={`picker-${site.id}`}
            siteId={site.id}
            template={site.template}
            content={site.content}
            onDirtyChange={() => setPickerDirty(true)}
          />
        </CardContent>
      </Card>

      {children}

      {/* Single save bar — saves text + prices + reviews + toggle + images at once */}
      <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-xl border border-border bg-background/95 px-4 py-3 backdrop-blur">
        <span className={`text-sm ${anyDirty ? "text-amber-500" : "text-muted-foreground"}`}>
          {anyDirty ? "You have unsaved changes" : "All changes saved"}
        </span>
        <Button onClick={() => handleSave()} disabled={saving || !anyDirty}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save all changes
        </Button>
      </div>
    </>
  );
}
