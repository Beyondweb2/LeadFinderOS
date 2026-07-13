import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Download, RefreshCw, Loader2 } from 'lucide-react';
import { renderReportHtml, type AiAuditReportData } from '@/lib/aiAuditReportHtml';

// In-app preview of the client report. Renders the EXACT downloadable HTML in an
// iframe (WYSIWYG — one source of design, zero drift with the sent file). The iframe
// auto-sizes to the document so the whole one-page report is visible without scroll.
//
// `data` is a persisted snapshot held by the parent — the report shown on return is the
// one that was generated, not a fresh derivation. `onRegenerate` (when provided) is the
// ONLY path that rebuilds it from the latest run data.
export function AiAuditReport({ data, onBack, onDownload, onRegenerate, regenerating }: {
  data: AiAuditReportData;
  onBack: () => void;
  onDownload: () => void;
  onRegenerate?: () => void;
  regenerating?: boolean;
}) {
  const html = renderReportHtml(data);
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
          <span className="hidden sm:inline text-xs text-muted-foreground">This is exactly what your prospect receives.</span>
          {onRegenerate && (
            <Button variant="outline" size="sm" onClick={onRegenerate} disabled={regenerating} title="Rebuild this report from the latest run data">
              {regenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              {regenerating ? 'Regenerating…' : 'Regenerate'}
            </Button>
          )}
          <Button size="sm" onClick={onDownload}>
            <Download className="mr-2 h-4 w-4" /> Download PDF
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
