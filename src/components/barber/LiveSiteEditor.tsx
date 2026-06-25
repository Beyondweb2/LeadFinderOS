import { useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Check, Globe, EyeOff, X, PencilLine, Palette } from "lucide-react";
import { BarberSiteTemplate } from "@/templates/barber/BarberSiteTemplate";
import type { BarberSiteContent } from "@/templates/barber/types";
import { BARBER_ACCENTS } from "@/config/barberAccents";
import type { OwnedSite } from "@/components/barber/BarberShell";
import { useToast } from "@/hooks/use-toast";

/**
 * Live tap-to-edit editor (Phase 0 + 1).
 *
 * Renders the REAL BarberSiteTemplate full-screen in `editable` mode. Tapping a
 * marked element opens a bottom sheet with just that element's control; typing
 * updates `liveContent` so the site re-renders live behind the sheet; changes
 * autosave to generated_sites.content (the same path the classic form uses).
 *
 * The global bar handles site-wide things: colour theme, Publish/Unpublish, Done.
 * Phase 1 wires TEXT elements (headline / tagline / about / business name) — adding
 * more element types later = adding a registry entry + an EditableText wrapper in
 * the template, not rework.
 */

type ElementDef = {
  label: string;
  render: (content: BarberSiteContent, patch: (next: Partial<BarberSiteContent>) => void) => ReactNode;
};

function TextControl({
  value,
  onChange,
  multiline = false,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  const cls =
    "w-full rounded-lg border border-line bg-ink-soft px-3 py-2 text-white placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/60";
  return multiline ? (
    <textarea
      autoFocus
      rows={5}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`${cls} resize-none leading-relaxed`}
    />
  ) : (
    <Input autoFocus value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={cls} />
  );
}

// elementKey → { label, control }. Phase 1: top-level text fields.
const ELEMENTS: Record<string, ElementDef> = {
  businessName: {
    label: "Business name",
    render: (c, patch) => <TextControl value={c.businessName ?? ""} onChange={(v) => patch({ businessName: v })} />,
  },
  heroHeadline: {
    label: "Headline",
    render: (c, patch) => <TextControl value={c.heroHeadline ?? ""} onChange={(v) => patch({ heroHeadline: v })} />,
  },
  tagline: {
    label: "Tagline",
    render: (c, patch) => <TextControl multiline value={c.tagline ?? ""} onChange={(v) => patch({ tagline: v })} />,
  },
  about: {
    label: "About — your story",
    render: (c, patch) => <TextControl multiline value={c.about ?? ""} onChange={(v) => patch({ about: v })} />,
  },
};

export function LiveSiteEditor({
  site,
  onContentSaved,
  onExit,
  published,
  onTogglePublish,
  savingStatus,
  onUseClassic,
}: {
  site: OwnedSite;
  onContentSaved?: (content: BarberSiteContent) => void;
  onExit: () => void;
  published: boolean;
  onTogglePublish: () => void;
  savingStatus: boolean;
  onUseClassic: () => void;
}) {
  const { toast } = useToast();
  const [liveContent, setLiveContent] = useState<BarberSiteContent>(site.content);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const firstRun = useRef(true);

  const patch = (next: Partial<BarberSiteContent>) => setLiveContent((c) => ({ ...c, ...next }));

  // Debounced autosave: every liveContent change persists to generated_sites.content
  // (owner-RLS; content is not a protected field). Last-write-wins — fine for one
  // barber editing their own site.
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    setSaveState("saving");
    const t = setTimeout(async () => {
      const { error } = await (supabase as unknown as SupabaseClient)
        .from("generated_sites")
        .update({ content: liveContent })
        .eq("id", site.id);
      if (error) {
        setSaveState("idle");
        toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
        return;
      }
      onContentSaved?.(liveContent);
      setSaveState("saved");
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveContent]);

  const currentAccent = (liveContent.accentColor ?? BARBER_ACCENTS[0].hex).toLowerCase();
  const active = activeKey ? ELEMENTS[activeKey] : null;

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-ink">
      {/* The real site, live + full-bleed, in edit mode. No onEditImage yet (Phase 2). */}
      <BarberSiteTemplate
        content={liveContent}
        bookingEnabled={false}
        editable
        onEditElement={(key) => setActiveKey(key)}
      />

      {/* ── GLOBAL BAR (site-wide controls) ─────────────────────────────────── */}
      <div className="fixed inset-x-0 bottom-0 z-[55] border-t-2 border-white/15 bg-ink/95 px-3 py-2.5 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-4">
          {/* Colour theme — palette icon + evenly spaced swatches (palette from the
              pre-claim dock). Centres on its own row on mobile, left-aligns inline on
              desktop; no overflow scroll stub. */}
          <div className="flex items-center justify-center gap-2.5 sm:justify-start">
            <Palette className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
            <div className="flex items-center gap-2">
              {BARBER_ACCENTS.map((a) => {
                const selected = a.hex.toLowerCase() === currentAccent;
                return (
                  <button
                    key={a.hex}
                    type="button"
                    title={a.name}
                    aria-label={a.name}
                    aria-pressed={selected}
                    onClick={() => patch({ accentColor: a.hex })}
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ring-2 ring-offset-2 ring-offset-ink transition-transform ${
                      selected ? "scale-110 ring-white" : "ring-white/15 hover:scale-105 hover:ring-white/40"
                    }`}
                    style={{ backgroundColor: a.hex }}
                  >
                    {selected && <Check className="h-3.5 w-3.5 text-ink" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 sm:ml-auto">
            {/* Save status */}
            <span className="hidden text-xs text-zinc-400 sm:inline">
              {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : ""}
            </span>
            <button
              type="button"
              onClick={onUseClassic}
              className="hidden text-xs text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline sm:inline"
            >
              Classic editor
            </button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onTogglePublish}
              disabled={savingStatus}
              className="rounded-full border-line bg-white/[0.03] text-zinc-200 hover:border-amber/50 hover:text-white"
            >
              {savingStatus ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : published ? <EyeOff className="h-4 w-4 mr-1.5" /> : <Globe className="h-4 w-4 mr-1.5" />}
              {published ? "Unpublish" : "Publish"}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={onExit}
              className="rounded-full bg-amber font-bold text-ink hover:bg-amber-soft"
            >
              Done
            </Button>
          </div>
        </div>
      </div>

      {/* ── BOTTOM SHEET (per-element editor) ───────────────────────────────── */}
      {active && (
        <div className="fixed inset-x-0 bottom-0 z-[60] rounded-t-2xl border-t-2 border-amber/30 bg-ink-card px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.85)]">
          <div className="mx-auto max-w-md">
            <div className="mb-3 flex items-center justify-between">
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-white">
                <PencilLine className="h-4 w-4 text-amber" /> {active.label}
              </div>
              <button
                type="button"
                onClick={() => setActiveKey(null)}
                aria-label="Close"
                className="rounded-full p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {active.render(liveContent, patch)}
            <Button
              type="button"
              onClick={() => setActiveKey(null)}
              className="mt-4 w-full rounded-full bg-amber font-bold text-ink hover:bg-amber-soft"
            >
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
