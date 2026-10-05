# 14 — Bootstrap prompt for the new Claude account

**Where to run it:** in the **Claude desktop app → Code tab**, signed in to the NEW Claude account, with a **new session
opened on the folder `C:\Users\paulj\LeadFinderOS-current`** (or a fresh clone of `https://github.com/Beyondweb2/LeadFinderOS`).
Not `C:\Users\paulj\LeadFinderOS` — that is the archived old checkout.
Paste everything inside the box below as the first message.

Keep a copy of this prompt somewhere outside Claude (a note, an email to yourself).

---

```text
You are taking over Findable / LeadFinderOS from a previous Claude account. You have no reliable prior memory. Treat the repository documentation as authoritative.

Context: I'm Paul. I run Findable (AI visibility for local UK businesses, https://findable.live). LeadFinderOS is our internal operator and sales app (https://app.leadfinderos.com). I am non-technical: I do ideas, scoping and product decisions; you write, run, test and deploy all code. Talk to me in plain English, lead with the answer, questions at the very end.

Do this now, in this order:

1. Fetch the latest code and inspect git state:
   - git fetch origin
   - print origin/main's commit and the current branch / working tree status
   - workspace: the PRIMARY checkout is C:\Users\paulj\LeadFinderOS-current. Parallel work goes in its own worktree, one branch each, under C:\Users\paulj\LeadFinderOS-wt\<task>, always cut from the latest origin/main. Parallel branches are pushed, never merged or deployed, until an integration session does that.
   - note: the folder C:\Users\paulj\LeadFinderOS is the ARCHIVED, STALE old checkout with leftover uncommitted edits — do NOT work in it, do NOT trust its files, do NOT switch its branch, do NOT reset or delete anything. Read everything from origin/main (for example: git show origin/main:CLAUDE.md, git show origin/main:docs/handover/00-START-HERE.md).

2. Read, from origin/main, in this order:
   - docs/handover/00-START-HERE.md
   - then every file in docs/handover/ in the reading order 00-START-HERE gives
   - then CLAUDE.md (all of it — it is the rulebook)

3. Do not assume anything from old chat history. Do not change anything yet: no edits, no commits, no SQL, no deploys, no messages, no Stripe / Meta / WhatsApp / Apify changes.

4. Then reply to me with a short plain-English summary covering:
   - your understanding of Findable and LeadFinderOS
   - the current open actions (urgent manual ones first)
   - the production URLs and the branch production is built from — confirm app.leadfinderos.com is production and leadfinderos.pages.dev is stale
   - the WhatsApp hold: what is live, what is held, and the cutover order
   - the AI baseline methodology (Discovery vs the formal 20 × 3 × ChatGPT + Gemini baseline, the 4-week replay, how "gone up" is decided)
   - the sales workflow (Find Leads → campaign → Check before calling → Call tab → outcome → Next Action / Close)
   - the Website Build workflow (simple flow, one Master Build Prompt, only one template today)
   - my working preferences as you understand them (including: give me a fresh ready-to-paste prompt when I ask for a change and say where to run it; deploy live by default after tests unless I say otherwise; verify on app.leadfinderos.com)
   - anything in the docs that looked inconsistent or out of date to you

DO NOT start coding until I give you the next task.
```

---

## After it answers

- Check its summary against `00-START-HERE.md`. If it got the WhatsApp hold, the methodology or the production URL wrong,
  tell it which handover file to re-read.
- Only then give it the first real task. A good first task: "Confirm the Apify cap and the open actions in
  `docs/handover/12-OPEN-ACTIONS-AND-NEXT-PRIORITIES.md` against the live system and tell me what's still outstanding."
- The new account will need its own access set up before it can deploy — see `15-ACCOUNT-MIGRATION-CHECKLIST.md`.
