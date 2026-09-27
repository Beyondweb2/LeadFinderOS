/* ════════════════════════════════════════════════════════════════════════════════════════════════
   INBOX AI VISIBILITY DETAILS — WEBSITE / ONLINE-PRESENCE ISSUES (Paul, 2026-09-27).
   The block under the six results: genuine stored findings only, a profile is never "their website",
   three shown by default and the rest behind "View all issues", and an honest line when there is
   nothing strong. Driven through the real selector (selectFindings, the Call Script's) and the real
   component (server-rendered).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { selectFindings, type PlaybookFinding } from '../src/lib/coldCallPlaybook.ts';
import { HookWebsiteIssuesView, HOOK_ISSUES_SHOWN } from '../src/components/HookWebsiteIssuesView.tsx';
import type { LeadWebsiteIssues } from '../src/hooks/useLeadWebsiteIssues.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const NOW = Date.parse('2026-09-27T10:00:00Z');
const lead = (website: string | null) => ({ website }) as never;
const render = (d: LeadWebsiteIssues) => renderToStaticMarkup(createElement(HookWebsiteIssuesView, { data: d }));

/* ── Firebeard: a TradeHQ profile, never "their website" ── */
{
  const out = selectFindings({ lead: lead('https://tradehq.co.uk/firebeardelectrical'), runCrawls: [], leadCrawl: null, nowMs: NOW }, 20);
  ok(out.status === 'profile' && out.findings.length === 0, 'Firebeard: a TradeHQ page is a profile, never mined for website issues');
  const t = text(render({ website: 'https://tradehq.co.uk/firebeardelectrical', site: { source: 'directory_profile', label: 'TradeHQ' }, outcome: out }));
  ok(/Online presence issues found/.test(t) && !/Website issues found/.test(t), 'Firebeard: headed ONLINE PRESENCE issues, not website issues');
  ok(/No standalone business website found/.test(t) && /Only a TradeHQ profile found/.test(t) && t.includes('tradehq.co.uk/firebeardelectrical'), 'Firebeard: "No standalone business website found" + "Only a TradeHQ profile found"');
  ok(!/your website|their website/i.test(t), 'Firebeard: the profile is never called their website');
}

/* ── no website at all ── */
{
  const out = selectFindings({ lead: lead(null), runCrawls: [], leadCrawl: null, nowMs: NOW });
  const t = text(render({ website: null, site: { source: 'none', label: null }, outcome: out }));
  ok(out.status === 'no_website' && /Online presence issues found/.test(t) && /No website on record/.test(t), 'no website → an online-presence line, nothing invented');
}

/* ── an owned site: the honest empty states ── */
{
  const notCrawled = selectFindings({ lead: lead('https://acme-electrical.co.uk'), runCrawls: [], leadCrawl: null, nowMs: NOW });
  const t = text(render({ website: 'https://acme-electrical.co.uk', site: { source: 'own_site', label: null }, outcome: notCrawled }));
  ok(notCrawled.status === 'not_crawled' && /has not been checked yet/.test(t) && !/No strong website issues/.test(t), 'never crawled → says so; never "no issues found"');
  const clean = { ...notCrawled, status: 'clean' as const };
  ok(/No strong website issues found in this check\./.test(text(render({ website: 'https://acme-electrical.co.uk', site: { source: 'own_site', label: null }, outcome: clean }))), 'a clean check → "No strong website issues found in this check."');
}

/* ── an owned site with genuine findings: three shown, the rest behind "View all issues" ── */
{
  const F = (i: number): PlaybookFinding => ({ kind: 'crawler_blocked', title: `Finding ${i}`, explanation: `What we saw ${i}.`, whyItMayMatter: 'It may matter.', proof: [] });
  const outcome = { status: 'findings' as const, findings: [F(1), F(2), F(3), F(4), F(5)], note: null, crawlAtMs: NOW, crawlStale: false };
  const html = render({ website: 'https://acme-electrical.co.uk', site: { source: 'own_site', label: null }, outcome });
  const t = text(html);
  ok(/Website issues found/.test(t) && (html.match(/data-testid="hook-website-issue"/g) ?? []).length === HOOK_ISSUES_SHOWN, `findings → "Website issues found", ${HOOK_ISSUES_SHOWN} shown by default`);
  ok(t.includes('Finding 1') && t.includes('Finding 3') && !t.includes('Finding 4'), '…the strongest first, the rest hidden');
  ok(/View all issues \(5\)/.test(t), '…behind "View all issues (5)"');
  const two = render({ website: 'x', site: { source: 'own_site', label: null }, outcome: { ...outcome, findings: [F(1), F(2)] } });
  ok(!/View all issues/.test(text(two)), 'no toggle when there is nothing more');
}

/* ── the same selector as the Call Script, read only ── */
{
  const hook = readFileSync(new URL('../src/hooks/useLeadWebsiteIssues.ts', import.meta.url), 'utf8');
  ok(/selectFindings\(/.test(hook) && /runCrawlSources\(newestUsableAudit\(/.test(hook), 'the Inbox block reads the Call Script\'s selector and sources');
  ok(!/functions\.invoke|\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/.test(hook), 'the loader only reads — no crawl, no spend, no write');
  const card = readFileSync(new URL('../src/components/HookVisibilityCard.tsx', import.meta.url), 'utf8');
  ok(/issues=\{<HookWebsiteIssues leadId=\{leadId\} \/>\}/.test(card), 'the Inbox card puts the block inside the details (mounted only when they are open)');
}

if (f > 0) { console.log(`\n${f} FAILURE${f === 1 ? '' : 'S'}`); process.exit(1); }
console.log('\nALL PASS');
