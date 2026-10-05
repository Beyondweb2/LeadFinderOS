# 11 — How Paul wants Claude to work

*Written 2026-10-05 for the account handover. Sources: Paul's handover brief (2026-10-05), CLAUDE.md §2–§3, and the
previous account's saved feedback notes. Where an older rule and Paul's newest instruction disagree, the newest wins and
this file says so.*

## Who Paul is

- Paul runs Findable. He is **non-technical**: he does ideas, scoping, plan review and product judgement. Claude writes,
  runs, tests, commits and deploys all code.
- **Paul never runs terminal commands.** Never hand him a command to run as the normal way of doing something. If a step
  truly needs him (a dashboard click, a sign-in, a payment setting), say exactly where to click.
- Paul often works with Claude in two places: a chat where he thinks things through, and Claude Code sessions that do the
  work. That is why the "ready-to-paste prompt" rule below exists.

## How to talk to him

- **Plain English. Lead with the answer.** Minimal jargon; when a technical word is unavoidable, explain it in brackets in
  everyday terms ("an edge function (a small program that runs on the server)").
- Explain technical actions in layman's terms: what you did, why, and what it means for him.
- **Questions go at the very end**, never buried in the middle.
- Short and practical beats long and thorough. No fluff, no sales talk, no "Great question".
- Report faithfully: tests failed → say so with the output; a step was skipped → say so; done and verified → say it plainly.
  If nobody has *seen* a screen (Claude can only read page text here), say "nobody has seen it on screen".

## Prompts for other Claude sessions

- **If Paul asks for a change, ALWAYS give him a fresh, ready-to-paste prompt** that a Claude Code session can run as-is.
- **Say exactly where to run it** — e.g. "Paste into a NEW Claude Code session opened on `C:\Users\paulj\LeadFinderOS`."
- **Don't give a prompt when none is needed** (e.g. he asked a question, or the work is already done in this session).
- Paul likes prompts that cover **a whole coherent pass**, not endless micro-prompts.
- **Parallelise only when it is genuinely safe** — separate branches, no shared files, no dependency between them. Once
  dependencies matter, run **one session at a time**.

## How to do the work

- **Start from the latest production `main`** after any release. Never work from a stale branch or the stale primary
  checkout (`C:\Users\paulj\LeadFinderOS` is hundreds of commits behind — see `09-PRODUCTION-AND-DEPLOYMENT.md`).
- One task = one named branch in its own git worktree under `C:\Users\paulj\LeadFinderOS-wt\<task>`. Never touch another
  session's branch or worktree.
- **Preserve existing good functionality** — read the code before changing it; don't rewrite blindly. Most rules in this
  codebase exist because something went wrong once (`docs/traps.md`).
- **Complex backend is fine; the operator UI must stay simple.** Hide internal complexity from humans. The pattern Paul
  liked most recently: "complexity in the background, simple for the person" (Website Build simple view, Sales workspace v2).
- **Sales UI:** modern, practical, colourful, easy — not retro, not cluttered. One fact drawn once; one Next Action; one
  status pill.
- **Preserve Findable's truth standards:** never invent facts about a client, never promise rankings / citations /
  recommendations, never present a Discovery guess as a confirmed service, never hedge the guarantee.

## Plan first — then build the whole thing

- For a **new piece of work**: investigate, show ONE plan (what you found, steps, risks, decisions needed), then **stop**
  for Paul's OK. Push back if his ask is wrong or there is a better way.
- Once approved: **build the whole thing in one go**, self-checking as you go. No half-built UI, no leftover TODOs.
- When Paul's message is itself a complete brief (a pasted prompt with scope and authorisations), it IS the approval —
  carry it out.
- **Any plan approved earlier must have its numbers re-derived from the live database** by the session that builds it.

## Deploying — Paul's current default (2026-10-05)

- ✅ **When Paul asks for implementation work, deploy it live by default** after the tests pass: commit → push `main` →
  deploy (edge functions by hand, SQL first) → **verify the real production URL** (`https://app.leadfinderos.com`).
  Do not do this when he says not to, when the session is explicitly planning-only, or when deploying is unsafe.
  *(This replaces the older "hard stop before every merge/push/deploy" wording in CLAUDE.md §2 for ordinary
  implementation work.)*
- **Production truth = `https://app.leadfinderos.com`.** Never verify against the stale `https://leadfinderos.pages.dev`.
- Every deploy that changes what someone sees adds a What's New entry (`src/lib/whatsNew.ts`) with its report.

## Still a hard stop — ask first

Even with the deploy-by-default rule, stop and ask Paul before anything irreversible or outward-facing he has not
explicitly authorised in the brief:

- destructive SQL (drop, truncate, delete, rewriting rows) — show him first;
- deleting data, files, branches, Cloudflare projects, edge functions;
- anything touching money: Stripe settings, refunds, subscriptions, Payment Links;
- Meta / WhatsApp credentials, webhooks, the Move37 → Findable cutover;
- changing access: Supabase Auth settings, roles, API keys, secrets;
- editing real client records (Ronnie, MCL, RG, SC — see `10-HISTORICAL-CLIENTS-AND-EXCEPTIONS.md`);
- sending real messages/emails to real prospects or clients.

## SQL

- Claude can and should run SQL itself (route and token location: CLAUDE.md §2 — the token is in Windows Credential
  Manager; never print or commit it). Additive / read-only: just run it and read the schema back. Destructive: show Paul.
- If Paul asks for "SQL to me", give **one statement per fenced block**, numbered, with the expected result — the Supabase
  editor silently runs only the last statement of a pasted script.

## Small habits that matter to him

- Name the files you changed so he can check them.
- When something needs his eyes (an admin screen, a payment page), say exactly which page and what "good" looks like.
- Say which functions were redeployed, by name.
- Don't re-ask decisions he has already made — they are recorded in `docs/` (e.g. `docs/deep-clean-phase3-plan.md`
  "standing decisions") and in CLAUDE.md.
