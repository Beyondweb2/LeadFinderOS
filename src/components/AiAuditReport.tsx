import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Download, Check, X, Quote } from 'lucide-react';
import type { AiAuditReportData } from '@/lib/aiAuditReportHtml';

// In-app, client-facing report view (dark theme, shadcn). Mirrors the downloadable
// standalone HTML. The scorecard is laid out with a "Now" column and a reserved
// "After" column so a future re-run comparison can slot straight in.
export function AiAuditReport({ data, onBack, onDownload }: {
  data: AiAuditReportData;
  onBack: () => void;
  onDownload: () => void;
}) {
  const type = data.businessType.trim() || 'business like yours';
  return (
    <div className="space-y-5 sm:space-y-7">
      {/* Toolbar (not part of the sent report) */}
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to results
        </Button>
        <Button size="sm" onClick={onDownload}>
          <Download className="mr-2 h-4 w-4" /> Download report
        </Button>
      </div>

      {/* Headline */}
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">AI Visibility Report</div>
        <h1 className="mt-1.5 text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight">
          When customers ask AI, <span className="text-primary">{data.businessName}</span> is named in {data.named} of {data.total} searches
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{data.pct}% of the AI answers we tested mentioned you.</p>
      </div>

      {/* Scorecard — Now | After(reserved) */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Where AI named you</div>
          <div className="grid grid-cols-[1fr_88px_104px] items-center gap-3 border-b border-border/60 pb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            <span>Engine</span><span>Now</span><span className="text-muted-foreground/60">After</span>
          </div>
          {data.perEngine.map((pe) => (
            <div key={pe.label} className="grid grid-cols-[1fr_88px_104px] items-center gap-3 border-b border-border/40 py-2 last:border-b-0">
              <span className="text-sm font-semibold">{pe.label}</span>
              <span className="flex items-center gap-1.5 tabular-nums">
                {pe.named > 0
                  ? <Check className="h-4 w-4 text-[hsl(var(--badge-interested))]" />
                  : <X className="h-4 w-4 text-red-400" />}
                <b className="text-sm">{pe.named}/{pe.total}</b>
              </span>
              <span className="text-xs italic text-muted-foreground/50">re-run to compare</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* The gut-punch */}
      {data.gutPunch && (
        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">What AI is telling your customers</div>
            <div className="text-sm text-muted-foreground">Someone asked AI: &ldquo;{data.gutPunch.question}&rdquo;</div>
            <blockquote className="my-2.5 flex gap-2 rounded-r-lg border-l-[3px] border-red-400/70 bg-red-400/10 px-4 py-3 text-base sm:text-lg text-foreground">
              <Quote className="h-4 w-4 shrink-0 text-red-400/70" />
              <span>{data.gutPunch.text}</span>
            </blockquote>
            <div className="text-xs text-muted-foreground">— {data.gutPunch.engineLabel}. {data.businessName} wasn&rsquo;t mentioned.</div>
          </CardContent>
        </Card>
      )}

      {/* Competitors */}
      {data.competitors.length > 0 && (
        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">AI names these instead</div>
            <div className="flex flex-wrap gap-1.5">
              {data.competitors.map((c) => <Badge key={c} variant="secondary">{c}</Badge>)}
            </div>
          </CardContent>
        </Card>
      )}

      {/* What this means */}
      <div className="rounded-xl border border-primary/25 bg-primary/[0.08] px-5 py-4 text-sm leading-relaxed">
        <span className="font-semibold text-primary">What this means.</span> When people ask AI assistants to recommend a {type}, you&rsquo;re mostly invisible — and other businesses are the default answer AI gives your customers. The good news: this is fixable. We can improve what AI says about you and then re-run this exact audit to show the &ldquo;after&rdquo;.
      </div>

      <div className="text-center text-[11px] text-muted-foreground/70">Generated {data.generatedAtLabel} · AI Visibility Audit</div>
    </div>
  );
}
