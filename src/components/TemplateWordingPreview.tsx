import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { WHATSAPP_TEMPLATES } from '@/types/outreach';
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from '@/components/ui/tooltip';
import { templatePreviewText, type PreviewValues } from '@/lib/templatePreview';
import { cn } from '@/lib/utils';

/* THE WORDING OF AN APPROVED TEMPLATE — ONE BEHAVIOUR FOR EVERY PICKER (UI cleanup pass, 2026-09-29).
   ⛔ NO HOVER PREVIEW. Paul: "I do not want a large message card opening simply because my mouse
   passes over a template." The hover box (useTemplateHover / TemplateWordingInList) is gone, twice
   tried and twice in the way. Now, in the Inbox, the lead's WhatsApp card and Outreach's bulk queue:
     · the list is names only — moving the pointer through it changes nothing on screen;
     · choosing a template selects it, and ONE line of its wording shows under the picker;
     · the full wording shows only when the person presses Preview (the Inbox's Preview is the real
       dry run of the send; elsewhere TemplatePreviewButton shows the wording in place).
   INBOX, 2026-11-03 (Paul): the Inbox's Preview button and one-line snippet are gone. It has an eye on each row and beside the chosen
   template (TemplateEye). The rule above still holds: passing over a row opens nothing; only the eye itself does. */

const stop = (e: SyntheticEvent) => e.stopPropagation();

/* Radix focuses a row when the pointer passes over it too, and that must open nothing. So a row's eye opens on focus only when the last
   thing the person did was press a key. */
let lastInputWasKey = false;
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', () => { lastInputWasKey = true; }, true);
  for (const ev of ['pointermove', 'pointerdown']) window.addEventListener(ev, () => { lastInputWasKey = false; }, true);
}

/** The eye: the template's full wording in a tooltip, on hover, tap or keyboard focus. No click needed. On a row of a picker it never
 *  selects the row (Radix selects on pointer up, or click on touch). The Select keeps Tab to itself, so a row's eye opens when arrow keys
 *  reach that row; the eye beside the chosen template (`selected`) is an ordinary tab stop. */
export function TemplateEye({ label, getText, selected = false }: { label: string; getText: () => string | null; selected?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const row = ref.current?.closest('[role="option"]');
    if (!row) return;
    /* After the list has scrolled the row into view: a scroll closes a Radix tooltip. */
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onFocus = () => { if (lastInputWasKey) timer = setTimeout(() => setOpen(true), 120); };
    const onBlur = () => { clearTimeout(timer); setOpen(false); };
    row.addEventListener('focus', onFocus);
    row.addEventListener('blur', onBlur);
    return () => { clearTimeout(timer); row.removeEventListener('focus', onFocus); row.removeEventListener('blur', onBlur); };
  }, []);
  return (
    <Tooltip open={open} onOpenChange={setOpen} delayDuration={150} disableHoverableContent>
      <TooltipTrigger asChild>
        <button ref={ref} type="button" tabIndex={selected ? 0 : -1} aria-label={`Show the wording of ${label}`}
          data-testid={selected ? 'template-eye-selected' : 'template-eye'}
          className={cn('pointer-events-auto inline-flex shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', selected ? 'h-9 w-9' : 'h-6 w-6')}
          /* preventDefault keeps Radix's own close-on-press off; a tap toggles, because touch has no hover. */
          onPointerDown={(e) => { stop(e); e.preventDefault(); }}
          onPointerUp={stop}
          onClick={(e) => {
            stop(e);
            e.preventDefault();
            const touch = (e.nativeEvent as PointerEvent).pointerType === 'touch';
            setOpen((o) => (touch ? !o : true));
          }}
        >
          <Eye className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      {/* In a portal: inside the Select's list it would be clipped by the list's edge. */}
      <TooltipPortal>
        <TooltipContent side="left" collisionPadding={8} className="max-w-sm whitespace-pre-wrap text-xs leading-relaxed" data-testid="template-eye-tip">
          {open && (getText() ?? "The wording of this template isn't stored in the app.")}
        </TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
}

/** One line of the chosen template's wording, truncated. Nothing chosen → nothing. */
export function TemplateSnippet({ selected, values, className }: { selected: string | null | undefined; values?: PreviewValues; className?: string }) {
  if (!selected) return null;
  const text = templatePreviewText(selected, values);
  if (!text) return null;
  const line = text.replace(/\s+/g, ' ').trim();
  return <p className={cn('truncate text-[11px] text-muted-foreground', className)} title={line} data-testid="template-snippet">“{line}”</p>;
}

/** The full wording, drawn only when asked for. */
export function TemplateWordingPreview({ selected, values, className }: {
  selected: string | null | undefined;
  values?: PreviewValues;
  className?: string;
}) {
  const name = selected ?? null;
  if (!name) return null;
  const text = templatePreviewText(name, values);
  const label = WHATSAPP_TEMPLATES.find((t) => t.value === name)?.label ?? name;
  return (
    <div className={cn('rounded-md border border-green-500/30 bg-green-500/5 p-2.5', className)} data-testid="template-wording-preview" aria-live="polite">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Preview: {label}</p>
      {text ? (
        <p className="max-h-48 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-foreground/90">{text}</p>
      ) : (
        <p className="text-xs italic text-muted-foreground">The wording of this template isn't stored in the app, so it can't be previewed here.</p>
      )}
      {text && <p className="mt-1.5 text-[10px] text-muted-foreground/70">Sample details shown where the message fills something in.</p>}
    </div>
  );
}

/** The explicit Preview action for a picker with no dry run: a button that shows / hides the full
 *  wording in place, under the picker. Closed by default; choosing another template keeps it as set. */
export function TemplatePreviewButton({ selected, values, className }: { selected: string | null | undefined; values?: PreviewValues; className?: string }) {
  const [open, setOpen] = useState(false);
  if (!selected) return null;
  return (
    <div className={className}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} data-testid="template-preview-toggle"
        className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">
        {open ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}{open ? 'Hide preview' : 'Preview'}
      </button>
      {open && <TemplateWordingPreview className="mt-1.5" selected={selected} values={values} />}
    </div>
  );
}
