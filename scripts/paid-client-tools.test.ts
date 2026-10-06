/* PAID CLIENT TOOLS + ADMIN NAV CLEANUP (2026-10-06, improve/operator-design-consistency-admin-nav).
   Review replies, the page generator and the page plan stopped being admin destinations and became the
   Tools of Paid Clients (src/lib/paidClientTools.ts). This pins:
     1. none of the three is a menu item any more (sidebar, phone menu);
     2. the old URLs redirect into Paid Clients with their query string, inside the role gate;
     3. Paid Clients really carries all three — the Tools tab (every client) and each client's page
        (scoped) — and the capability itself (edge functions, actions, config) was not deleted;
     4. a salesperson still cannot open any of it;
     5. the shared visual primitives draw from ONE token source.
   Run: npx tsx scripts/paid-client-tools.test.ts */
import { existsSync, readFileSync } from 'node:fs';
import { CLIENT_TOOLS_SECTION, PAID_CLIENT_TOOLS, clientToolUrl, legacyToolRedirect, paidClientToolUrl, toolOf } from '../src/lib/paidClientTools.ts';
import { canOpenRoute } from '../src/lib/access.ts';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('PASS ' + m); else { f++; console.log('FAIL ' + m); } };
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const OLD = ['/review-replies', '/page-generator', '/page-plan'];

console.log('── 1. NOT IN THE MENUS ──');
{
  const side = read('src/components/AppSidebar.tsx');
  for (const u of OLD) ok(!side.includes(`url: '${u}'`), `the sidebar has no ${u} item`);
  ok(/title: 'Paid clients', url: '\/paid-clients'/.test(side), 'Paid clients is still in the sidebar');
  const mobile = read('src/components/MobileBottomNav.tsx');
  for (const u of OLD) ok(!mobile.includes(`url: '${u}'`), `the phone menu has no ${u} item`);
  /* The phone menu's admin list is the non-sales branch; Paid clients is added there, never to sales. */
  const salesBranch = mobile.slice(mobile.indexOf('const moreNavItems = role === \'sales\''), mobile.indexOf(': [', mobile.indexOf('const moreNavItems = role === \'sales\'')));
  ok(!salesBranch.includes('/paid-clients'), 'Paid clients is NOT in a salesperson\'s phone menu');
  ok(mobile.includes("{ title: 'Paid clients', url: '/paid-clients', icon: UsersRound }"), 'Paid clients is in the admin phone menu (where the tools now live)');
  const palette = read('src/components/CommandPalette.tsx');
  for (const u of OLD) ok(!palette.includes(`'${u}'`), `the command palette does not offer ${u}`);
}

console.log('\n── 2. OLD URLS REDIRECT — never a 404, never a dead page ──');
{
  ok(legacyToolRedirect('/review-replies', '') === '/paid-clients?tool=review-replies', '/review-replies → the Review replies tool');
  ok(legacyToolRedirect('/page-plan', '') === '/paid-clients?tool=page-plan', '/page-plan → the Page plan tool');
  ok(legacyToolRedirect('/page-generator/', '') === '/paid-clients?tool=page-generator', 'a trailing slash still redirects');
  const deep = legacyToolRedirect('/page-generator', '?mode=service&client=LEAD-1&page_key=lock%20changes%7Cst%20neots')!;
  const u = new URL(deep, 'https://x');
  ok(u.pathname === '/paid-clients' && u.searchParams.get('tool') === 'page-generator', 'an old generator deep link opens the generator');
  ok(u.searchParams.get('mode') === 'service' && u.searchParams.get('client') === 'LEAD-1' && u.searchParams.get('page_key') === 'lock changes|st neots', '…with the same client and page (the seed is carried over exactly)');
  const qa = new URL(legacyToolRedirect('/page-generator', '?mode=qa&client=AUD-1&question=How%3F%20%26%20why')!, 'https://x');
  ok(qa.searchParams.get('question') === 'How? & why' && qa.searchParams.get('client') === 'AUD-1', 'a Q&A deep link carries its audit and question');
  ok(new URL(legacyToolRedirect('/page-plan', '?tool=evil')!, 'https://x').searchParams.getAll('tool').join() === 'page-plan', 'an old URL cannot smuggle a different tool');
  ok(legacyToolRedirect('/outreach', '') === null && legacyToolRedirect('/page-planner', '') === null, 'any other path is not a retired tool');

  const app = read('src/App.tsx');
  for (const u of OLD) ok(app.includes(`<Route path="${u}" element={<LegacyToolRedirect />} />`), `${u} is a redirect route`);
  ok(!/pages\/(ReviewReply|PageGenerator|PagePlanQueue)/.test(app), 'App.tsx no longer imports the old pages');
  for (const p of ['src/pages/ReviewReply.tsx', 'src/pages/PageGenerator.tsx', 'src/pages/PagePlanQueue.tsx']) ok(!existsSync(p), `${p} is gone (moved, not copied — one of each tool)`);
  /* Inside the operator shell (ProtectedRoute + RequireAccess), before the shell closes. */
  const shellOpen = app.indexOf('<RequireAccess>'), shellClose = app.indexOf('<Route path="/admin"');
  for (const u of OLD) { const at = app.indexOf(`<Route path="${u}"`); ok(at > shellOpen && at < shellClose, `${u} redirects INSIDE the role-gated shell`); }
  const redirect = read('src/components/LegacyToolRedirect.tsx');
  ok(redirect.includes('legacyToolRedirect(pathname, search)') && redirect.includes('replace'), 'the redirect replaces history (Back does not bounce)');
}

console.log('\n── 3. PAID CLIENTS CARRIES ALL THREE ──');
{
  ok(PAID_CLIENT_TOOLS.join() === 'page-plan,page-generator,review-replies' && toolOf('nope') === null && toolOf(null) === null, 'three tools, an unknown key is never guessed into one');
  ok(paidClientToolUrl('review-replies') === '/paid-clients?tool=review-replies', 'the Tools tab URL');
  const c = new URL(clientToolUrl('L 1', 'page-generator', { mode: 'service', client: 'L 1' }), 'https://x');
  ok(c.pathname === '/paid-clients/L%201' && c.searchParams.get('section') === CLIENT_TOOLS_SECTION && c.searchParams.get('tool') === 'page-generator' && c.searchParams.get('client') === 'L 1', "a client's own tool URL (section, tool, seed)");

  const list = read('src/pages/PaidClients.tsx');
  ok(list.includes("toolOf(searchParams.get('tool'))"), 'the list reads ?tool=');
  ok(list.includes("{tool === 'page-plan' && <PagePlanTool />}") && list.includes("{tool === 'page-generator' && <PageGeneratorTool />}") && list.includes("{tool === 'review-replies' && <ReviewReplyTool />}"), 'the Tools tab renders all three UNSCOPED (with pickers — lead-less clients included)');

  const hub = read('src/pages/ClientHub.tsx');
  ok(/<Stage k="pages" title="Pages & reviews"/.test(hub) && hub.includes('<ClientTools lead={lead}/>'), "each client's page has Pages & reviews");
  ok(!/title="[0-9]+\. (Pages|Review)/.test(hub), '…as a tool, not a numbered delivery stage (review replies are not a deliverable)');
  ok(hub.includes('<PagePlanTool key={auditId} scopeAuditId={auditId} onHandoff='), 'the page plan is scoped to the client\'s baseline, and hands off in place');
  ok(hub.includes('<PageGeneratorTool key={lead.id} scope={{ leadId: lead.id, auditId, businessName: lead.business_name ?? null }}/>'), 'the generator is scoped to the client');
  ok(hub.includes("<ReviewReplyTool key={lead.id} businessName={lead.business_name ?? ''}/>"), 'review replies open with the business name filled in');

  /* The tools themselves: every capability the pages had. */
  const plan = read('src/components/clientTools/PagePlanTool.tsx');
  for (const a of ['qa_clients', 'plan_get', 'plan_build', 'plan_update', 'plan']) ok(plan.includes(`action: '${a}'`), `page plan still calls page-generator ${a}`);
  ok(plan.includes('downloadHtmlDocAsPdf') && plan.includes('merge_into') && plan.includes("set: { wave:"), 'page plan keeps the PDF, merge and wave moves');
  ok(plan.includes('if (onHandoff) onHandoff(target); else navigate(handoffUrl(target)!);'), '"Build this page" still hands off (in place, or to the Tools tab)');
  const gen = read('src/components/clientTools/PageGeneratorTool.tsx');
  for (const a of ['clients', 'plan', 'generate', 'qa_clients', 'qa_plan', 'qa_generate']) ok(gen.includes(`action: '${a}'`), `page generator still calls page-generator ${a}`);
  ok(gen.includes("supabase.functions.invoke('scan-site-details'") && gen.includes('suggestCredentials('), 'the generator keeps the site scan and the trade credentials');
  ok(gen.includes('setSearchParams((p) => { const n = new URLSearchParams(p); PAGEGEN_SEED_KEYS.forEach((k) => n.delete(k)); return n; }'), 'the one-shot seed strips ONLY its own keys (the host keeps ?tool= / ?section=)');
  ok(gen.includes("const fits = !scope || client === (m === 'qa' ? scope.auditId : scope.leadId);"), "a client's page ignores a seed for another client");
  const rr = read('src/components/clientTools/ReviewReplyTool.tsx');
  ok(rr.includes("supabase.functions.invoke('review-reply'") && rr.includes("res.verdict === 'dont_reply'") && rr.includes("res?.error === 'no_credits'"), 'review replies keep the drafting, the don\'t-reply verdict and the credits banner');

  /* No backend capability deleted. */
  for (const fn of ['page-generator', 'review-reply', 'scan-site-details']) ok(existsSync(`supabase/functions/${fn}/index.ts`), `edge function ${fn} still exists`);
  const cfg = read('supabase/config.toml');
  ok(/\[functions\.page-generator\]/.test(cfg) && /\[functions\.review-reply\]/.test(cfg), 'their config.toml entries are untouched');
  for (const lib of ['src/lib/pagePlan.ts', 'src/lib/pagePlanQueue.ts', 'src/lib/pagePlanHandoff.ts', 'src/lib/pagePlanReportHtml.ts', 'src/lib/qaAnswerGuard.ts']) ok(existsSync(lib), `${lib} still exists`);

  /* No internal link points at a retired page. */
  for (const p of ['src/pages/ClientHub.tsx', 'src/components/SimpleWebsiteBuild.tsx', 'src/lib/simpleBuild.ts', 'src/components/delivery/DeliveryChecklist.tsx', 'src/pages/Baseline.tsx', 'src/lib/pagePlanHandoff.ts']) {
    const s = read(p);
    ok(!/['"`]\/(page-generator|page-plan|review-replies)[?'"`]/.test(s), `${p} links nowhere retired`);
  }
}

console.log('\n── 4. ROLES — nothing new reaches a salesperson ──');
{
  for (const u of ['/paid-clients', '/paid-clients/abc', ...OLD]) {
    ok(!canOpenRoute('sales', u), `sales cannot open ${u}`);
    ok(canOpenRoute('admin', u), `admin can open ${u}`);
  }
  ok(!canOpenRoute(null, '/paid-clients?tool=page-plan'), 'no role, no tools');
}

console.log('\n── 5. ONE LOOK — the primitives draw from one token source ──');
{
  const ui = read('src/components/operator/ui.tsx');
  ok(ui.includes("import { TONE, type Tone } from '@/components/salesDash/primitives';") && !/const TONE\b/.test(ui), 'operator/ui.tsx uses the dashboards\' TONE — no second palette');
  ok(ui.includes("export { TONE, SURFACE, Figure, Empty, KpiCard, PageHeader, SectionHeading, Segmented, Dot } from '@/components/salesDash/primitives';"), 'and re-exports the dashboard primitives');
  const leaf = read('src/components/salesDash/primitives.tsx');
  ok(/export const TONE\b/.test(leaf) && !/export const TONE\b/.test(read('src/components/salesDash/ui.tsx')), 'TONE is defined once, in the leaf');
  /* A LEAF: a component rendered from plain data (a test under tsx) can use the look without the app's wiring. */
  for (const [n, f] of [['operator/ui', ui], ['salesDash/primitives', leaf]] as const) {
    const imports = f.split('\n').filter((l) => /^\s*(import|export) .* from /.test(l)).map((l) => l.match(/from '([^']+)'/)?.[1] ?? '');
    ok(imports.length > 0 && imports.every((m) => ['react', '@/lib/utils', '@/components/ui/dialog', '@/components/salesDash/primitives'].includes(m)), `${n} imports only leaf modules (${imports.join(', ')}) — no auth, client or collapsible`);
  }
  const dialog = read('src/components/ui/dialog.tsx');
  ok(dialog.includes('bg-card') && dialog.includes('sm:rounded-[1.25rem]') && dialog.includes('max-h-[100dvh] overflow-y-auto'), 'every dialog: the card surface, rounder, never taller than the screen');
  ok(dialog.includes('flex flex-wrap items-center justify-end gap-2') && !dialog.includes('flex-col-reverse'), 'dialog actions wrap side by side (no full-width stack on a phone)');
  ok(dialog.includes('h-9 w-9') && dialog.includes('rounded-full'), 'the close button is a 36px touch target');
  const alert = read('src/components/ui/alert-dialog.tsx');
  ok(alert.includes('bg-card') && !alert.includes('flex-col-reverse'), 'confirmation dialogs match');
  const tabs = read('src/components/ui/tabs.tsx');
  ok(tabs.includes('rounded-full bg-muted/70') && tabs.includes('data-[state=active]:bg-card'), 'tabs are the dashboards\' segmented control');
  const card = read('src/components/ui/card.tsx');
  ok(card.includes('rounded-2xl border border-border/70 bg-card'), 'the base Card has the dashboards\' corner and border');
  /* The restyled surfaces import the shared primitives rather than inventing local colours. */
  for (const p of ['src/pages/PaidClients.tsx', 'src/pages/ClientHub.tsx', 'src/components/clientTools/PagePlanTool.tsx', 'src/components/clientTools/PageGeneratorTool.tsx', 'src/components/clientTools/ReviewReplyTool.tsx']) {
    ok(read(p).includes("from '@/components/operator/ui'"), `${p} draws from operator/ui`);
  }
}

console.log(f ? `\n${f} FAILED` : '\nALL PASS');
if (f) process.exit(1);
