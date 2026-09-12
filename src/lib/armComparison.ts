/* ════════════════════════════════════════════════════════════════════════════════════════════════
   COLD vs WARM — an A/B comparison that a follow-up message cannot corrupt.

   ⛔ WHY THIS IS NOT THE SAME QUESTION THE TABLE ALREADY ANSWERS. The per-template columns use
   LAST TOUCH: "which message was in front of them when they clicked". That is the right answer to
   "which message earned this click", and the wrong answer to "does warm convert better than cold",
   because any message sent in between takes the credit. Measured 2026-09-07: for the two arms that
   has never yet happened (0 of 124 arm leads got a later template, 0 got both arms) — but
   audit_reply, the closest analogue with real volume, shows 30 of 577 leads (5%) receiving a later
   template. At the sample sizes an A/B runs on, a 5% leak is enough to decide it wrongly.

   ⛔ SO THIS FOLD IS INTENT-TO-TREAT, which is what Paul asked for in his own words: attribute to
   "whichever template was actually sent to that lead". A lead is assigned to the arm it was sent,
   and every subsequent visit or sign-up counts for that arm no matter what else went out in
   between. Nothing can steal a click from the arm, because the arm is a property of the LEAD rather
   than of the message ordering.

   ⛔ A LEAD SENT BOTH ARMS IS EXCLUDED, NOT SILENTLY ASSIGNED. It is in both populations, so it can
   answer neither question, and putting it in the newer arm would flatter whichever template was
   introduced second — which is always the one being tested. The count is surfaced so the exclusion
   is visible rather than a quiet shrink (the standing rule for every itemised exclusion here).
   ⚠️ The two arms SHOULD be disjoint by design — cold goes to a lead who has not replied, warm only
   to one who has — but nothing enforces it, so this fold must not assume it.

   ⛔ TWO DENOMINATORS, BECAUSE THE THREE METRICS ARE NOT TRACKED FROM THE SAME DATE. Report opens
   and questionnaire sign-ups have always been recorded; a landing on the sign-up page has only been
   recorded since the prefill hook shipped. Dividing visits by every arm lead would understate the
   visit rate by every send that predates tracking — the fake zero this dashboard keeps refusing.
   ============================================================================================== */

/** The templates under test. Order is display order: cold first, then warm. */
export const AB_ARMS = ['video_template', 'audit_reply_warm'] as const;
export type AbArm = typeof AB_ARMS[number];
const ARM_SET: ReadonlySet<string> = new Set(AB_ARMS);

export const ARM_LABELS: Record<AbArm, string> = {
  video_template: 'Cold (video hook)',
  audit_reply_warm: 'Warm (audit reply, after the opener)',
};

/** One templated send, already filtered to the ones Meta accepted. */
export interface ArmSend { template: string; at: number }

/** Everything the fold needs about one lead. Structural: pure module, drivable from a test. */
export interface ArmLeadInput {
  leadId: string;
  /** Real templated sends in ASCENDING time order. */
  sends: ArmSend[];
  /** Earliest recorded landing on the sign-up page, ms, or null. */
  firstVisitAt: number | null;
  /** Earliest questionnaire submission that is not a free check, ms, or null. */
  firstSignupAt: number | null;
  /** Earliest report open across the lead's audits, ms, or null. */
  firstReportOpenAt: number | null;
}

export interface ArmTotals {
  /** Leads assigned to this arm. The denominator for report opens and sign-ups. */
  leads: number;
  /** Leads whose arm send happened while visit tracking was running. The visit denominator. */
  leadsTracked: number;
  reportOpened: number;
  /** Counted only for leads in `leadsTracked`, so the rate can never exceed 100%. */
  siteVisits: number;
  signups: number;
}

export interface ArmComparison {
  arms: Record<AbArm, ArmTotals>;
  /** Leads sent both arms — excluded from both, surfaced rather than hidden. */
  bothArms: number;
  /** True once any arm has a lead, i.e. there is something to show. */
  hasData: boolean;
}

/* The same slack the open attribution uses, and for the same reason: the send timestamp is Meta's
   receipt while the event timestamp is our own clock, so an instant tap can record a few seconds
   "before" the send. Without it a genuine immediate click is thrown away. */
const SLACK_MS = 60_000;

const empty = (): ArmTotals => ({ leads: 0, leadsTracked: 0, reportOpened: 0, siteVisits: 0, signups: 0 });

/**
 * Which arm is this lead in, and when did that arm reach them?
 *
 * ⚠️ THE FIRST arm send defines the arm, not the newest. The question is which treatment the lead
 * received, and the first exposure is what they responded to — taking the newest would let a later
 * resend of the same template move the clock past events it had already caused.
 */
export function armFor(sends: ArmSend[]): { arm: AbArm; at: number } | 'both' | null {
  const armSends = sends.filter((s) => ARM_SET.has(s.template));
  if (armSends.length === 0) return null;
  const distinct = new Set(armSends.map((s) => s.template));
  if (distinct.size > 1) return 'both';
  const first = armSends.reduce((a, b) => (a.at <= b.at ? a : b));
  return { arm: first.template as AbArm, at: first.at };
}

/**
 * Fold the cold-vs-warm comparison.
 *
 * `trackingStart` is when site-visit logging began; an arm send before it cannot have produced a
 * recorded visit, so that lead is counted in `leads` but not in `leadsTracked`.
 */
export function foldArmComparison(rows: ArmLeadInput[], trackingStart: number): ArmComparison {
  const arms = { video_template: empty(), audit_reply_warm: empty() } as Record<AbArm, ArmTotals>;
  let bothArms = 0;

  for (const r of rows) {
    const a = armFor(r.sends);
    if (a === null) continue;
    if (a === 'both') { bothArms += 1; continue; }
    const t = arms[a.arm];
    const floor = a.at - SLACK_MS;
    t.leads += 1;

    /* ⛔ EVERY EVENT IS COUNTED FROM THE ARM SEND, NOT FROM THE NEWEST MESSAGE. This is the whole
       difference from the table's last-touch columns: an onboarding follow-up sent in between
       cannot take the click away from the arm, because the arm never depended on being last. */
    if (r.firstReportOpenAt !== null && r.firstReportOpenAt >= floor) t.reportOpened += 1;
    if (r.firstSignupAt !== null && r.firstSignupAt >= floor) t.signups += 1;

    /* Visits only count where they could have been recorded at all. */
    if (a.at >= trackingStart) {
      t.leadsTracked += 1;
      if (r.firstVisitAt !== null && r.firstVisitAt >= floor) t.siteVisits += 1;
    }
  }

  const hasData = AB_ARMS.some((k) => arms[k].leads > 0) || bothArms > 0;
  return { arms, bothArms, hasData };
}

/** A rate, or null when there is no denominator. Never 0% for an unmeasured population. */
export const armRate = (num: number, den: number): number | null =>
  den > 0 ? Math.round((num / den) * 100) : null;
