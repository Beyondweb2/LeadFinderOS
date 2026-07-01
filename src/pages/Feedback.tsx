import { useState } from "react";
import { useTeamFeedback } from "@/hooks/useTeamFeedback";
import { useSubscription } from "@/hooks/useSubscription";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MessageSquare, Send, Loader2, Trash2 } from "lucide-react";

/** Compact relative time ("just now", "3h ago", "2d ago"), falling back to a date. */
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * Team feedback board. Any operator can post a suggestion; every operator sees the
 * whole team's feedback (RLS excludes barbers). Only admin sees the per-item delete.
 * Rendered inside the in-app AppLayout (route is operator-gated in App.tsx).
 */
const Feedback = () => {
  const { items, isLoading, submit, remove } = useTeamFeedback();
  const { isAdmin } = useSubscription();
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!message.trim()) return;
    setSubmitting(true);
    const res = await submit(message);
    setSubmitting(false);
    if (res.error) {
      toast({
        title: "Couldn't post",
        description: res.error === "empty" ? "Write a message first." : res.error,
        variant: "destructive",
      });
      return;
    }
    setMessage("");
    toast({ title: "Posted", description: "Your feedback is now visible to the team." });
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this feedback item? This can't be undone.")) return;
    const res = await remove(id);
    if (res.error) {
      toast({ title: "Delete failed", description: res.error, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-5 sm:space-y-7">
      <div className="text-center sm:text-left">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Team Feedback</h1>
        <p className="text-sm text-muted-foreground">
          Suggestions, ideas and issues from the whole team. Anyone can post — everyone sees them.
        </p>
      </div>

      {/* Submit box */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Share a suggestion, idea, or issue with the team…"
            className="min-h-[90px] resize-none"
            maxLength={4000}
            disabled={submitting}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">{message.length}/4000</span>
            <Button onClick={handleSubmit} disabled={submitting || !message.trim()}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Post feedback
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <div className="py-10 text-center text-muted-foreground">
          <MessageSquare className="mx-auto mb-2 h-6 w-6 opacity-40" />
          <p className="text-sm">No feedback yet — be the first to post.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((f) => (
            <Card key={f.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                        {(f.author_name || f.author_email || "?").charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{f.author_name || f.author_email || "Team member"}</p>
                      <p className="text-[11px] text-muted-foreground">{timeAgo(f.created_at)}</p>
                    </div>
                  </div>
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(f.id)}
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-foreground/90">{f.message}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Feedback;
