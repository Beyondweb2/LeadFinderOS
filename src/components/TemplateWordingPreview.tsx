import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { WHATSAPP_TEMPLATES } from '@/types/outreach';
import { templatePreviewText, type PreviewValues } from '@/lib/templatePreview';
import { cn } from '@/lib/utils';

/* THE WORDING OF AN APPROVED TEMPLATE — ONE BEHAVIOUR FOR EVERY PICKER (UI cleanup pass, 2026-09-29).
   ⛔ NO HOVER PREVIEW. Paul: "I do not want a large message card opening simply because my mouse
   passes over a template." The hover box (useTemplateHover / TemplateWordingInList) is gone, twice
   tried and twice in the way. Now, in the Inbox, the lead's WhatsApp card and Outreach's bulk queue:
     · the list is names only — moving the pointer through it changes nothing on screen;
     · choosing a template selects it, and ONE line of its wording shows under the picker;
     · the full wording shows only when the person presses Preview (the Inbox's Preview is the real
       dry run of the send; elsewhere TemplatePreviewButton shows the wording in place). */

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
