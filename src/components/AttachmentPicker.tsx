import { memo, useEffect, useRef, useState } from 'react';
import { FileText, Film, Loader2, Paperclip, RefreshCw, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ATTACHMENT_ACCEPT, ATTACHMENT_CAPTION_MAX, attachmentErrorMessage, classifyAttachment, formatAttachmentSize, type AttachmentKind,
} from '@/lib/mediaAttachment';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE PAPERCLIP BESIDE THE REPLY BOX (2026-09-27). Pick → preview → caption → Send, Remove or Change.

   ⛔ PICKING NEVER SENDS. The file is only staged; Send is a separate, explicit press.
   ⛔ ONLY MOUNTED WHILE THE 24-HOUR WINDOW IS OPEN (the parent renders it in the open-window branch
   only), and send-whatsapp-media re-checks the window, the lead and the file at send time.
   ⛔ THE PARENT KEYS THIS BY CONVERSATION, so switching thread unmounts it and drops a staged file —
   a file can never be sent into a different conversation from the one it was picked in.
   ⛔ While a file is staged the parent HIDES the text box and the mic (still mounted, so the typed
   draft is untouched), the same way the voice recorder takes the row.
   The type and size check here is for a quick answer only; the server decides.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export interface AttachmentPickerProps {
  /** A text or voice send is in flight — do not stage over it. */
  disabled?: boolean;
  /** True while a file is staged (the picker needs the composer's row). */
  onActiveChange: (active: boolean) => void;
  /** Send this file to THIS conversation. Resolves ok only when the server confirmed the send. */
  onSend: (file: File, caption: string, sendId: string) => Promise<{ ok: boolean; error?: string; reason?: string; retryable?: boolean }>;
}

interface Staged { file: File; kind: AttachmentKind; label: string; url: string | null; sendId: string }

export const AttachmentPicker = memo(function AttachmentPicker({ disabled, onActiveChange, onSend }: AttachmentPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [staged, setStaged] = useState<Staged | null>(null);
  const [caption, setCaption] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<{ text: string; retryable: boolean } | null>(null);

  const onActiveRef = useRef(onActiveChange);
  onActiveRef.current = onActiveChange;
  const active = !!staged || !!error;
  useEffect(() => { onActiveRef.current(active); }, [active]);
  useEffect(() => () => onActiveRef.current(false), []);
  /* The preview URL lives exactly as long as its staged file. */
  useEffect(() => () => { if (staged?.url) URL.revokeObjectURL(staged.url); }, [staged]);

  const clear = () => { setStaged(null); setCaption(''); setError(null); if (inputRef.current) inputRef.current.value = ''; };

  const pick = (file: File | null | undefined) => {
    if (inputRef.current) inputRef.current.value = '';
    if (!file) return;
    const c = classifyAttachment(file.name, file.size);
    if ('error' in c) { setStaged(null); setError({ text: attachmentErrorMessage(c.error, null, c.kind), retryable: false }); return; }
    setError(null);
    setStaged({
      file, kind: c.kind, label: c.label,
      url: c.kind === 'document' ? null : URL.createObjectURL(file),
      /* One id per staged file: a retry of the SAME file reuses it, so the server's claim refuses a
         second delivery. Choosing a different file gets a new one. */
      sendId: crypto.randomUUID(),
    });
  };

  const send = async () => {
    if (!staged || sending) return;
    setSending(true);
    setError(null);
    const res = await onSend(staged.file, caption.trim(), staged.sendId);
    setSending(false);
    if (res.ok) { clear(); return; }
    setError({ text: attachmentErrorMessage(res.error, res.reason, staged.kind), retryable: res.retryable !== false });
  };

  const fileInput = (
    <input ref={inputRef} type="file" accept={ATTACHMENT_ACCEPT} className="hidden" aria-hidden="true" tabIndex={-1}
      onChange={(e) => pick(e.target.files?.[0])} />
  );

  if (!staged && !error) {
    return (
      <>
        {fileInput}
        <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0" disabled={disabled}
          onClick={() => inputRef.current?.click()} aria-label="Attach a file" title="Attach an image, video or document">
          <Paperclip className="h-4 w-4" />
        </Button>
      </>
    );
  }

  if (!staged) {
    /* A file that was refused on picking: say why, offer another pick. */
    return (
      <div className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-2" role="alert">
        {fileInput}
        <p className="min-w-0 flex-1 text-xs text-destructive">{error?.text}</p>
        <Button type="button" variant="ghost" size="sm" className="h-9 px-2" onClick={() => inputRef.current?.click()}>Choose another</Button>
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={clear} aria-label="Dismiss"><X className="h-4 w-4" /></Button>
      </div>
    );
  }

  return (
    <div className="min-w-0 flex-1 space-y-1">
      {fileInput}
      <div className="flex min-h-[44px] min-w-0 items-center gap-2 rounded-md border border-border bg-muted/40 p-1.5" role="group" aria-label="File ready to send">
        {staged.kind === 'image' && staged.url
          ? <img src={staged.url} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
          : staged.kind === 'video' && staged.url
            ? <video src={staged.url} muted className="h-12 w-16 shrink-0 rounded bg-black object-cover" aria-label="Video preview" />
            : <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-background"><FileText className="h-5 w-5 text-muted-foreground" /></span>}
        <div className="min-w-0 flex-1 space-y-1">
          <p className="flex min-w-0 items-center gap-1 text-xs">
            {staged.kind === 'video' && <Film className="h-3 w-3 shrink-0 text-muted-foreground" />}
            <span className="truncate font-medium" title={staged.file.name}>{staged.file.name}</span>
            <span className="shrink-0 text-muted-foreground">· {staged.label} · {formatAttachmentSize(staged.file.size)}</span>
          </p>
          {/* Meta takes a caption on all three kinds this picker offers. */}
          <Input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={ATTACHMENT_CAPTION_MAX} disabled={sending}
            placeholder="Add a caption (optional)" className="h-7 text-xs" aria-label="Caption"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void send(); } }} />
        </div>
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => inputRef.current?.click()} disabled={sending} aria-label="Change file" title="Change file">
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={clear} disabled={sending} aria-label="Remove file" title="Remove">
          <X className="h-4 w-4" />
        </Button>
        <Button type="button" size="sm" className="h-9 shrink-0 px-3" onClick={() => void send()} disabled={sending || (!!error && !error.retryable)} aria-label="Send file">
          {sending ? <Loader2 className="h-4 w-4 animate-spin sm:mr-1" /> : <Send className="h-4 w-4 sm:mr-1" />}
          <span className="hidden sm:inline">{sending ? 'Sending…' : error ? 'Retry' : 'Send'}</span>
        </Button>
      </div>
      {sending && <p className="text-[11px] text-muted-foreground" role="status">Sending file…</p>}
      {error && <p className="text-[11px] text-destructive" role="alert">{error.text}</p>}
    </div>
  );
});
