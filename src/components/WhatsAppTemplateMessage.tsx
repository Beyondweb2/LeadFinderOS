import { FileText, Image as ImageIcon, Phone, Video } from 'lucide-react';
import type { WhatsAppTemplateSnapshot } from '@/lib/whatsappTemplateSnapshot';

function Body({ body }: { body: string }) {
  return <div className="space-y-2 whitespace-pre-wrap break-words leading-relaxed">{body.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>;
}

/** A presentation-only replay of a resolved Meta template. It intentionally has no send actions. */
export function WhatsAppTemplateMessage({ snapshot }: { snapshot: WhatsAppTemplateSnapshot }) {
  const header = snapshot.header;
  return (
    <div className="min-w-0 space-y-2">
      {header?.type === 'text' && <p className="font-semibold whitespace-pre-wrap">{header.text}</p>}
      {header?.type === 'image' && (header.media_url ? <img src={header.media_url} alt="Template header" className="max-h-52 w-full rounded-md object-cover" /> : <div className="flex items-center gap-2 rounded-md bg-black/10 p-2"><ImageIcon className="h-4 w-4" />Image header</div>)}
      {header?.type === 'video' && (header.media_url ? <video controls preload="metadata" className="max-h-52 w-full rounded-md"><source src={header.media_url} /></video> : <div className="flex items-center gap-2 rounded-md bg-black/10 p-2"><Video className="h-4 w-4" />Video header</div>)}
      {header?.type === 'document' && <div className="flex items-center gap-2 rounded-md bg-black/10 p-2"><FileText className="h-4 w-4" /><span className="truncate">{header.filename || 'Document header'}</span></div>}
      <Body body={snapshot.body} />
      {snapshot.footer && <p className="text-[11px] opacity-65 whitespace-pre-wrap">{snapshot.footer}</p>}
      {!!snapshot.buttons?.length && <div className="space-y-1 border-t border-current/15 pt-2">{snapshot.buttons.map((button, index) => <div key={`${button.type}-${index}`} aria-disabled="true" className="flex items-center justify-center gap-1 rounded-md border border-current/15 px-2 py-1.5 text-xs font-medium opacity-90">{button.type === 'phone' && <Phone className="h-3 w-3" />}{button.text}</div>)}</div>}
    </div>
  );
}
