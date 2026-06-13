import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Users, Loader2, Send } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useLeadNotes } from '@/hooks/useLeadNotes';

function initials(name: string | null): string {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
}

interface TeamNotesProps {
  placeId: string | null;
  googleMapsUrl: string | null;
  businessName: string;
}

/**
 * Team-visible notes on a business (separate from the private per-user note).
 * Business-global: the same notes appear on this business in any campaign.
 */
export function TeamNotes({ placeId, googleMapsUrl, businessName }: TeamNotesProps) {
  const { notes, isLoading, addNote } = useLeadNotes({ placeId, googleMapsUrl, businessName }, true);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!draft.trim()) return;
    setSaving(true);
    const ok = await addNote(draft);
    setSaving(false);
    if (ok) setDraft('');
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">Team notes</h3>
        <span className="text-xs text-muted-foreground">visible to everyone</span>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading notes…
        </div>
      ) : notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No team notes yet. Add the first one below.</p>
      ) : (
        <div className="space-y-3">
          {notes.map((n) => (
            <div key={n.id} className="flex gap-2.5">
              <Avatar className="h-6 w-6 shrink-0 mt-0.5">
                {n.authorAvatar && <AvatarImage src={n.authorAvatar} alt={n.authorName || 'Teammate'} />}
                <AvatarFallback className="text-[9px] bg-primary/15 text-primary">
                  {initials(n.authorName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-medium">
                    {n.authorName || 'Teammate'}{n.isMine ? ' (you)' : ''}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap break-words">{n.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Textarea
          placeholder="Add a note for the team (e.g. called, not interested, retry in 3 months)…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="min-h-[60px] text-sm"
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={handleAdd} disabled={!draft.trim() || saving} className="gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Add note
          </Button>
        </div>
      </div>
    </div>
  );
}
