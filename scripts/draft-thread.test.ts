/* THE DRAFTER'S THREAD (src/lib/draftThread.ts) and "the pitch is owed until a pitch was SENT" (Paul, 2026-10-22).
   Robina's Motoring School, 21 Oct, rows as stored: the opener row reads 'failed' (Meta's early 'failed' webhook; the per-message
   ratchet never lets 'read' replace it) while its receipt row says 'read', and she replied "Yes, how can I help?". The drafter
   dropped the opener, so her reply had nothing of ours before it and got the go-on line ("I had a look and saw that you weren't
   coming up when I asked ai...") instead of the first-reply pitch. Pure: no model, no DB. */
import { pickMove, type MoveEvidence, type MoveThreadMsg } from '../src/lib/replyMove.ts';
import { failedWamids, isOurs, moveThread, reachedThem, withReceipts, type DraftThreadRow } from '../src/lib/draftThread.ts';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('  PASS ' + m); else { f++; console.log('  FAIL ' + m); } };

const ROBINA_EV = { businessName: "Robina's Motoring School", trade: 'Driving instructors', town: 'Woking', engineWords: 'ai', named: { named: 0, valid: 3 },
  missed: { engine: 'gemini', question: 'Who is the best driving instructor in Woking?' },
  competitors: ['Billie Smith Driving Solutions', 'FADI Driving School', 'Wow Drive Woking'], hookAlreadySent: false, findings: [], hasWebsite: true, ownerName: null,
  foundOnGoogle: true, site: { state: 'issues', issues: ['some pages have no title'] } } as unknown as MoveEvidence;
const WAMID = 'wamid.HBgMNDQ3ODU1MDI3NzIzFQIAERgSOEY4Qzc5N0UxMkNBNjZCRUYxAA==';
const row = (p: Partial<DraftThreadRow> & Pick<DraftThreadRow, 'id' | 'created_at' | 'direction'>): DraftThreadRow =>
  ({ body: null, message_type: 'text', template_name: null, status: null, lead_id: 'robina', ...p });
const OPENER = row({ id: 'op', created_at: '2026-10-21T07:42:03Z', direction: 'outbound', body: '[initial_contact_short]', message_type: 'template',
  template_name: 'initial_contact_short', status: 'failed', wa_message_id: WAMID });
const REPLY = row({ id: 'in', created_at: '2026-10-21T09:37:04Z', direction: 'inbound', body: 'Yes, how can I help?', status: 'received' });
const run = (thread: MoveThreadMsg[]) => pickMove({ thread, suppressed: false, aiSentSinceWin: 0, evidence: ROBINA_EV, nowMs: Date.parse('2026-10-22T07:00:00Z') });

console.log('1. the receipt rule');
{
  ok(reachedThem('sent', null) && reachedThem('read', null), 'a real send reached them');
  ok(reachedThem('failed', 'read') && reachedThem('failed', 'delivered'), "'failed' with a delivered / read receipt reached them");
  ok(!reachedThem('failed', 'failed') && !reachedThem('failed', 'sent') && !reachedThem('failed', null) && !reachedThem('failed', undefined), "'failed' with no proof did not");
  ok(!reachedThem(null, 'read') && !reachedThem('pending', 'read'), 'only a stored failed is rescued by its receipt (an absent status is not a send)');
  ok(failedWamids([OPENER, REPLY]).join() === WAMID, 'only the failed outbound rows with a message id are looked up');
}

console.log("2. Robina's Motoring School: the live rows");
{
  const before = moveThread([OPENER, REPLY], REPLY);
  ok(before.length === 1 && before[0].from === 'them', 'without the receipt the opener is dropped (the bug)');
  const was = run(before);
  ok(was.move !== 'first_reply_pitch', `…and her reply was not read as a first reply (got ${was.move}/${was.read}: the go-on line Paul saw)`);

  const rows = withReceipts([OPENER, REPLY], new Map([[WAMID, 'read']]));
  ok(isOurs(rows[0]), "with whatsapp_sends.delivery_status = 'read' the opener is ours");
  const thread = moveThread(rows, REPLY);
  ok(thread.length === 2 && thread[0].from === 'us' && thread[0].templateName === 'initial_contact_short', 'the drafter sees the opener, then her reply');
  const p = run(thread);
  const text = p.fixedText ?? '';
  ok(p.move === 'first_reply_pitch' && !p.needsYou && !p.noDraft, `"Yes, how can I help?" gets the first-reply pitch (got ${p.move}/${p.read})`);
  ok(/^Hi mate,/.test(text), 'the approved greeting (no name given: "Hi mate,")');
  ok(/I asked google ai "Who is the best driving instructor in Woking\?" and it mentioned Billie Smith Driving Solutions, FADI Driving School and Wow Drive Woking\./.test(text), 'the competitor names from the missed search');
  ok(/AI is recommending your competitors instead\./.test(text), '"AI is recommending your competitors instead." (0 of 3)');
  ok(/I looked into why and found some pages have no title\./.test(text), 'the issues line: one real issue is one sentence (lean pitch, 2026-10-23)');
  ok(!/voice note|either way/i.test(text), 'no voice-note line in the first pitch (2026-10-23)');
  ok(/I specialise in getting local businesses to show up in those results/.test(text), 'the "I specialise..." line');
  ok(/Are you with an agency, or do you manage the website yourself\?/.test(text), 'the agency question');
  ok(!/\bai\b/.test(text.replace('I asked google ai ', '')), 'never a lower-case "ai" (apart from the hook\'s own "google ai", Paul 2026-10-26)');
  ok(!/ChatGPT|Gemini|Google AI|Perplexity|Copilot|Claude/i.test(text.replace('I asked google ai ', 'I asked AI ')), 'no other AI brand names (the hook names its own engine, Paul 2026-10-26)');
  ok(!/I had a look and saw/.test(text), 'not the go-on line');
}

console.log('3. the pitch stays owed until a pitch was SENT');
{
  const pitchRow = (status: string | null, receipt?: string) => {
    const r = row({ id: 'p', created_at: '2026-10-21T10:00:00Z', direction: 'outbound', body: 'Hi mate,\n\nI asked AI ...', status, wa_message_id: 'wamid.pitch' });
    return receipt ? withReceipts([r], new Map([['wamid.pitch', receipt]]))[0] : r;
  };
  const opener = { ...OPENER, status: 'read' };
  const again = row({ id: 'in2', created_at: '2026-10-21T11:00:00Z', direction: 'inbound', body: 'How can I help', status: 'received' });
  for (const [label, r] of [['failed', pitchRow('failed')], ['failed, receipt failed', pitchRow('failed', 'failed')], ['null status (never sent)', pitchRow(null)], ['pending', pitchRow('pending')]] as const) {
    const p = run(moveThread([opener, REPLY, r, again], again));
    ok(p.move === 'first_reply_pitch', `a ${label} pitch leaves the pitch owed (got ${p.move})`);
  }
  const sent = run(moveThread([opener, REPLY, pitchRow('sent'), again], again));
  ok(sent.move !== 'first_reply_pitch', `a SENT pitch ends it: no repeat pitch (got ${sent.move})`);
  const proven = run(moveThread([opener, REPLY, pitchRow('failed', 'read'), again], again));
  ok(proven.move !== 'first_reply_pitch', `a pitch whose receipt says read was sent: no repeat pitch (got ${proven.move})`);
}

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log('\nall passed');
