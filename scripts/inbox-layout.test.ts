/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE INBOX FILLS THE SCREEN, AND THE COMPOSER HOLDS ONE THING AT A TIME (2026-09-27).

   The measured proof is a render (1920×1080: both panels 972 px, 32 px below them = the shell's own
   padding, no page scroll, no horizontal overflow; before, both were a fixed 60vh = 648 px). This
   suite fences the rules that produce it, so a later edit cannot quietly bring the dead space back:
     · from md up the page is the viewport minus AppLayout's vertical padding, and it must be the
       SAME padding AppLayout actually uses;
     · the panels take the grid's full height and scroll inside themselves (no fixed 60vh at md);
     · the header puts the name and the window state first; the less-used links are in one menu;
     · the paperclip exists only in the open-window branch, beside the mic, and the three (text,
       voice, file) hide each other rather than stacking.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const inbox = read('src/pages/Inbox.tsx');
const shell = read('src/components/AppLayout.tsx');

console.log('── the page fills the viewport ──');
ok(/className="container [^"]*py-4 sm:py-6 lg:py-8"/.test(shell), 'AppLayout pads the page py-6 at sm and py-8 at lg (the offsets below assume exactly this)');
/* 2026-09-28 (Sales Experience release 3): 3.5rem more at md/lg leaves a clear strip under the Inbox for
   the bottom-right notification bell, so it never covers the composer's Send button. */
ok(/md:h-\[calc\(100dvh-6\.5rem\)\]/.test(inbox) && /lg:h-\[calc\(100dvh-7\.5rem\)\]/.test(inbox), 'the Inbox is the viewport minus the padding (3rem md / 4rem lg) and the bell strip (3.5rem)');
ok(/md:min-h-\[560px\]/.test(inbox), 'with a floor, so a short laptop scrolls the page rather than crushing the thread');
ok(/md:min-h-0 md:flex-1 md:grid-cols-\[300px_1fr\] md:grid-rows-\[minmax\(0,1fr\)\]/.test(inbox), 'the grid takes the rest of the height, one row that may shrink');
/* 2026-09-28 (Sales Experience): phones no longer STACK the two panels at 60vh each — they switch
   list ↔ thread like a messaging app (docs/sales-experience.md §2). From md the rule is unchanged. */
ok(/<Card className=\{cn\('overflow-y-auto p-1\.5 md:h-full md:max-h-none', active \? 'hidden md:block' : 'min-h-\[50vh\]'\)\}>/.test(inbox), 'the conversation list is full height from md and scrolls itself; on a phone it hides while a thread is open');
ok(/<Card className=\{cn\('min-w-0 flex-col overflow-hidden md:flex md:h-full', active \? 'flex h-\[calc\(100dvh-10\.5rem\)\]' : 'hidden'\)\}>/.test(inbox), 'the thread panel is full height from md and clips, never widens the page; on a phone it fills the screen only when open');
ok(/<div ref=\{threadRef\} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">/.test(inbox), 'the message list is the part that grows and scrolls (min-h-0), so the composer stays at the bottom');

console.log('── the top bar (2026-10-01) ──');
const topBar = inbox.slice(inbox.indexOf('THE TOP BAR (2026-10-01)'), inbox.indexOf('BOTH ROLES SEE A PAUSED QUEUE'));
const filtersAt = topBar.indexOf('aria-label="Filter conversations"');
ok(filtersAt > 0 && topBar.indexOf('handleSendNow') < filtersAt && topBar.indexOf('setNewOpen') < filtersAt, 'Send now and New sit on the title row, above the filter group');
ok(/<div className="flex shrink-0 items-center gap-2">/.test(topBar), '   in a group that never shrinks or wraps');
const filterGroup = topBar.slice(filtersAt);
for (const label of ['Lead status', 'Next action due', 'Next action type', 'Sort conversations']) {
  ok(filterGroup.includes(`aria-label="${label}"`), `"${label}" is in the filter group`);
}
ok(!/text-xs|text-\[1[01]px\]/.test(filterGroup), 'no filter shrinks its own text: every control on the bar is text-sm');
ok((filterGroup.match(/'h-9/g) ?? []).length === 5, 'all five filters are h-9');
const toggle = readFileSync(new URL('../src/components/AutoReplyToggle.tsx', import.meta.url), 'utf8');
ok(/order-last flex w-full flex-wrap/.test(toggle) && !/text-\[11px\]/.test(toggle), 'the reply rule takes its own row on a narrower screen, at the bar\'s text size');
ok(/role="tablist" aria-label="Show conversations"/.test(inbox) && /mb-1\.5 grid grid-cols-2 gap-1 px-0\.5" role="tablist"/.test(inbox), 'the four list views are a 2 × 2 grid (no single tab orphaned on a second line)');

console.log('── less chrome ──');
const header = inbox.slice(inbox.indexOf('{/* Thread header */}'), inbox.indexOf('THE REPORT STATE MOVED INTO THE AI VISIBILITY CARD'));
const nameAt = header.indexOf('active.label');
const windowAt = header.indexOf('Window open · ~');
const toolsAt = header.indexOf('Open prospect workspace');
ok(nameAt > 0 && windowAt > nameAt && toolsAt > windowAt, 'header: the name, then the window state, then the tools');
ok(/<span className="truncate">\{active\.unassigned/.test(header) && /ml-auto flex shrink-0 items-center gap-1 rounded-full bg-green-500\/15/.test(header), 'the name truncates only against the window pill, which never shrinks');
ok(/ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1/.test(header), 'the tools wrap on a narrow screen instead of being clipped');
const more = header.slice(header.indexOf('<DropdownMenu>'), header.indexOf('</DropdownMenu>'));
for (const label of ['Open in Google Maps', 'Open website', 'Email the business', 'Open in WhatsApp app', 'Remove from inbox']) {
  ok(more.includes(`aria-label="${label}"`), `"${label}" lives in the More menu`);
  ok((header.match(new RegExp(`aria-label="${label}"`, 'g')) ?? []).length === 1, `   …and only there`);
}
ok(/onClick=\{\(\) => handleRemoveFromInbox\(active\)\}/.test(more), '   Remove from inbox keeps its handler');
for (const kept of ['Open prospect workspace', 'Run AI audit']) ok(header.includes(`aria-label="${kept}"`), `"${kept}" stays on the row`);
ok(/<CrawlCheckButton/.test(header) && /<LeadOwnerControl/.test(header), 'crawl and owner stay on the row');
ok(!/<ColdCallPlaybookButton/.test(header) && !/<WelcomePackButton/.test(header), 'the call script and welcome pack are NOT repeated on the row (UI cleanup 2026-09-29: both live in the Prospect workspace)');
ok(/copySignupLink/.test(header), 'the sign-up link (and its warning dot) stays on the row');

console.log('── the composer ──');
const open = inbox.slice(inbox.indexOf('{win.open ? (\n                  <div className="space-y-2">'), inbox.indexOf('Outside the 24h window'));
const closed = inbox.slice(inbox.indexOf('Outside the 24h window'), inbox.indexOf('Outside the 24h window') + 400);
ok(open.length > 0 && /<AttachmentPicker key=\{active\.key\}/.test(open), 'the paperclip is in the open-window branch, keyed by conversation');
ok(!/AttachmentPicker/.test(closed), 'and not in the closed-window branch');
ok(/free text, files and voice notes aren’t allowed/.test(inbox), 'the closed window says files need an open window');
ok(open.indexOf('<InboxComposer') < open.indexOf('<AttachmentPicker') && open.indexOf('<AttachmentPicker') < open.indexOf('<VoiceNoteRecorder'), 'order on the row: text, paperclip, mic');
ok(/\(voiceActive \|\| attachActive\) && active\.leadId && 'hidden'/.test(open), 'a recording or a staged file hides the text box (still mounted)');
ok(/cn\('contents', voiceActive && '\[&>\*\]:hidden'\)\}>\s*<AttachmentPicker/.test(open) && /cn\('contents', attachActive && '\[&>\*\]:hidden'\)\}>\s*<VoiceNoteRecorder/.test(open), 'the mic and the paperclip hide each other');
ok(/\{templatesOpen && \(/.test(open) && /Send a template/.test(open), 'inside the window the template sender opens on demand');
ok(/useEffect\(\(\) => \{ setTemplatesOpen\(false\); \}, \[activeKey\]\);/.test(inbox), '   and closes on a thread switch');
ok(/\{templatePicker\}/.test(closed) || inbox.slice(inbox.indexOf('Outside the 24h window')).indexOf('{templatePicker}') < 300, 'outside the window the template sender is always shown');

const picker = read('src/components/AttachmentPicker.tsx');
console.log('── the picker never sends on pick ──');
const pickFn = picker.slice(picker.indexOf('const pick = '), picker.indexOf('const send = '));
ok(pickFn.length > 0 && !/onSend\(/.test(pickFn), 'choosing a file only stages it');
ok(/aria-label="Send file"/.test(picker) && /aria-label="Remove file"/.test(picker) && /aria-label="Change file"/.test(picker), 'Send, Remove and Change are separate buttons');
ok(/accept=\{ATTACHMENT_ACCEPT\}/.test(picker), 'the file dialog offers only the server-allowed types');
ok(/if \(res\.ok\) \{ clear\(\); return; \}/.test(picker), 'the staged file clears only on a confirmed send');

console.log(f ? `\n${f} FAILURE(S)` : '\nall passed');
process.exit(f ? 1 : 0);
