/* ============================================================
   PHOTOGRAPH, LOGO, OR CREDENTIAL BADGE.

   🔴 PAUL'S CORRECTION, 2026-09-11: the logos and badges are the most valuable non-photographs in
   the pool, not junk. Three filters were discarding them (the harvester's IMG_SKIP, the pool's
   FURNITURE, the derivation's POOL_FURNITURE) and all three were corrected.

   ⛔ THE SIGNAL ORDER IS MEASURED AND IT IS NOT THE OBVIOUS ONE. From First4locks' real 29-image
   pool, with dimensions and alpha read from the actual bytes:
     · Name/alt caught all five non-photographs on their own.
     · ALPHA WOULD HAVE BEEN WRONG BOTH WAYS: bark-reviews.png has NO alpha channel, and two real
       photographs DO ("new image for home page_PNG.png", "shop shutter_PNG.png").
     · SIZE WOULD HAVE BEEN WRONG: two real photographs measured 146x98 and 147x98 because they
       were Wix LQIP placeholders, i.e. badge-scale.
   So name/alt classifies; shape only corroborates. These tests pin that, not just the outcome.
   ============================================================ */
import { classifyPoolImage, directoryBadge, looksLikeOwnLogo, assetAllowedInSlot,
         slotWants, slotIsMulti } from "../src/lib/mockupAsset.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const BIZ = "First4locks Ltd - Locksmiths Speke";
const at = (name: string, alt?: string, extra: Record<string, unknown> = {}) =>
  ({ url: `https://static.wixstatic.com/media/${encodeURIComponent(name)}`, alt, ...extra });

/* ── The five real non-photographs, by their REAL filenames and alt text ─────────────────── */
ok(classifyPoolImage(at("bark-reviews.png", "Bark logo"), BIZ).kind === "badge", "bark-reviews.png -> badge");
ok(classifyPoolImage(at("reviews yell_PNG.png", "Yell.com logo"), BIZ).kind === "badge", "'reviews yell_PNG.png' -> badge");
ok(classifyPoolImage(at("reviews my builder_PNG.png", "My Builder logo"), BIZ).kind === "badge",
   "⛔ 'my builder' with a SPACE -> mybuilder. Normalising is what makes the real filenames match");
ok(classifyPoolImage(at("First 4 Locks.jpg", "First 4 Locks"), BIZ).kind === "logo",
   "⛔ 'First 4 Locks.jpg' matches the business name once spaces are stripped -> their logo");

/* ── The order that matters: a directory's logo is NOT their logo ────────────────────────── */
ok(classifyPoolImage(at("yell-logo.png", "Yell logo"), BIZ).kind === "badge",
   "🔴 'Yell logo' contains the word logo and is emphatically NOT their logo — badge wins");
ok(directoryBadge(at("checkatrade-approved.png")) === "checkatrade", "checkatrade by filename");

/* ── The real photographs must stay photographs ──────────────────────────────────────────── */
for (const [n, a] of [["Padlock.jpg", "Padlock"], ["Keys on Ring.jpg", "Keys on Ring"],
                      ["UPVC door lock and keys.jpg", "UPVC door lock and keys"],
                      ["shop shutter_PNG.png", "Shutter of shops"]] as const) {
  ok(classifyPoolImage(at(n, a), BIZ).kind === "photo", `${n} stays a photograph`);
}

/* ── 🔴 THE MEASURED TRAPS: shape must never reclassify on its own ───────────────────────── */
ok(classifyPoolImage(at("new image for home page_PNG.png", "Door with locksmith", { alpha: true }), BIZ).kind === "photo",
   "⛔ a real PHOTOGRAPH with an ALPHA channel is still a photograph — alpha alone never decides");
ok(classifyPoolImage(at("11062b_9b7316.jpg", "Keys on Ring", { width: 146, height: 98 }), BIZ).kind === "photo",
   "⛔ a 146x98 photo (a Wix LQIP) is still a photograph — size alone never decides");
ok(classifyPoolImage(at("bark-reviews.png", "Bark logo", { alpha: false }), BIZ).kind === "badge",
   "⛔ a badge with NO alpha is still a badge — the name decided it");
{
  const v = classifyPoolImage(at("new image for home page_PNG.png", "Door with locksmith", { alpha: true }), BIZ);
  ok(v.uncertain === true, "…but the disagreement is SURFACED as uncertain rather than hidden");
}

/* ── Substring traps: this project has been fooled twice (bing/plumbing, acca/Macca-Gas) ──── */
ok(directoryBadge(at("which-way-to-the-door.jpg")) === null,
   "⛔ 'which' inside an ordinary word does NOT make a badge — it needs a qualifier");
ok(directoryBadge(at("which-trusted-trader.png")) === "which", "…but 'which trusted trader' does");
ok(directoryBadge(at("mlarge-door.jpg")) === null, "⛔ 'mla' inside 'mlarge' is not the MLA");
ok(directoryBadge(at("mla-approved.png")) === "mla", "…but 'mla approved' is");
ok(classifyPoolImage(at("random-photo.jpg"), null).kind === "photo", "a null business name never throws");
ok(classifyPoolImage(at("logo.svg"), BIZ).kind === "logo", "a plain logo.svg is their logo");

/* ── 🔴 A BADGE IS NEVER A HERO ──────────────────────────────────────────────────────────── */
ok(slotWants("hero") === "photo" && slotWants("work") === "photo", "ordinary slots want photographs");
ok(slotWants("logo") === "logo" && slotWants("header_logo") === "logo", "logo slots want the logo");
ok(slotWants("badges") === "badge" && slotWants("accreditations") === "badge", "badge slots want badges");
ok(slotIsMulti("badges") === true && slotIsMulti("hero") === false, "a badge row takes several; a hero takes one");
ok(assetAllowedInSlot("badge", "hero").ok === false,
   "🔴 a badge in the hero is REFUSED — stretched across a hero it is obviously wrong to the prospect too");
ok(assetAllowedInSlot("logo", "hero").ok === false, "a logo lockup is refused in the hero for the same reason");
ok(assetAllowedInSlot("photo", "badges").ok === false, "a photograph is refused in the badge row");
ok(assetAllowedInSlot("badge", "badges").ok === true && assetAllowedInSlot("logo", "logo").ok === true,
   "and each is allowed where it belongs");
ok(assetAllowedInSlot("photo", "hero").ok === true, "a photograph in a hero is fine");
ok(/takes a photograph/.test(assetAllowedInSlot("badge", "hero").detail),
   "the refusal SAYS WHY, so the operator can correct it rather than wonder");

console.log(f === 0 ? "\nOK logo and badge detection holds" : `\n${f} FAILED`);
if (f) process.exit(1);
