import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { VoiceNotePlayer } from '@/components/VoiceNotePlayer';

/* THE ONE WHATSAPP ATTACHMENT VIEWER — the Inbox's and the salesperson's lead page's (2026-09-27).
 * Moved here out of Inbox.tsx unchanged so Sales reuses it instead of growing a second one.
 * ⛔ It asks Storage for a short-lived signed link under the CALLER's session. Whether that link is
 * issued is decided by the storage policies, never here: the admin reads the whole bucket; a
 * salesperson reads only files referenced by messages on leads assigned to them
 * (migration 20260927110000, "whatsapp media read assigned sales"). A refused request shows the
 * same "Attachment unavailable" as a missing file. */

export interface WhatsAppMediaMessage {
  direction: 'inbound' | 'outbound';
  message_type: string | null;
  media_path?: string | null;
  media_filename?: string | null;
  error?: string | null;
}

/** An audio row with a stored file renders as the player alone — its body is only "[audio]" (inbound)
 *  or "Voice note (0:08)" (ours), which the list preview uses but the bubble does not need. */
export function isPlayableVoice(m: WhatsAppMediaMessage): boolean {
  return m.message_type === 'audio' && !!m.media_path;
}

/** A signed link lives this long; it is renewed a minute before it lapses while the bubble is open. */
const SIGNED_URL_SECONDS = 60 * 5;

export function InboundMedia({ message }: { message: WhatsAppMediaMessage }) {
  const [url, setUrl] = useState<string | null>(null);
  const [refused, setRefused] = useState(false);
  useEffect(() => {
    let alive = true;
    setRefused(false);
    if (!message.media_path) { setUrl(null); return; }
    const renew = async () => {
      const { data, error } = await supabase.storage.from('whatsapp-media').createSignedUrl(message.media_path!, SIGNED_URL_SECONDS);
      if (!alive) return;
      setUrl(data?.signedUrl ?? null);
      setRefused(!data?.signedUrl && !!error);
    };
    void renew();
    const timer = window.setInterval(() => { void renew(); }, (SIGNED_URL_SECONDS - 60) * 1000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [message.media_path]);
  if (!message.media_path) return message.error ? <p className="mt-1 text-xs text-muted-foreground">{message.error}</p> : null;
  if (refused) return <p className="mt-1 text-xs text-muted-foreground">Attachment unavailable</p>;
  if (!url) return <p className="mt-1 text-xs text-muted-foreground">Loading attachment…</p>;
  if (message.message_type === 'image' || message.message_type === 'sticker') return <img src={url} alt={message.media_filename ?? message.message_type} className="mt-1 max-h-72 rounded object-contain" />;
  if (message.message_type === 'video') return <video src={url} controls className="mt-1 max-h-72 rounded" />;
  if (message.message_type === 'audio') return <VoiceNotePlayer src={url} tone={message.direction === 'outbound' ? 'outbound' : 'inbound'} className="mt-1 w-56 max-w-full" />;
  return <a href={url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 underline"><ExternalLink className="h-3 w-3" />{message.media_filename ?? 'Open document'}</a>;
}
