import type { AiAuditSeo } from './aiAuditReportHtml';
import type { Playbook, PlaybookStep } from './buildPlaybook';
import { factFor } from './directoryFacts';
import {
  CLIENT_ASK_LIMIT, type AskCost, type ClientAsk, type ClientHeldField, type ClientRequestInput,
  type ClientSeo,
} from './clientRequestDoc';

/* ============================================================
   WHAT THE CLIENT IS ASKED FOR — the selection side of the client-request boundary.

   THIS is the file that sees the full Playbook, including the citation ranking, every cited host, the
   competitor list and the thin markers. It hands the renderer a ClientRequestInput and nothing else.
   clientRequestDoc.ts does not import this file, buildPlaybook, or directoryFacts, so the document
   cannot print what it was never given. Keep it that way: if a future change needs more on the sheet,
   widen ClientRequestInput deliberately rather than passing the Playbook through.

   FOUR FILTERS, IN ORDER, AND EACH ONE EARNS ITS PLACE:
     1. section === 'blocked'  — only things we genuinely cannot do ourselves. Anything we can do is
        our job, and putting it in front of a client is both rude and a leak.
     2. strength !== 'thin'    — a host resting on fewer than EVIDENCE_MIN_AUDITS audits is an
        anecdote. Asking a client to pay money on an anecdote is indefensible.
     3. a hand-written clientParagraph — NO GENERIC FALLBACK, deliberately. The one host this excludes
        for plumbers is MyJobQuote (11 of 62 audits, so not thin), and excluding it is the right call
        twice over: nobody has written client wording for it, and its own notes record the
        pay-per-lead model as "INFERRED from the sector norm". An ask to spend money on an inferred
        commercial model is exactly the kind of thing that embarrasses you in front of a client.
     4. top CLIENT_ASK_LIMIT by BREADTH — audits, not citations. Volume alone lies (one host had 32
        citations from a single audit); breadth is how many separate businesses it showed up for.

   For a plumber today that yields Checkatrade (59 of 62), MyBuilder (32 of 62) and TrustATrader
   (17 of 62). Excluded: MyJobQuote and Which? Trusted Traders by the limit, and Angi / Rated People /
   TrustMark as thin at 3 audits each.
   ============================================================ */

/* ── GOOGLE BUSINESS PROFILE: a FIXED ask, not an evidence-derived one ───────────────────────────
   Added back 2026-07-30. It is the only ask that costs the client nothing, and a form where all
   three asks cost money reads worse than it should.

   ⚠️ ITS JUSTIFICATION IS GOOGLE'S, NOT OURS, AND THE WORDING SAYS SO. Google publishes guidance
   that a complete Business Profile helps a business appear in AI-powered results. Our own data does
   NOT support it as a lever: google.com is cited twice, across 2 of 62 plumber audits, out of 10,672
   citations. So this is asked on Google's authority, attributed to Google, and flagged as not
   something we have measured. Presenting it as a measured finding would be the exact failure the
   evidence pipeline exists to prevent — see the Bing Places entry in CLAUDE.md §5, which is the same
   shape of claim and is comprehensively false.

   It does NOT count against CLIENT_ASK_LIMIT, which caps the DIRECTORY asks derived from citations.
   Placed FIRST so the form opens with the free, easy one the client already owns rather than three
   requests for money in a row; Checkatrade follows immediately and is still clearly the strongest. */
const GOOGLE_BUSINESS_PROFILE_ASK: ClientAsk = {
  label: 'Your Google Business Profile',
  cost: 'free',
  evidenceNote: 'Google publishes guidance that keeping your Business Profile complete and accurate '
    + 'helps your services show up in AI-powered results. To be straight with you: that is Google’s '
    + 'guidance rather than something we have measured ourselves, and we would rather tell you which '
    + 'it is. We are including it because it is free, it is already yours, and it costs you nothing '
    + 'but a few minutes.',
  clientParagraph: `This is the listing that shows on Google Maps and on the right-hand side of Google when someone searches for you. You already own it — nothing needs buying.

Only you can give us access, because it is verified against your business. Either add us as a manager from the Users section of your profile, or keep it yourself and we will tell you exactly what to change.

Either way, the details need to match everything else: same business name, same trade wording, same phone number, same address.`,
  blockedReason: null,
};

/** Why each missing detail is needed, in plain terms. A client reads a bare "address: missing" as
 *  admin; it is actually the thing blocking every signup, and it has to say so. */
/* ⛔ THESE JUSTIFY THE FIELD BY THE WORK WE ACTUALLY DO. They used to justify it by directory
   signups — "every directory signup asks for a full business address", "it has to match on every
   listing" — which was Step one still describing the delivery model we dropped, three sections above
   a Step two that no longer mentions it. An earlier sweep caught the asks and missed these.
   The reason is the same fact stated honestly: these details go on the pages we write and on the
   Google Business Profile, and an engine that finds two versions of one of them trusts neither. */
const WHY_MISSING: Record<string, string> = {
  Address: 'This is the one that holds everything up. It goes on every page we write and on your Google Business Profile, and it is how an engine works out which towns you actually serve. Until we have it there is nothing to publish.',
  Phone: 'It goes on every page and on your profile, and it has to be the same number in both. An engine that finds two versions of it trusts neither.',
  Town: 'This decides which town we measure you in, and which town pages get written. Without it we would be asking about the wrong area.',
  Trade: 'This is the wording customers actually search for, and it is what every page we write is built around.',
  'Business name': 'The exact trading name, so it reads identically on your pages and your profile.',
  Website: 'If you have one, we need the address. If you do not, that is worth a conversation: AI builds its answers largely from businesses’ own websites, so without one it has nothing of yours to read — and building you a simple one is included in the setup.',
};

/** The six details the operator sheet already resolves, mapped to held/missing for the client.
 *  `fields` is identical on every do_now step by construction (buildPlaybook builds it once and
 *  attaches the same array), so reading it off the first step that has one is safe. */
function heldFields(pb: Playbook): ClientHeldField[] {
  const src = pb.steps.find((s: PlaybookStep) => s.fields.length > 0)?.fields;
  if (src && src.length) {
    return src.map((f) => {
      /* buildPlaybook writes placeholder text into a missing address ("NOT HELD — ask the client")
         and 'none' into an absent website. Neither belongs in front of a client, so `missing` decides
         and the value is blanked. 'none' is treated as a gap because a missing website IS one. */
      const absent = !!f.missing || f.value.trim() === '' || f.value.trim().toLowerCase() === 'none';
      return {
        name: f.name,
        value: absent ? '' : f.value,
        held: !absent,
        ...(absent && WHY_MISSING[f.name] ? { why: WHY_MISSING[f.name] } : {}),
      };
    });
  }
  /* No do_now step carried fields — happens when the trade is too thinly measured for a directory
     list. Fall back to what the Playbook itself exposes. Phone is genuinely unknown here rather than
     absent, so it is not claimed either way. */
  return [
    { name: 'Business name', value: pb.businessName, held: !!pb.businessName.trim() },
    { name: 'Trade', value: pb.trade ?? '', held: !!(pb.trade ?? '').trim(), why: WHY_MISSING.Trade },
    { name: 'Town', value: pb.town ?? '', held: !!(pb.town ?? '').trim(), why: WHY_MISSING.Town },
    { name: 'Address', value: '', held: !pb.missingAddress, why: WHY_MISSING.Address },
    { name: 'Website', value: '', held: pb.hasWebsite, why: WHY_MISSING.Website },
  ];
}

/**
 * Turn the operator Playbook into the narrow input the client document accepts.
 *
 * `naming` is passed through from usePlaybook rather than derived here: it is a property of the run,
 * not of the fold, and null is a legitimate value (no completed measurement) that the renderer
 * handles by omitting the line.
 */
export interface ClientAnswers {
  services: string[];
  areas: string[];
}

/* ⚠️ THE QUESTIONNAIRE ANSWERS ARE A SEPARATE ARGUMENT, not fields on the Playbook. The Playbook is
   the evidence fold — what the citations say about a trade — and the services and towns are what the
   CLIENT told us. Hanging them off the fold would mean every consumer of Playbook carries data it
   has no use for, and would blur the one boundary that has kept this document honest. */
/* NARROWED HERE, not in the renderer. The document should never be handed the full AiAuditSeo: it
   carries per-category scores and a stored `baseline` blob that must never reach a client, and the
   safest way to guarantee that is for the client type not to have the fields at all. */
export function toClientSeo(seo: AiAuditSeo | null): ClientSeo | null {
  if (!seo) return null;
  const grade = (seo.overallGrade ?? '').trim();
  if (!grade) return null;
  return {
    grade,
    findings: (seo.leadFindings ?? [])
      .filter((f) => !!f?.title)
      .map((f) => ({ title: f.title, detail: f.detail ?? '', severity: f.severity })),
  };
}

export function buildClientRequest(
  pb: Playbook,
  naming: { named: number; total: number } | null,
  answers: ClientAnswers | null,
  seo: AiAuditSeo | null,
): ClientRequestInput {
  const trade = (pb.trade ?? '').trim().toLowerCase();
  const town = (pb.town ?? '').trim();
  /* The {trade}/{town} substitution the hand-written client paragraphs are written against. Lifted
     from the deleted buildClientDoc, which was the only thing that ever performed it. */
  const fill = (s: string) => s.replace(/\{trade\}/g, trade || 'business').replace(/\{town\}/g, town || 'your area');

  const directoryAsks: ClientAsk[] = pb.steps
    .filter((s) => s.section === 'blocked' && !!s.host && s.strength !== 'thin')
    .map((s) => ({ step: s, fact: factFor(s.host as string) }))
    .filter((x) => !!x.fact?.clientParagraph)
    .sort((a, b) => b.step.audits - a.step.audits || b.step.citations - a.step.citations)
    .slice(0, CLIENT_ASK_LIMIT)
    .map(({ step, fact }) => ({
      label: fact!.label,
      audits: step.audits,
      tradeAudits: pb.tradeAudits,
      cost: fact!.cost as AskCost,
      clientParagraph: fill(fact!.clientParagraph as string),
      blockedReason: step.blockedReason ?? null,
    }));

  return {
    businessName: pb.businessName,
    trade: pb.trade,
    town: pb.town,
    fields: heldFields(pb),
    /* ⛔ NO ASKS PASSED. They are fixed now (DELIVERY_ASKS) and the document imports them itself, so
       nothing evidence-derived reaches the client sheet at all. `directoryAsks` above is dead and is
       left in place deliberately until the new document has been printed and checked — nothing is
       deleted before its replacement is proven. */
    services: answers?.services ?? [],
    areas: answers?.areas ?? [],
    seo: toClientSeo(seo),
    naming,
  };
}
