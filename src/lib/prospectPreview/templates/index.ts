/* ════════════════════════════════════════════════════════════════════════════════════════════════
   PROSPECT PREVIEW — the template registry.

   HOW A FINDABLE TRADE TEMPLATE PLUGS IN (Findable Electrician, Plumber, Roofer …):
     1. Build it as a ProspectTemplate: `render(cfg)` returns ONE complete homepage document from a
        ProspectConfig — the same config every template receives. No per-prospect code, ever.
     2. Declare `trades: ['electrician']` (the keys in trades.ts) and `status: 'approved'` once Paul
        signs it off for prospect use.
     3. Add it to PROSPECT_TEMPLATES. `selectTemplate` then prefers it over the demonstration
        template for that trade; every other trade keeps falling back.
   A Website Build template (websiteTemplates.ts) is a paid-client BUILD profile, not a renderer —
   it gets here only through an adapter that returns a ProspectTemplate, and only when it carries
   no seed values (its `forbiddenSeedValues` are exactly what contamination.ts refuses on output).

   ⛔ `selectTemplate` returning null is a real outcome ("template unavailable") — the preview
   fails with that reason; it never borrows a template approved for a different trade.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import type { ProspectTemplate } from '../types.ts';
import { LOCAL_TRADE_TEMPLATE } from './localTrade.ts';

export const PROSPECT_TEMPLATES: readonly ProspectTemplate[] = [LOCAL_TRADE_TEMPLATE];

export type TemplateChoice =
  | { ok: true; template: ProspectTemplate; why: string }
  | { ok: false; reason: string };

const covers = (t: ProspectTemplate, tradeKey: string) => t.trades === '*' || t.trades.includes(tradeKey);

export function selectTemplate(tradeKey: string, registry: readonly ProspectTemplate[] = PROSPECT_TEMPLATES, opts: { allowDemo?: boolean } = {}): TemplateChoice {
  const allowDemo = opts.allowDemo !== false;
  const approvedSpecific = registry.find((t) => t.status === 'approved' && t.trades !== '*' && t.trades.includes(tradeKey));
  if (approvedSpecific) return { ok: true, template: approvedSpecific, why: `Approved ${tradeKey} template.` };
  const approvedAny = registry.find((t) => t.status === 'approved' && t.trades === '*');
  if (approvedAny) return { ok: true, template: approvedAny, why: 'Approved all-trades template.' };
  if (allowDemo) {
    const demo = registry.find((t) => t.status === 'demo' && covers(t, tradeKey));
    if (demo) return { ok: true, template: demo, why: `No approved ${tradeKey === 'generic' ? '' : tradeKey + ' '}template yet — using the demonstration template.` };
  }
  return { ok: false, reason: `No prospect template is available for "${tradeKey}".` };
}

export function templateKey(t: Pick<ProspectTemplate, 'id' | 'version'>): string {
  return `${t.id}@${t.version}`;
}
