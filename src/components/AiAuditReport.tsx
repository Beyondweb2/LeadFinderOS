import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Download, RefreshCw, Loader2, ArrowLeftRight } from 'lucide-react';
import { renderReportHtml, type AiAuditReportData } from '@/lib/aiAuditReportHtml';

// In-app preview of the client report. Renders the EXACT downloadable HTML in an
// iframe (WYSIWYG — one source of design, zero drift with the sent file). The iframe
// auto-sizes to the document so the whole one-page report is visible without scroll.
//
// `data` is a persisted snapshot held by the parent — the report shown on return is the
// one that was generated, not a fresh derivation. `onRegenerate` (when provided) is the
// ONLY path that rebuilds it from the latest run data.
//
// ⛔ CLIENT vs INTERNAL: a toggle chooses which version is rendered AND printed. The internal
// version shows the winnability annotation; the client version strips it. CLIENT IS THE DEFAULT and
// resets to client on every open (the parent gives this component key={reportRunId}, so opening a
// report remounts it and showInternal falls back to false). onDownload is handed the CURRENT choice
// so print follows the view. The parent's snapshot may carry internal:true; this override decides.
export function AiAuditReport({ data, onBack, onDownload, onRegenerate, regenerating, onCompare }: {
  data: AiAuditReportData;
  onBack: () => void;
  onDownload: (internal: boolean) => void;
  onRegenerate?: () => void;
  regenerating?: boolean;
  /** Switch to the before/after side-by-side. Absent when there is nothing to compare against, so
   *  the button never appears as an action that does nothing. The PARENT owns the mode — this
   *  component stays a pure renderer of one report. */
  onCompare?: () => void;
}) {
  // Default false = CLIENT. Safety: never carry an internal state into the next report — the parent
  // remounts this component per report (key={reportRunId}), so every open starts on Client.
  const [showInternal, setShowInternal] = useState(false);
  const html = renderReportHtml({ ...data, internal: showInternal });
  const frameRef = useRef<HTMLIFrameElement>(null);

  const fit = () => {
    const doc = frameRef.current?.contentWindow?.document;
    if (doc) frameRef.current!.style.height = `${doc.documentElement.scrollHeight}px`;
  };
  // Re-fit if the content changes.
  useEffect(fit, [html]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to results
        </Button>
        <div className="flex items-center gap-3">
          {/* Version toggle — CLIENT is the default; Internal shows the winnability notes and is
              clearly marked "not for the client". Download/print follows whichever is selected. */}
          <div className="inline-flex items-center rounded-md border border-border overflow-hidden text-xs">
            <button
              type="button"
              onClick={() => setShowInternal(false)}
              aria-pressed={!showInternal}
              className={`px-2.5 h-7 font-medium transition-colors ${!showInternal ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}
            >Client</button>
            <button
              type="button"
              onClick={() => setShowInternal(true)}
              aria-pressed={showInternal}
              className={`px-2.5 h-7 font-medium transition-colors ${showInternal ? 'bg-amber-500 text-white' : 'bg-background text-muted-foreground hover:text-foreground'}`}
            >Internal</button>
          </div>
          <span className={`hidden sm:inline text-xs ${showInternal ? 'text-amber-600 font-medium' : 'text-muted-foreground'}`}>
            {showInternal ? '⚠ Internal view — winnability shown. Not for the client.' : 'This is exactly what your prospect receives.'}
          </span>
          {/* BEFORE / AFTER. Free — it re-reads runs that already exist. Placed in the report's own
              toolbar because this is the report the operator sends, so it is where a before/after is
              actually wanted; the single report stays the default view. */}
          {onCompare && (
            <Button variant="outline" size="sm" onClick={onCompare} title="Show this report beside an earlier measurement of the same business">
              <ArrowLeftRight className="mr-2 h-4 w-4" /> Before / after
            </Button>
          )}
          {onRegenerate && (
            <Button variant="outline" size="sm" onClick={onRegenerate} disabled={regenerating} title="Rebuild this report from the latest run data">
              {regenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              {regenerating ? 'Regenerating…' : 'Regenerate'}
            </Button>
          )}
          <Button size="sm" onClick={() => onDownload(showInternal)}>
            <Download className="mr-2 h-4 w-4" /> {showInternal ? 'Download PDF · Internal' : 'Download PDF · Client'}
          </Button>
        </div>
      </div>

      <iframe
        ref={frameRef}
        title="AI Visibility Report preview"
        srcDoc={html}
        onLoad={fit}
        className="w-full rounded-xl border border-border bg-white"
        style={{ height: 1200 }}
      />
    </div>
  );
}
