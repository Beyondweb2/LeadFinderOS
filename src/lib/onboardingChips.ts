/* ============================================================
   ONBOARDING CHIPS — PORTED VERBATIM from findable-site src/lib/onboardingChips.ts.

   The manual onboarding form on Paid Clients offers the SAME service chips the customer is
   offered, so the operator and the customer answer the same question the same way. Everything
   from the ChipSet interface down is a byte copy; scripts/manual-onboarding.test.ts fails
   when it drifts from findable-site. Change both, or neither. The original header explains why
   there is no generic chip set.
   ============================================================ */

export interface ChipSet {
  standout: string[];       // Q1, no longer asked (cut 2026-08-04); kept so old drafts still type
  /** EMPTY when the trade has no tailored set. Callers must render no chips at all in that case —
   *  see hasServiceChips / hasAccreditationChips. */
  services: string[];
  /** EMPTY when the trade has no tailored set. Same rule. */
  accreditations: string[];
  /** Example text for the free-text boxes. These were hardcoded to plumbing ("Gas Safe 123456"),
   *  which reads as someone else's trade to an accountant, so they live with the chips and are
   *  chosen by the same family. */
  placeholders: {
    standout: string;
    services: string;
    accreditations: string;
  };
}

type Family = "plumbing" | "electrical" | "accounting" | "locksmith" | "driving" | "barber" | "mechanic" | "untailored";

/* trade word (from tradeWord()) → chip family. Anything unmapped is UNTAILORED: no chips, examples
   only. Measured 2026-08-05 across 973 leads: these four families cover 648 of them (66.6%), 157
   (16.1%) are untailored — driving instructor 50, "business" 46, barber 36, mechanic 25 — and 168
   (17.3%) carry no trade at all, so they got a blank box either way. */
const FAMILY_BY_TRADE: Record<string, Family> = {
  plumber: "plumbing",
  "heating engineer": "plumbing",
  "gas engineer": "plumbing",
  "bathroom fitter": "plumbing",
  electrician: "electrical",
  accountant: "accounting",
  bookkeeper: "accounting",
  // tradeWord() already returns "locksmith" for anything matching /locksmith/, so the headline was
  // always right; only the suggestions were falling through to the generic set.
  locksmith: "locksmith",
  /* Added 2026-08-05 from the measured untailored bucket — these were the only real trades in it
     (driving instructor 50 leads, barber 36, mechanic 25), so three object literals take coverage
     from 66.6% to 78.0%.
     ⚠️ "driving school" and "auto repair shop" resolve to the WORD "business" in tradeWord(), not to
     these, so they are not covered by these keys. That is a tradeWord() gap, not a chip gap. */
  "driving instructor": "driving",
  barber: "barber",
  mechanic: "mechanic",
};

const SETS: Record<Family, ChipSet> = {
  plumbing: {
    standout: [
      "Years of experience",
      "Gas Safe registered",
      "Emergency callouts",
      "Fixed price quotes",
      "Mostly word of mouth",
      "Family run",
    ],
    services: [
      "Boiler repairs",
      "Boiler installation",
      "Bathroom fitting",
      "Emergency plumbing",
      "Gas safety checks",
      "Leak detection",
      "Drainage",
    ],
    accreditations: ["Gas Safe", "CIPHE", "WaterSafe", "TrustMark"],
    placeholders: {
      standout: "20 years in, Gas Safe registered, same day callouts, most work comes from word of mouth",
      services: "Boiler installs, leak detection, bathrooms",
      accreditations: "Gas Safe 123456, CIPHE member, fully insured",
    },
  },
  electrical: {
    standout: [
      "NICEIC registered",
      "Emergency callouts",
      "Years of experience",
      "Fixed price quotes",
      "Family run",
    ],
    services: [
      "Rewiring",
      "Fuse board upgrades",
      "EV charger installation",
      "EICR reports",
      "Lighting installation",
      "Fault finding",
      "Emergency callouts",
    ],
    accreditations: ["NICEIC", "NAPIT", "ELECSA"],
    placeholders: {
      standout: "15 years in, NICEIC registered, same day callouts, most work comes from word of mouth",
      services: "Rewiring, fuse boards, EV chargers",
      accreditations: "NICEIC registered, Part P certified, fully insured",
    },
  },
  accounting: {
    standout: [
      "ACCA/ICAEW regulated",
      "Years of experience",
      "Fixed monthly fees",
      "Cloud accounting",
      "Small business specialists",
    ],
    services: [
      "Annual accounts",
      "Self assessment",
      "VAT returns",
      "Payroll",
      "Bookkeeping",
      "Corporation tax",
    ],
    accreditations: ["ACCA", "ICAEW", "CIMA", "AAT", "CIOT"],
    placeholders: {
      standout: "ACCA regulated, 12 years in, fixed monthly fees, mostly small limited companies",
      services: "Annual accounts, VAT returns, payroll",
      accreditations: "ACCA member, AAT qualified, professional indemnity cover",
    },
  },
  locksmith: {
    standout: [
      "Years in the trade",
      "24 hour callouts",
      "MLA approved",
      "Fixed price quotes",
      "No callout fee",
      "Family run",
    ],
    services: [
      "Emergency lockouts",
      "Lock changes",
      "Key cutting",
      "uPVC door and window locks",
      "Safes",
      "Burglary repairs",
    ],
    // The MLA (Master Locksmiths Association) is the one accreditation a customer might recognise,
    // and DBS matters here in a way it does not for a plumber: this trade gets let into homes.
    accreditations: ["MLA approved", "DBS checked", "Fully insured"],
    placeholders: {
      standout: "15 years in, MLA approved, 24 hour callouts, no callout fee, most work comes from word of mouth",
      services: "Emergency lockouts, lock changes, uPVC door locks",
      accreditations: "MLA approved, DBS checked, fully insured",
    },
  },
  driving: {
    standout: [],
    services: [
      "Beginner lessons",
      "Intensive courses",
      "Motorway lessons",
      "Refresher lessons",
      "Automatic lessons",
      "Pass Plus",
    ],
    /* DVSA approval is the real one and the only one a learner would recognise. "Grade A" is the
       DVSA's own standards-check grade, which instructors advertise themselves. DBS matters here for
       the same reason it does for a locksmith: this trade is alone in a car with teenagers. */
    accreditations: ["DVSA approved (ADI)", "Grade A", "DBS checked"],
    placeholders: {
      standout: "",
      services: "Beginner lessons, intensive courses, motorway lessons",
      accreditations: "DVSA approved, ADI badge number, DBS checked",
    },
  },
  barber: {
    standout: [],
    services: [
      "Skin fades",
      "Beard trims",
      "Hot towel shaves",
      "Kids' cuts",
      "Hair designs",
    ],
    /* ⛔ NO ACCREDITATION CHIPS, DELIBERATELY, AND THIS IS NOT AN OMISSION TO BE FILLED IN LATER.
       Barbering has no registration a customer would recognise — no licence, no protected body — so
       every chip we could offer would be the "Trade association member" mistake again: a plausible
       word nobody actually holds. The empty array makes the caller render the examples line instead,
       which is the honest answer for this trade. */
    accreditations: [],
    placeholders: {
      standout: "",
      services: "Skin fades, beard trims, hot towel shaves",
      accreditations: "Anything you are registered with, plus the number if you have one",
    },
  },
  mechanic: {
    standout: [],
    services: [
      "MOTs",
      "Servicing",
      "Brakes and clutches",
      "Diagnostics",
      "Air conditioning",
      "Tyres",
    ],
    /* VERIFIED 2026-08-05 before shipping, because naming a scheme we had not checked — on a form
       that asks people what they hold — is exactly the wrong impression.
       · IMI = Institute of the Motor Industry. Its Professional Register (launched 2013,
         imiregister.org.uk) is a free public search for technicians it has verified.
         ⚠️ "IMI Accredited", NOT "IMI qualified": the register distinguishes IMI Accredited
         (competence-tested, formerly ATA, renewed every 3 years) from IMI Member, and "qualified"
         blurs the two. On this form that distinction is the whole point.
       · Good Garage Scheme = real and current, run by Forté Lubricants, with a public garage finder.
         Members face mystery-shopper audits and removal for code breaches, which is what makes it
         worth naming rather than a pay-and-display badge. */
    accreditations: ["IMI Accredited", "Good Garage Scheme", "DBS checked"],
    placeholders: {
      standout: "",
      services: "MOTs, servicing, brakes and clutches",
      accreditations: "IMI Accredited, Good Garage Scheme member, registration number",
    },
  },
  /* NO CHIPS. Both arrays empty on purpose — see the header. The placeholders carry the guidance
     instead, and they are deliberately about HOW to answer rather than WHAT to answer: we do not
     know this trade, so inventing plausible-sounding services for it is the same mistake in a
     quieter voice. exampleFor() below does supply real examples where the trade word is one we can
     write them for. */
  untailored: {
    standout: [],
    services: [],
    accreditations: [],
    placeholders: {
      standout: "",
      services: "One service per line, in the words a customer would use",
      accreditations: "Anything you are registered with, plus the number if you have one",
    },
  },
};

/* ── EXAMPLES FOR TRADES WITH NO CHIP SET ──────────────────────────────────────────────────────
   Read-and-ignore text, never options to reject. Only for trade words we can honestly write for;
   anything else gets the neutral placeholder above, which is still better than wrong chips.
   EMPTY TODAY, AND THAT IS CORRECT. It held driving instructor, barber and mechanic until those
   three earned full chip sets on 2026-08-05 — at which point the entries became dead code, because a
   trade with chips never renders the examples line. Deleted rather than left looking live.
   The remaining untailored bucket is the word "business" (46 leads), which is tradeWord()'s own
   fallback rather than a trade, so there is nothing honest to write for it. This is the hook for the
   next trade we can write examples for before we can write a full set. */
const SERVICE_EXAMPLES: Record<string, string> = {};

/** Trade-aware examples for the services box, or "" when we cannot write them honestly. */
export function serviceExamplesFor(trade: string | null | undefined): string {
  return SERVICE_EXAMPLES[(trade ?? "").trim().toLowerCase()] ?? "";
}

/** Does this trade have real service chips? False → render the input and examples, no chips. */
export function hasServiceChips(trade: string | null | undefined): boolean {
  return chipsForTrade(trade).services.length > 0;
}

/** Does this trade have real accreditation chips? */
export function hasAccreditationChips(trade: string | null | undefined): boolean {
  return chipsForTrade(trade).accreditations.length > 0;
}

/** The chip set for a trade word. Unknown or absent trade → the UNTAILORED set, whose chip arrays
 *  are empty. Never returns invented chips. */
export function chipsForTrade(trade: string | null | undefined): ChipSet {
  const key = (trade ?? "").trim().toLowerCase();
  return SETS[FAMILY_BY_TRADE[key] ?? "untailored"];
}

/* ---------- comma-list helpers ----------
   The text field is the real answer, so chip state is DERIVED from it rather than held
   separately: a chip reads as selected exactly when its text is one of the comma-separated
   parts. That keeps the selected state honest after the customer edits the box by hand,
   and makes tapping a second time remove what the first tap added. */

const parts = (value: string): string[] =>
  value.split(",").map((p) => p.trim()).filter(Boolean);

export function hasChip(value: string, chip: string): boolean {
  const c = chip.trim().toLowerCase();
  return parts(value).some((p) => p.toLowerCase() === c);
}

/** Append the chip, or remove it if it is already there. Returns the new field value. */
export function toggleChip(value: string, chip: string): string {
  const list = parts(value);
  const i = list.findIndex((p) => p.toLowerCase() === chip.trim().toLowerCase());
  if (i >= 0) {
    list.splice(i, 1);
    return list.join(", ");
  }
  return list.length ? `${list.join(", ")}, ${chip}` : chip;
}
