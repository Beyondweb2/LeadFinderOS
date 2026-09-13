/* ════════════════════════════════════════════════════════════════════════════════════════════════
   NO LIVE EMAIL MAY BE SENT FROM AN UNVERIFIED DOMAIN.

   🔴 THE INCIDENT (2026-09-13). Paul paid £99 and the "PAID £99" email never arrived. It WAS sent:
   Resend answered 403 "The lead-finder-app.com domain is not verified" and refused it outright. The
   sender was the OLD barber product's domain, hardcoded in stripe-webhook, while every other
   Findable email had long since moved to findable.live. He was told a paying customer had not paid
   and never got the message that would have contradicted it.

   ⛔ IT WAS THE SECOND TIME. free-check-result.ts lost three operator notifications to the exact
   same 403 on 2026-09-02 and was fixed — and nobody swept for the domain, so stripe-webhook and
   send-feedback kept it. A fix applied to the file where a fault was noticed, rather than to every
   file that shares the fault, is how one incident happens twice.

   ⛔ AND RESEND DOES NOT DEGRADE. An unverified sender is not slower or spam-filtered: it is
   refused, every time, for ever, and silently unless somebody is recording the failure. That is why
   this is a build gate rather than a runtime check.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FN = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "supabase", "functions");
let failures = 0;
const ok = (c, l) => { if (!c) failures++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

/** The only domain verified on the Resend account RESEND_API_KEY belongs to. */
const VERIFIED = /@findable\.live\s*>/;

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(dir, e.name)) : (e.name.endsWith(".ts") ? [path.join(dir, e.name)] : []));

/* Comments discuss the dead domain ON PURPOSE — they are where the record of this lives. Only a
   real `from:` line can reach Resend, so this reads the code with comments stripped. */
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

/* ⛔ THE TWO BARBER SENDS ARE EXEMPT, COUNTED, AND THE EXEMPTION IS DELIBERATELY NARROW. That
   product was deleted in the 2026-09-09 cleanup and its `generated_site_id` branches are
   unreachable for any Findable payment, so those addresses cannot lose a live email. They are
   counted rather than changed because relabelling a dead code path as Findable would be a worse
   lie than the stale domain — but the COUNT is pinned, so a third one cannot appear quietly. */
const DEAD_BARBER_SENDERS = 2;

let live = 0, dead = 0;
for (const file of walk(FN)) {
  const src = stripComments(fs.readFileSync(file, "utf8"));
  for (const m of src.matchAll(/from:\s*("[^"]*"|`[^`]*`)/g)) {
    const value = m[1];
    if (!value.includes("@")) continue;   // a variable — checked where it is defined, below
    const rel = path.relative(FN, file).split(path.sep).join("/");
    if (/lead-finder-app\.com/.test(value)) {
      dead += 1;
      ok(rel.startsWith("stripe-webhook/"), `${rel}: the unverified domain survives only on the dead barber path`);
      continue;
    }
    live += 1;
    ok(VERIFIED.test(value), `${rel}: ${value.slice(0, 56)} sends from a verified domain`);
  }
}

/* ⛔ AND THE DOMAIN IS COUNTED IN THE SOURCE ITSELF, NOT ONLY ON `from:` LINES. Proven necessary:
   restoring the old domain on the FROM_OPERATOR constant left the dead-sender count at 2, because a
   `const X = "..."` declaration is not a `from:` line — the regex above could not see the exact
   regression this file exists to stop. Every appearance outside a comment now has to be one of the
   two known dead ones. */
let deadMentions = 0;
for (const file of walk(FN)) {
  for (const _ of stripComments(fs.readFileSync(file, "utf8")).matchAll(/lead-finder-app\.com/g)) deadMentions += 1;
}
ok(deadMentions === DEAD_BARBER_SENDERS,
   `the retired domain appears ${DEAD_BARBER_SENDERS} times in live code, all on the dead barber path (found ${deadMentions})`);

/* ⛔ ANTI-VACUITY, BOTH WAYS. If that regex ever stops matching, every assertion above silently
   vanishes and this file goes green over a directory full of dead senders. */
ok(live >= 3, `it actually found the live senders (found ${live})`);
ok(dead === DEAD_BARBER_SENDERS, `exactly ${DEAD_BARBER_SENDERS} dead-path senders remain (found ${dead})`);

/* The constant the PAID email now reads, pinned BY NAME: a literal at the call site is precisely
   how this one drifted away from the rest of the product and stayed wrong for months. */
const webhook = fs.readFileSync(path.join(FN, "stripe-webhook", "index.ts"), "utf8");
ok(/const FROM_OPERATOR = "Findable alerts <alerts@findable\.live>";/.test(webhook),
   "stripe-webhook's operator sender is a named constant on findable.live");
ok(/from: FROM_OPERATOR,/.test(webhook), "the PAID email reads that constant rather than a literal");

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
