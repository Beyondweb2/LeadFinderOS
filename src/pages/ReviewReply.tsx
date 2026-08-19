import { useState } from 'react';
import { SEOHead } from '@/components/SEOHead';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2, MessageSquareQuote, Copy, ShieldAlert, Sparkles, Star, PiggyBank } from 'lucide-react';

/* ════════════════════════════════════════════════════════════════════════════════════════════
   REVIEW REPLY GENERATOR — paste a Google review in, get a reply out (or a DON'T-reply verdict).

   ⛔ DELIBERATELY STATELESS AND GOOGLE-FREE (2026-08-19, Paul's spec). Nothing is stored, nothing
   reads or posts to Google — the operator pastes the review in and pastes the reply back by hand.
   The full read-and-post version is a later phase, gated on Google approving GBP API access; the
   drafting/verdict logic in the review-reply edge fn carries straight over to it.

   ⛔ THE DON'T-REPLY VERDICT IS A FIRST-CLASS OUTPUT, not a failure: abusive reviews, legal or
   safety territory, disputes only the owner can answer — a canned reply there makes things worse,
   so the tool says "handle this personally" with the reason instead of drafting.

   ⚠️ THE OPENAI ACCOUNT CAN BE OUT OF CREDITS (it was at build time). The edge fn returns the typed
   error "no_credits" for that state and this page renders the friendly banner — the tool comes back
   to life the moment credits are added, with no redeploy.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

type Result =
  | { kind: 'reply'; reply: string; reason: string | null }
  | { kind: 'dont_reply'; reason: string }
  | { kind: 'no_credits' }
  | { kind: 'error'; message: string };

const ReviewReply = () => {
  const { toast } = useToast();
  const [reviewText, setReviewText] = useState('');
  const [stars, setStars] = useState<number | null>(null);
  const [businessName, setBusinessName] = useState('');
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
    <div className="space-y-5 max-w-3xl">
      <SEOHead title="Review replies | LeadFinder Pro" description="Draft replies to Google reviews, with a don't-reply safety verdict." canonical="/review-replies" noindex />
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Review replies</h1>
        <p className="text-sm text-muted-foreground">
          Paste a client's Google review in. You get a reply to copy back into Google by hand — or a
          clear "don't reply, handle this personally" when a drafted reply would make things worse.
          Nothing is stored, and nothing touches Google.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <MessageSquareQuote className="h-4 w-4 text-primary" /> The review
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
            placeholder="Paste the review text here, exactly as the customer wrote it…"
            rows={6}
          />
          <div className="flex flex-wrap items-center gap-3">
            {/* Optional context. Stars matter most: they steer the tone and the don't-reply bar. */}
            <div className="flex items-center gap-1" aria-label="Star rating (optional)">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  title={stars === n ? 'Click again to clear' : `${n} star${n === 1 ? '' : 's'}`}
                  onClick={() => setStars(stars === n ? null : n)}
                  className="p-0.5"
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
              className="h-9 w-56"
            />
            <Button onClick={generate} disabled={!reviewText.trim() || busy} className="ml-auto">
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
              Generate
            </Button>
          </div>
        </CardContent>
      </Card>

      {result?.kind === 'no_credits' && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex items-start gap-3 p-4">
            <PiggyBank className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div className="text-sm">
              <p className="font-medium">AI credits need topping up</p>
              <p className="text-muted-foreground">
                The OpenAI account is out of credit, so nothing can be drafted right now. The moment
                it's topped up this works again — nothing to redeploy, just press Generate.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {result?.kind === 'dont_reply' && (
        <Card className="border-red-500/40 bg-red-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-red-600 dark:text-red-500">
              <ShieldAlert className="h-4 w-4" /> Don't reply — handle this one personally
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <p>{result.reason}</p>
            <p className="text-xs text-muted-foreground">
              This is the tool doing its job, not failing: a drafted reply here would likely make
              things worse. Deal with it directly, or with the client.
            </p>
          </CardContent>
        </Card>
      )}

      {result?.kind === 'reply' && (
        <Card className="border-emerald-500/40 bg-emerald-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center justify-between gap-2">
              <span className="text-emerald-600 dark:text-emerald-500">Suggested reply</span>
              <Button variant="outline" size="sm" onClick={copyReply}>
                <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="whitespace-pre-wrap text-sm">{result.reply}</p>
            {result.reason && <p className="text-xs text-muted-foreground">{result.reason}</p>}
            <p className="text-xs text-muted-foreground">
              Read it before you paste it — you're the approval step. Post it from the client's
              profile on Google, not from here.
            </p>
          </CardContent>
        </Card>
      )}

      {result?.kind === 'error' && (
        <Card className="border-destructive/40 bg-destructive/10">
          <CardContent className="p-4 text-sm text-destructive">
            Couldn't generate: {result.message}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ReviewReply;
