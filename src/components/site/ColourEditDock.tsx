import { Check, Loader2 } from 'lucide-react';
import { BARBER_ACCENTS, BARBER_ACCENT_DEFAULT_HEX } from '@/config/barberAccents';

/**
 * Pre-sign-in editor dock for /s/:token (Phase 2: colour only). Mobile-first,
 * fixed to the bottom. Tapping a swatch re-colours the site instantly (the parent
 * overrides content.accentColor + holds it in localStorage); "Keep this site"
 * starts the claim/sign-in so the choice is saved on claim. Replaces the template's
 * claim bar on /s/ so editing + keeping live in one place.
 */
interface ColourEditDockProps {
  /** Currently-applied accent hex (null = default amber). */
  value: string | null;
  /** Pick a colour. null when the default amber is chosen. */
  onChange: (hex: string | null) => void;
  /** Start the claim/sign-in flow ("keep it"). */
  onKeep: () => void;
  keeping?: boolean;
}

export function ColourEditDock({ value, onChange, onKeep, keeping = false }: ColourEditDockProps) {
  const current = value ?? BARBER_ACCENT_DEFAULT_HEX;
  return (
    <div className="pointer-events-auto fixed inset-x-0 bottom-0 z-[60] border-t-2 border-white/15 bg-ink/95 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+2rem)] shadow-[0_-10px_40px_-12px_rgba(0,0,0,0.85)] backdrop-blur-xl sm:pb-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent"
      />
      <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
        <div className="min-w-0 flex-1">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-300">
            Make it yours — tap a photo to swap it, or pick a colour
          </div>
          <div className="flex items-center gap-2.5 overflow-x-auto pb-0.5">
            {BARBER_ACCENTS.map((a) => {
              const isDefault = a.hex.toLowerCase() === BARBER_ACCENT_DEFAULT_HEX.toLowerCase();
              const selected = current.toLowerCase() === a.hex.toLowerCase();
              return (
                <button
                  key={a.hex}
                  type="button"
                  aria-label={a.name}
                  aria-pressed={selected}
                  title={a.name}
                  onClick={() => onChange(isDefault ? null : a.hex)}
                  className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-full ring-2 ring-offset-2 ring-offset-ink transition-transform ${
                    selected ? 'scale-110 ring-white' : 'ring-transparent hover:scale-105'
                  }`}
                  style={{ backgroundColor: a.hex }}
                >
                  {selected && <Check className="h-4 w-4 text-ink" />}
                </button>
              );
            })}
          </div>
        </div>
        <button
          type="button"
          onClick={onKeep}
          disabled={keeping}
          className="relative inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-white px-7 py-3 text-sm font-bold text-ink shadow-[0_6px_28px_-6px_rgba(255,255,255,0.45)] transition-all hover:-translate-y-0.5 hover:bg-zinc-100 active:scale-[0.98] disabled:opacity-70 sm:px-9 sm:py-3.5 sm:text-base"
        >
          {keeping && <Loader2 className="h-4 w-4 animate-spin" />}
          Keep this site
        </button>
      </div>
    </div>
  );
}
