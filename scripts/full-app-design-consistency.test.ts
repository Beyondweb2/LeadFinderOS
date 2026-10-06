/* FULL-APP DESIGN CONSISTENCY (2026-10-06, improve/full-app-design-consistency).
   docs/design/full-app-ui-audit.md · docs/pre-sales-certification/full-app-design-consistency.md.
   A visual pass: every page and popup draws from the Sales dashboard's look. This pins:
     1. the shared pieces render what they promise (PageHeader icon, Load / Error / Empty / Denied states);
     2. every page has the shared header (or a recorded reason not to);
     3. every popup has an accessible title (DialogHero or DialogTitle) — no untitled dialog;
     4. nothing was taken away: every route, every menu entry and every role rule is as before.
   Run: npx tsx scripts/full-app-design-consistency.test.ts */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Search } from 'lucide-react';
import { PageHeader, TONE } from '../src/components/salesDash/primitives.tsx';
import { DeniedState, EmptyState, ErrorState, LoadState } from '../src/components/operator/ui.tsx';
import { canOpenRoute } from '../src/lib/access.ts';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('PASS ' + m); else { f++; console.log('FAIL ' + m); } };
const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, ' ').trim();

console.log('── 1. the shared pieces ──');
{
  const withIcon = html(createElement(PageHeader, { title: 'Find Leads', subtitle: 'Find businesses.', icon: Search, tone: 'purple', testId: 'ph' }));
  ok(/<h1[^>]*>Find Leads<\/h1>/.test(withIcon) && /Find businesses\./.test(withIcon), 'PageHeader: title is the page h1, subtitle under it');
  ok(withIcon.includes(TONE.purple.solid.split(' ')[0]) && /aria-hidden="true"/.test(withIcon) && /<svg/.test(withIcon), 'PageHeader with icon: a solid tile in its tone, hidden from screen readers');
  ok(!/text-center/.test(withIcon), 'PageHeader is left-aligned at every width (no centred phone header)');
  const plain = html(createElement(PageHeader, { title: 'Sales dashboard' }));
  ok(!/<svg/.test(plain) && /text-\[1\.75rem\]/.test(plain), 'PageHeader without an icon is the dashboards\' header, unchanged');

  const load = html(createElement(LoadState, { label: 'Loading clients…' }));
  ok(/role="status"/.test(load) && /aria-live="polite"/.test(load) && /Loading clients…/.test(load), 'LoadState: announced politely, says what is loading');
  const errNoRetry = html(createElement(ErrorState, { detail: 'Network down' }));
  ok(/role="alert"/.test(errNoRetry) && /Couldn’t load this/.test(errNoRetry) && !/<button/.test(errNoRetry), 'ErrorState: an alert; no Retry button when the caller has none');
  const errRetry = html(createElement(ErrorState, { title: 'Couldn’t load the team', onRetry: () => {} }));
  ok(/<button[^>]*>.*Try again<\/button>/.test(errRetry), 'ErrorState: Retry appears when the caller passes a retry');
  const empty = html(createElement(EmptyState, { icon: Search, title: 'No campaigns yet', action: createElement('button', null, 'New campaign') }, 'Campaigns group leads you are working.'));
  ok(text(empty).startsWith('No campaigns yet') && /New campaign/.test(empty) && /data-testid="empty-state"/.test(empty), 'EmptyState: what it is, why it is empty, the next action');
  const denied = html(createElement(DeniedState, null, 'This page is for the admin.'));
  ok(/data-testid="denied-state"/.test(denied) && /Not available on your account/.test(denied), 'DeniedState: says plainly that the page belongs to another role');
}

console.log('── 2. every page has the shared header ──');
{
  /* Pages that are not a "screen" with a title: redirects, the public sign-in pair (own card), and the
     two dashboards that already used PageHeader before this pass. */
  const NO_HEADER: Record<string, string> = {
    'Auth.tsx': 'public sign-in card', 'SetPassword.tsx': 'public set-password card', 'CampaignDetail.tsx': 'redirect wrapper',
    'NotFound.tsx': 'an EmptyState, not a screen',
    'ClientHub.tsx': 'a client hero header (solid IconTile + the business name as h1), restyled 2026-10-06',
    'Inbox.tsx': 'a two-pane chat screen: a compact header (solid IconTile + h1) keeps the conversation list high',
  };
  for (const file of readdirSync(path.join(ROOT, 'src/pages')).filter((f) => f.endsWith('.tsx'))) {
    const src = read(`src/pages/${file}`);
    if (NO_HEADER[file]) { ok(true, `${file}: no PageHeader (${NO_HEADER[file]})`); continue; }
    ok(/<PageHeader\b/.test(src), `${file}: uses the shared PageHeader`);
  }
  const centred = readdirSync(path.join(ROOT, 'src/pages')).filter((f) => /text-center sm:text-left[^"]*">\s*\n?\s*<h1/.test(read(`src/pages/${f}`)));
  ok(centred.length === 0, `no page keeps a centred-on-phone h1 header (${centred.join(', ') || 'none'})`);
}

console.log('── 3. every popup has an accessible title ──');
{
  const files: string[] = [];
  const walk = (d: string) => { for (const e of readdirSync(path.join(ROOT, d), { withFileTypes: true })) { const p = `${d}/${e.name}`; if (e.isDirectory()) { if (e.name !== 'ui') walk(p); } else if (p.endsWith('.tsx')) files.push(p); } };
  walk('src');
  let dialogs = 0;
  /* A dialog whose title is drawn by the component it renders (that component is checked to have it). */
  const TITLE_IN_CHILD: Record<string, string> = { 'src/components/ProspectAuditDialog.tsx': 'src/components/ProspectAuditView.tsx' };
  for (const [p, child] of Object.entries(TITLE_IN_CHILD)) ok(/<DialogTitle\b/.test(read(child)), `${p}: its title is drawn by ${child}`);
  for (const p of files) {
    if (TITLE_IN_CHILD[p]) continue;
    const src = read(p);
    const hasDialog = /<DialogContent\b/.test(src), hasAlert = /<AlertDialogContent\b/.test(src), hasSheet = /<SheetContent\b/.test(src);
    if (!hasDialog && !hasAlert && !hasSheet) continue;
    dialogs++;
    if (hasDialog) ok(/<DialogHero\b|<DialogTitle\b/.test(src), `${p}: every Dialog has a title (DialogHero or DialogTitle)`);
    if (hasAlert) ok(/<AlertDialogTitle\b/.test(src), `${p}: every AlertDialog has an AlertDialogTitle`);
    if (hasSheet) ok(/<SheetTitle\b|sr-only/.test(src), `${p}: every Sheet has a title (visible or screen-reader only)`);
  }
  ok(dialogs >= 35, `the sweep found the app's popups (${dialogs} files)`);
}

console.log('── 3b. the fixes found in visual QA ──');
{
  const team = read('src/pages/Team.tsx');
  ok(/useEarnings\('all'\)/.test(team) && /data-testid="team-member-money"/.test(team) && /m\.role === 'sales' && earn\.data/.test(team), 'Team: each salesperson shows sales / earned / owed from the commission ledger (sales-earnings), only once it has loaded — never a guessed zero');
  ok(/heldFor\(m\.user_id\) > 0/.test(team) && /r\.status === 'open'/.test(team), 'Team: an open attribution review shows as "held for review" on the claimed seller');
  ok(!canOpenRoute('sales', '/team'), '…and Team (with its money) stays admin-only');
  ok(/basis-56/.test(team), 'Team: on a phone the details take the line and the chips wrap under them');
  const api = read('src/pages/AdminApiUsage.tsx');
  ok((api.match(/\{bareHeader\}/g) ?? []).length === 2, 'API usage & Security keeps its header while loading and when the load fails');
  ok(/aria-label="Import leads"/.test(read('src/components/OutreachTable.tsx')), 'Outreach: the icon-only Import button on a phone has an accessible name');
  ok(/flex flex-wrap items-start justify-between gap-3 pr-9/.test(read('src/components/LeadDetailDialog.tsx')), 'Lead popup: on a phone the Call / Log / WhatsApp pills wrap under the name');
  ok(/<DialogTitle className="sr-only">Lead details<\/DialogTitle>/.test(read('src/components/LeadDetailFromInbox.tsx')), 'Inbox lead placeholder: has an accessible name');
  ok(/<IconTile\b/.test(read('src/pages/Inbox.tsx')) && /WhatsApp Inbox<\/h1>/.test(read('src/pages/Inbox.tsx')), 'WhatsApp keeps a compact header WITH the shared icon tile (the recorded exception above)');
}

console.log('── 3c. follow-up (Paul, 2026-10-06): colour means something; the tips say what really happens ──');
{
  const camp = read('src/pages/Campaigns.tsx');
  ok(/<ToneChip tone="blue" icon=\{Icon\} testId="campaign-method"/.test(camp) && !/emerald|bg-sky-700|bg-green/.test(camp), 'the campaign contact-method chip is the blue information pill for every method — never green (green = success / money)');
  const tips = JSON.parse(read('src/i18n/locales/en.json')).outreachTips.tip1Desc as string;
  ok(!/auto-rotat|rotates between|6 proven/i.test(tips) && /exactly what goes out/.test(tips), 'Outreach tips: no "auto-rotates between 6 proven openers" — the chosen template is exactly what is sent (no rotation since 2026-09-27)');
}

console.log('── 4. nothing was taken away ──');
{
  const app = read('src/App.tsx');
  const ROUTES = ['/auth', '/set-password', '/', '/find-leads', '/dashboard', '/outreach', '/sales-dashboard', '/earnings', '/focus', '/feedback',
    '/baseline/:auditId', '/baseline-setup/:leadId', '/campaigns', '/campaigns/:campaignId', '/paid-clients', '/paid-clients/:leadId',
    '/paid-clients/:leadId/website-build', '/compare/:auditId', '/mockups', '/mockups/:id', '/templates', '/inbox', '/coverage',
    '/review-replies', '/page-generator', '/page-plan', '/ai-audit', '/admin/api-usage', '/sales', '/sales/lead/:leadId', '/team',
    '/admin', '/market', '/landing', '/login', '*'];
  for (const r of ROUTES) ok(app.includes(`path="${r}"`), `route ${r} still exists`);
  const urls = (p: string) => [...new Set([...read(p).matchAll(/url: '([^']+)'/g)].map((m) => m[1]))].sort().join(' ');
  ok(urls('src/components/AppSidebar.tsx') === '/ /ai-audit /coverage /feedback /find-leads /inbox /outreach /paid-clients /sales-dashboard /team /templates', 'the sidebar has every entry it had');
  ok(urls('src/components/MobileBottomNav.tsx') === '/ /admin /ai-audit /coverage /feedback /find-leads /inbox /outreach /paid-clients /sales-dashboard /team /templates', 'the phone menu has every entry it had');
  for (const r of ['/sales-dashboard', '/outreach', '/find-leads', '/inbox', '/coverage']) ok(canOpenRoute('sales', r), `a salesperson can still open ${r}`);
  for (const r of ['/paid-clients', '/paid-clients/x', '/team', '/admin/api-usage', '/ai-audit', '/templates', '/feedback']) ok(!canOpenRoute('sales', r), `a salesperson still cannot open ${r}`);
  for (const r of ['/paid-clients', '/team', '/admin/api-usage']) ok(canOpenRoute('admin', r), `the admin can open ${r}`);
  ok(!canOpenRoute(null, '/outreach'), 'no role, no route');
}

console.log(f ? `\n${f} FAILED` : '\nALL PASS');
if (f) process.exit(1);
