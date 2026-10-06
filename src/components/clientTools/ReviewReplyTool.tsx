import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Copy, ShieldAlert, Sparkles, Star, PiggyBank, CheckCircle2, AlertCircle } from 'lucide-react';
import { Callout } from '@/components/operator/ui';

/* ════════════════════════════════════════════════════════════════════════════════════════════
   REVIEW REPLY GENERATOR — paste a Google review in, get a reply out (or a DON'T-reply verdict).

   📍 WHERE IT LIVES (2026-10-06): inside Paid Clients — the Tools tab of the list (any business), and
   the "Pages & reviews" section of a client's page (the business name filled in). It was the
   /review-replies page; that URL now redirects to the Tools tab. Same edge function, same logic.

   ⛔ DELIBERATELY STATELESS AND GOOGLE-FREE (2026-08-19, Paul's spec). Nothing is stored, nothing
   reads or posts to Google — the operator pastes the review in and pastes the reply back by hand.
   The full read-and-post version is a later phase, gated on Google approving GBP API access; the
   drafting/verdict logic in the review-reply edge fn carries straight over to it.

   ⛔ THE DON'T-REPLY VERDICT IS A FIRST-CLASS OUTPUT, not a failure: abusive reviews, legal or
   safety territory, disputes only the owner can answer — a canned reply there makes things worse,
   so the tool says "handle this personally" with the reason instead of drafting.

   ⚠️ THE OPENAI ACCOUNT CAN BE OUT OF CREDITS (it was at build time). The edge fn returns the typed
   error "no_credits" for that state and this tool renders the friendly banner — the tool comes back
   to life the moment credits are added, with no redeploy.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

type Result =
  | { kind: 'reply'; reply: string; reason: string | null }
  | { kind: 'dont_reply'; reason: string }
  | { kind: 'no_credits' }
  | { kind: 'error'; message: string };

export function ReviewReplyTool({ businessName: initialBusinessName = '' }: { businessName?: string }) {
  const { toast } = useToast();
  const [reviewText, setReviewText] = useState('');
  const [stars, setStars] = useState<number | null>(null);
  const [businessName, setBusinessName] = useState(initialBusinessName);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const generate = async () => {
    if (!reviewText.trim() || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const { data: res, error } = await supabase.functions.invoke('review-reply', {
        body: {
          review_text: reviewText.trim(),
          ...(stars ? { star_rating: stars } : {}),
          ...(businessName.trim() ? { business_name: businessName.trim() } : {}),
        },
      });
      if (error) throw new Error(error.message);
      if (!res?.ok) {
        if (res?.error === 'no_credits') { setResult({ kind: 'no_credits' }); return; }
        throw new Error(res?.error ?? 'generation failed');
      }
      if (res.verdict === 'dont_reply') {
        setResult({ kind: 'dont_reply', reason: res.reason ?? 'This one needs your personal judgement.' });
      } else {
        setResult({ kind: 'reply', reply: res.reply ?? '', reason: res.reason ?? null });
      }
    } catch (e) {
      setResult({ kind: 'error', message: e instanceof Error ? e.message : 'generation failed' });
    } finally {
      setBusy(false);
    }
  };

  const copyReply = async () => {
    if (result?.kind !== 'reply') return;
    try {
      await navigator.clipboard.writeText(result.reply);
      toast({ title: 'Copied', description: 'Paste it into the review reply box on Google.' });
    } catch {
      toast({ title: 'Could not copy', description: 'Select the text and copy it by hand.', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4" data-testid="review-reply-tool">
      <p className="text-sm text-muted-foreground">
        Paste a client's Google review in. You get a reply to copy back into Google by hand — or a
        clear "don't reply, handle this personally" when a drafted reply would make things worse.
        Nothing is stored, and nothing touches Google.
      </p>
      <div className="space-y-3">
        <Textarea
          value={reviewText}
          onChange={(e) => setReviewText(e.target.value)}
          placeholder="Paste the review text here, exactly as the customer wrote it…"
          rows={5}
          aria-label="The review"
        />
        <div className="flex flex-wrap items-center gap-3">
          {/* Optional context. Stars matter most: they steer the tone and the don't-reply bar. */}
          <div className="flex items-center gap-0.5" aria-label="Star rating (optional)">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                title={stars === n ? 'Click again to clear' : `${n} star${n === 1 ? '' : 's'}`}
                onClick={() => setStars(stars === n ? null : n)}
                className="rounded-md p-1 transition-colors hover:bg-muted"
              >
                <Star className={`h-5 w-5 ${stars && n <= stars ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40'}`} />
              </button>
            ))}
            <span className="ml-1 text-xs text-muted-foreground">{stars ? `${stars} of 5` : 'stars (optional)'}</span>
          </div>
          <Input
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="Business name (optional)"
            className="h-9 w-full min-w-0 sm:w-56"
          />
          <Button onClick={generate} disabled={!reviewText.trim() || busy} className="sm:ml-auto">
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
            Generate reply
          </Button>
        </div>
      </div>

      {result?.kind === 'no_credits' && (
        <Callout tone="amber" icon={PiggyBank} title="AI credits need topping up">
          The OpenAI account is out of credit, so nothing can be drafted right now. The moment it's
          topped up this works again — nothing to redeploy, just press Generate.
        </Callout>
      )}

      {result?.kind === 'dont_reply' && (
        <Callout tone="red" icon={ShieldAlert} title="Don't reply — handle this one personally">
          <p>{result.reason}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            This is the tool doing its job, not failing: a drafted reply here would likely make
            things worse. Deal with it directly, or with the client.
          </p>
        </Callout>
      )}

      {result?.kind === 'reply' && (
        <Callout tone="green" icon={CheckCircle2} title="Suggested reply"
          action={<Button variant="outline" size="sm" onClick={copyReply}><Copy className="mr-1.5 h-3.5 w-3.5" /> Copy</Button>}>
          <p className="whitespace-pre-wrap">{result.reply}</p>
          {result.reason && <p className="mt-1 text-xs text-muted-foreground">{result.reason}</p>}
          <p className="mt-1 text-xs text-muted-foreground">
            Read it before you paste it — you're the approval step. Post it from the client's
            profile on Google, not from here.
          </p>
        </Callout>
      )}

      {result?.kind === 'error' && (
        <Callout tone="red" icon={AlertCircle} title="Couldn't generate">{result.message}</Callout>
      )}
    </div>
  );
}
