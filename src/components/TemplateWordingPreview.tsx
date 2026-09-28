import { useState } from 'react';
import { WHATSAPP_TEMPLATES } from '@/types/outreach';
import { templatePreviewText, type PreviewValues } from '@/lib/templatePreview';
import { cn } from '@/lib/utils';

/* The wording of the template being hovered in a picker (or, when nothing is hovered, the one
   chosen). Every approved-template picker uses this with useTemplateHover. */

/** Track the option under the pointer. Radix Select focuses an item as the pointer moves over it,
 *  so `onFocus` on each SelectItem is the hover signal; closing the list clears it. */
export function useTemplateHover() {
  const [hovered, setHovered] = useState<string | null>(null);
  return {
    hovered,
    itemProps: (value: string) => ({ onFocus: () => setHovered(value), onPointerEnter: () => setHovered(value) }),
    onOpenChange: (open: boolean) => { if (!open) setHovered(null); },
  };
}

/** Inside the open list, pinned to its bottom: the list covers anything drawn under the picker
 *  (measured: the box sat under the list), so the hovered wording has to live IN the list. Not an
 *  item — keyboard and pointer selection are unaffected. */
export function TemplateWordingInList({ hovered, values }: { hovered: string | null; values?: PreviewValues }) {
  if (!hovered) return null;
  return (
    <div className="sticky bottom-0 z-10 border-t border-border bg-popover p-1.5" onPointerDown={(e) => e.preventDefault()}>
      <TemplateWordingPreview hovered={hovered} selected={null} values={values} className="max-w-md" />
    </div>
  );
}

export function TemplateWordingPreview({ hovered, selected, values, className }: {
  hovered: string | null;
  selected: string | null | undefined;
  values?: PreviewValues;
  className?: string;
}) {
  const name = hovered ?? selected ?? null;
  if (!name) return null;
  const text = templatePreviewText(name, values);
  const label = WHATSAPP_TEMPLATES.find((t) => t.value === name)?.label ?? name;
  return (
    <div className={cn('rounded-md border border-green-500/30 bg-green-500/5 p-2.5', className)} data-testid="template-wording-preview" aria-live="polite">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {hovered && hovered !== selected ? 'Hovering' : 'Selected'}: {label}
      </p>
      {text ? (
        <p className="max-h-48 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-foreground/90">{text}</p>
      ) : (
        <p className="text-xs italic text-muted-foreground">The wording of this template isn't stored in the app, so it can't be previewed here.</p>
      )}
      {text && <p className="mt-1.5 text-[10px] text-muted-foreground/70">Sample details shown where the message fills something in.</p>}
    </div>
  );
}
