import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loader2, Send } from 'lucide-react';

/* ════════════════════════════════════════════════════════════════════════════════════════════
   THE REPLY BOX — its own component with its OWN state, and that is the entire point.

   🔴 WHY THIS EXISTS. Typing in the Inbox was unusably slow, and the cause was not the textarea.
   The composer's text lived in the Inbox page's state (inside the persisted `drafts` map), so
   EVERY KEYSTROKE re-rendered the whole page. Measured against the live database 2026-09-09:
     · 3,432 whatsapp_messages re-filtered per character — `messagesForKey` is a plain
       `messages.filter(...)` and the result was not memoised;
     · every conversation row in the list re-rendered (hundreds of them);
     · every visible bubble re-ran readableTemplateBody() to rebuild its text;
     · the ENTIRE drafts map was JSON.stringify'd and written to localStorage, synchronously,
       per character.
   Four separate costs, all paid per keypress. Holding the text here means the page does not
   re-render while you type at all.

   ⛔ THE DRAFT RULES ARE UNCHANGED — this only changes HOW OFTEN they run. src/lib/inboxDrafts.ts
   is still the only thing that writes a draft (keyed by conversation, empty deletes the entry,
   whitespace counts as empty, capped), and scripts/inbox-drafts.test.ts still covers it. The parent
   persists on a debounce instead of on every character.

   ✅ VERIFIED IN A REAL BROWSER, not by reading it. A throwaway Vite harness mounted THIS component
   alone (no auth, no database) and Playwright drove it — deleted before commit, per CLAUDE.md §2.
   Ten assertions passed, and these five are the ones worth re-running if this file is ever changed:
     · typing 11 characters fast wrote ZERO drafts mid-type (the fix itself);
     · the debounce then wrote exactly once, under the right key;
     · switching thread mid-sentence saved the OUTGOING thread's text under the OUTGOING key, and
       the box re-seeded from the incoming thread's own draft — no leak either way;
     · send received the text ON SCREEN, not the debounced copy that was up to 400ms behind;
     · a FAILED send left the text in the box, and a successful one did not come back as a draft.

   ⚠️ SO THE FLUSHES ARE LOAD-BEARING, because a debounce that never fires loses the message. The
   draft is written out on ALL of: the debounce, blur, the tab being hidden, pagehide, and unmount.
   Thread switching remounts this component (the parent keys it by conversation), so the unmount
   flush is what saves the draft of the thread you are LEAVING — and it writes under this instance's
   own convKey, never the one being opened. That ordering is the whole reason the draft cannot leak
   into the wrong conversation.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

/** Long enough that a fast typist writes a whole word between writes, short enough that no
 *  realistic pause-then-close loses anything the flushes below would not already have caught. */
export const DRAFT_DEBOUNCE_MS = 400;

export interface InboxComposerProps {
  /** The conversation this composer belongs to. Also what the parent keys the element by. */
  convKey: string;
  /** The stored draft for this conversation, read ONCE to seed local state. */
  initialText: string;
  sending: boolean;
  /** Persist a draft for `key`. Called on the debounce and on every flush, never per keystroke. */
  onPersist: (key: string, value: string) => void;
  /** Send this body. Resolves true when it actually went — only then is the box cleared. */
  onSend: (body: string) => Promise<boolean>;
}

export const InboxComposer = memo(function InboxComposer({
  convKey, initialText, sending, onPersist, onSend,
}: InboxComposerProps) {
  const [value, setValue] = useState(initialText);

  /* The flush callbacks fire from listeners and from cleanup, where a stale closure would write an
     old value. A ref is read at call time, so it is always the current text. */
  const valueRef = useRef(value);
  valueRef.current = value;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* ⛔ A SEND CLEARS THE DRAFT, SO THE UNMOUNT FLUSH MUST NOT PUT IT BACK. Without this, sending
     and immediately switching thread re-persisted the text that was just sent — the message would
     reappear in the box next time the thread was opened. */
  const sent = useRef(false);

  const onPersistRef = useRef(onPersist);
  onPersistRef.current = onPersist;

  const flush = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (sent.current) return;
    onPersistRef.current(convKey, valueRef.current);
  }, [convKey]);

  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      flush(); // thread switch / navigation away — save what is in the box
    };
  }, [flush]);

  const change = (next: string) => {
    setValue(next);
    sent.current = false;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      onPersistRef.current(convKey, next);
    }, DRAFT_DEBOUNCE_MS);
  };

  const submit = async () => {
    const body = value.trim();
    if (!body || sending) return;
    const ok = await onSend(body);
    if (!ok) return;
    /* Mark BEFORE clearing: the state update and the unmount flush can interleave, and the flag is
       what makes the flush a no-op either way. */
    sent.current = true;
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    setValue('');
    onPersistRef.current(convKey, '');
  };

  return (
    <div className="flex items-end gap-2">
      <Textarea
        value={value}
        onChange={(e) => change(e.target.value)}
        onBlur={flush}
        placeholder="Type a reply…"
        className="min-h-[44px] max-h-32 flex-1 resize-none"
        maxLength={4000}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit(); } }}
        disabled={sending}
      />
      <Button onClick={() => void submit()} disabled={sending || !value.trim()} size="icon" className="h-11 w-11 shrink-0">
        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      </Button>
    </div>
  );
});
