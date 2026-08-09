/* ============================================================
   HALF-TYPED REPLIES.

   Paul's words: losing a message you were partway through writing is worse than losing your place,
   and it is the one bit of state worth a slightly ugly fix to never lose. So this is the suite that
   has to be right.

   ⛔ THE FAILURE THAT WOULD BE WORSE THAN LOSING IT: a draft following you into another thread,
   armed and ready to send to the wrong person. Every test below is ultimately about that.
   ============================================================ */
import { setDraft, getDraft, MAX_DRAFTS, type DraftMap } from "../src/lib/inboxDrafts.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

console.log("── A DRAFT IS KEPT, AND KEPT WHERE IT BELONGS ──");
{
  let d: DraftMap = {};
  d = setDraft(d, "conv-a", "half a mess");
  ok(getDraft(d, "conv-a") === "half a mess", "the draft comes back for its own conversation");
  ok(getDraft(d, "conv-b") === "", "and NOT for another one — the composer opens empty");
  d = setDraft(d, "conv-b", "different thread");
  ok(getDraft(d, "conv-a") === "half a mess", "two drafts coexist without touching each other");
  ok(getDraft(d, "conv-b") === "different thread", "  both readable");
}

console.log("\n── ⛔ A SUCCESSFUL SEND CLEARS IT, AND ONLY IT ──");
{
  let d: DraftMap = { "conv-a": "keep me", "conv-b": "about to send" };
  d = setDraft(d, "conv-b", "");                       // what the send path does
  ok(!("conv-b" in d), "the sent thread's draft is DELETED, not stored as an empty string");
  ok(getDraft(d, "conv-a") === "keep me", "the other thread is untouched");
  ok(Object.keys(d).length === 1, "and nothing else is left behind");
}

console.log("\n── ⛔ WHITESPACE IS NOT A MESSAGE, BUT SPACING INSIDE ONE IS KEPT ──");
{
  let d: DraftMap = {};
  for (const blank of ["", "   ", "\n", "\t \n "]) {
    d = setDraft({ "conv-a": "prior" }, "conv-a", blank);
    ok(!("conv-a" in d), `${JSON.stringify(blank)} clears the draft rather than resurrecting a blank one`);
  }
  d = setDraft({}, "conv-a", "line one\n\nline three ");
  ok(d["conv-a"] === "line one\n\nline three ", "  but a real draft keeps its exact spacing and newlines");
}

console.log("\n── ⛔ NO CONVERSATION OPEN MEANS NOWHERE TO PUT IT ──");
/* The case that made me delete a setText('') in startFromLead: it fired AFTER the key changed, so a
   naive implementation cleared the thread the operator had just left. */
{
  const before: DraftMap = { "conv-a": "mine" };
  const after = setDraft(before, null, "orphan");
  ok(after === before || JSON.stringify(after) === JSON.stringify(before),
    "a write with no conversation open changes nothing");
  ok(getDraft(before, null) === "", "and reading with no conversation open gives an empty composer");
}

console.log("\n── IT NEVER MUTATES THE MAP IT WAS GIVEN ──");
/* It feeds a React state setter; a mutated previous state is a render that does not happen. */
{
  const before: DraftMap = { "conv-a": "one" };
  const snapshot = JSON.stringify(before);
  const after = setDraft(before, "conv-b", "two");
  ok(JSON.stringify(before) === snapshot, "the input object is unchanged");
  ok(after !== before, "  and a new object comes back");
}

console.log("\n── ⚠️ THE CAP IS A BACKSTOP, NOT A LIMIT ANYONE MEETS ──");
{
  let d: DraftMap = {};
  for (let i = 0; i < MAX_DRAFTS + 12; i++) d = setDraft(d, `conv-${i}`, `draft ${i}`);
  ok(Object.keys(d).length === MAX_DRAFTS, `${MAX_DRAFTS + 12} drafts trim to ${MAX_DRAFTS}`);
  ok(!("conv-0" in d), "the oldest is dropped first");
  ok(getDraft(d, `conv-${MAX_DRAFTS + 11}`) === `draft ${MAX_DRAFTS + 11}`, "the newest survives");
}

console.log("\n── ⛔ A CORRUPT OR MISSING STORE NEVER BREAKS THE COMPOSER ──");
/* localStorage is user-writable and survives deploys, so the shapes below are all reachable. An
   `undefined` reaching a <Textarea value> makes React switch to an uncontrolled input and warn. */
ok(getDraft({} as DraftMap, "conv-a") === "", "an empty map gives an empty string");
ok(getDraft({ "conv-a": 42 as unknown as string }, "conv-a") === "", "a non-string entry gives an empty string");
ok(getDraft(null as unknown as DraftMap, "conv-a") === "", "a null map does not throw");
ok(typeof getDraft({}, "conv-a") === "string", "the composer always receives a string, never undefined");

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
