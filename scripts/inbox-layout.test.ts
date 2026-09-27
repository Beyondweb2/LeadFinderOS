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
ok(/md:h-\[calc\(100dvh-3rem\)\]/.test(inbox) && /lg:h-\[calc\(100dvh-4rem\)\]/.test(inbox), 'the Inbox is the viewport minus 3rem (sm/md padding) and 4rem (lg padding)');
ok(/md:min-h-\[560px\]/.test(inbox), 'with a floor, so a short laptop scrolls the page rather than crushing the thread');
ok(/md:min-h-0 md:flex-1 md:grid-cols-\[300px_1fr\] md:grid-rows-\[minmax\(0,1fr\)\]/.test(inbox), 'the grid takes the rest of the height, one row that may shrink');
ok(/<Card className="max-h-\[60vh\] overflow-y-auto p-1\.5 md:h-full md:max-h-none">/.test(inbox), 'the conversation list is full height from md (60vh only on phones) and scrolls itself');
ok(/<Card className="flex h-\[60vh\] min-w-0 flex-col overflow-hidden md:h-full">/.test(inbox), 'the thread panel is full height from md and clips, never widens the page');
ok(/<div ref=\{threadRef\} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">/.test(inbox), 'the message list is the part that grows and scrolls (min-h-0), so the composer stays at the bottom');

console.log('── less chrome ──');
const header = inbox.slice(inbox.indexOf('{/* Thread header */}'), inbox.indexOf('THE REPORT STATE MOVED INTO THE AI VISIBILITY CARD'));
const nameAt = header.indexOf('active.label');
const windowAt = header.indexOf('Window open · ~');
const toolsAt = header.indexOf('Open full lead details');
ok(nameAt > 0 && windowAt > nameAt && toolsAt > windowAt, 'header: the name, then the window state, then the tools');
ok(/<span className="truncate">\{active\.unassigned/.test(header) && /ml-auto flex shrink-0 items-center gap-1 rounded-full bg-green-500\/15/.test(header), 'the name truncates only against the window pill, which never shrinks');
ok(/ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1/.test(header), 'the tools wrap on a narrow screen instead of being clipped');
const more = header.slice(header.indexOf('<DropdownMenu>'), header.indexOf('</DropdownMenu>'));
for (const label of ['Open in Google Maps', 'Open website', 'Email the business', 'Open in WhatsApp app', 'Remove from inbox']) {
  ok(more.includes(`aria-label="${label}"`), `"${label}" lives in the More menu`);
  ok((header.match(new RegExp(`aria-label="${label}"`, 'g')) ?? []).length === 1, `   …and only there`);
}
ok(/onClick=\{\(\) => handleRemoveFromInbox\(active\)\}/.test(more), '   Remove from inbox keeps its handler');
for (const kept of ['Open full lead details', 'Run AI audit']) ok(header.includes(`aria-label="${kept}"`), `"${kept}" stays on the row`);
ok(/<CrawlCheckButton/.test(header) && /<ColdCallPlaybookButton/.test(header) && /<LeadOwnerControl/.test(header) && /<WelcomePackButton/.test(header), 'crawl, playbook, owner and welcome pack stay on the row');
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
