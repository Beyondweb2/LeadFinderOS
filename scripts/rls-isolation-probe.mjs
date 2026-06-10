// Phase 0 RLS isolation probe for generated_sites.
//
// Proves the ownership/RLS/trigger layer end-to-end with REAL authenticated
// sessions (RLS keys off auth.uid(), so it can only be tested as signed-in users).
//
// What it checks:
//   anon    — reads (site_name,content) of a PUBLISHED row; CANNOT read owner_id
//             (column grant); sees NO draft rows (row RLS).
//   barberN — reads/edits ONLY their own site; sees 0 rows for the other barber's
//             site and for the unclaimed draft; the lock trigger BLOCKS changing
//             site_name / owner_id on their own row.
//   admin   — full access to every row.
//
// Safety: the only intended writes are (a) a no-op content update on a barber's
// own row and (b) protected-field changes that the trigger MUST reject. If the
// trigger were missing and a protected field actually changed, the admin session
// restores the original value at the end. Pass --assign to (re)assign the two test
// sites to the two barbers first (admin-only owner_id PATCH).
//
// Run from the leadfinderapp dir (needs its node_modules):
//   $env:BARBER1_EMAIL="..."; $env:BARBER1_PASSWORD="..."
//   $env:BARBER2_EMAIL="..."; $env:BARBER2_PASSWORD="..."
//   $env:ADMIN_EMAIL="...";   $env:ADMIN_PASSWORD="..."
//   node scripts/rls-isolation-probe.mjs --assign   # first run, to assign owners
//   node scripts/rls-isolation-probe.mjs            # subsequent verify runs
//
// Reads VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY from .env automatically.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// ---- config -----------------------------------------------------------------
const SLUGS = {
  barber1: process.env.SITE_BARBER1 || "northern-quarter-barber-4f9d86d1", // draft → barber1
  barber2: process.env.SITE_BARBER2 || "cirta-city-barber-23bc7260",       // draft → barber2
  unclaimed: process.env.SITE_UNCLAIMED || "joseph-of-mayfair-barbers-2481a532", // stays unclaimed
  published: process.env.SITE_PUBLISHED || "wicked-vip-mobile-barber-8268ad6f",   // published
};
const ASSIGN = process.argv.includes("--assign");
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

// ---- load public env from .env ----------------------------------------------
function loadEnv() {
  let url = process.env.VITE_SUPABASE_URL;
  let key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  try {
    const raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const [, k, v] = m;
      const val = v.replace(/^["']|["']$/g, "");
      if (k === "VITE_SUPABASE_URL" && !url) url = val;
      if (k === "VITE_SUPABASE_PUBLISHABLE_KEY" && !key) key = val;
    }
  } catch { /* fall back to process.env */ }
  if (!url || !key) {
    console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY (.env or env).");
    process.exit(2);
  }
  return { url, key };
}

const { url, key } = loadEnv();
const mkClient = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

function need(name) {
  const v = process.env[name];
  if (!v) { console.error(`Missing required env var ${name}`); process.exit(2); }
  return v;
}

async function signIn(label, emailVar, passVar) {
  const client = mkClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: need(emailVar),
    password: need(passVar),
  });
  if (error || !data?.user) {
    console.error(`Sign-in failed for ${label} (${emailVar}): ${error?.message}`);
    process.exit(2);
  }
  return { client, uid: data.user.id, email: data.user.email };
}

// ---- assertions -------------------------------------------------------------
const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  const tag = pass ? "PASS" : "FAIL";
  console.log(`  [${tag}] ${name}${detail ? ` — ${detail}` : ""}`);
}

async function selectRow(client, cols, id) {
  return await client.from("generated_sites").select(cols).eq("id", id);
}

async function main() {
  console.log(`Supabase: ${url}`);
  console.log(`Mode: ${ASSIGN ? "ASSIGN + VERIFY" : "VERIFY ONLY"}\n`);

  const barber1 = await signIn("barber1", "BARBER1_EMAIL", "BARBER1_PASSWORD");
  const barber2 = await signIn("barber2", "BARBER2_EMAIL", "BARBER2_PASSWORD");
  const admin = await signIn("admin", "ADMIN_EMAIL", "ADMIN_PASSWORD");
  const anon = mkClient();

  // Resolve slugs → ids as admin (admin can read all).
  const { data: sites, error: sErr } = await admin.client
    .from("generated_sites")
    .select("id, site_name, status, owner_id, lead_id")
    .in("site_name", Object.values(SLUGS));
  if (sErr) { console.error("Admin slug lookup failed:", sErr.message); process.exit(2); }
  const bySlug = Object.fromEntries((sites || []).map((r) => [r.site_name, r]));
  for (const [k, slug] of Object.entries(SLUGS)) {
    if (!bySlug[slug]) { console.error(`Site not found for ${k}: ${slug}`); process.exit(2); }
  }
  const S = {
    barber1: bySlug[SLUGS.barber1],
    barber2: bySlug[SLUGS.barber2],
    unclaimed: bySlug[SLUGS.unclaimed],
    published: bySlug[SLUGS.published],
  };

  // ---- optional assignment (admin) ----
  if (ASSIGN) {
    console.log("Assigning test owners (admin)…");
    for (const [site, owner] of [[S.barber1, barber1], [S.barber2, barber2]]) {
      const { error } = await admin.client
        .from("generated_sites").update({ owner_id: owner.uid }).eq("id", site.id);
      console.log(`  ${site.site_name} → ${owner.email}: ${error ? "ERROR " + error.message : "ok"}`);
    }
    // Make sure the "unclaimed" one really is unclaimed.
    await admin.client.from("generated_sites").update({ owner_id: null }).eq("id", S.unclaimed.id);
    console.log("");
  }

  // ============================ ANON ============================
  console.log("ANON (logged-out):");
  {
    const pub = await anon.from("generated_sites").select("site_name, content").eq("id", S.published.id);
    record("anon reads (site_name,content) of published row",
      !pub.error && (pub.data?.length === 1), pub.error ? pub.error.message : `${pub.data?.length} row(s)`);

    const owner = await anon.from("generated_sites").select("owner_id").eq("id", S.published.id);
    // PASS = denied (error) OR no owner_id leaked. The grant fix should make this a hard error.
    const denied = !!owner.error;
    record("anon CANNOT read owner_id (column grant)", denied,
      denied ? owner.error.message : `LEAKED owner_id: ${JSON.stringify(owner.data)}`);

    const draft = await anon.from("generated_sites").select("site_name, content").eq("id", S.unclaimed.id);
    record("anon sees NO draft row (row RLS)",
      !draft.error && (draft.data?.length === 0), draft.error ? draft.error.message : `${draft.data?.length} row(s)`);
  }

  // ============================ BARBERS ============================
  for (const [label, me, other] of [["barber1", barber1, barber2], ["barber2", barber2, barber1]]) {
    console.log(`\n${label.toUpperCase()} (${me.email}):`);
    const mySite = label === "barber1" ? S.barber1 : S.barber2;
    const otherSite = label === "barber1" ? S.barber2 : S.barber1;

    const own = await selectRow(me.client, "id, site_name, status", mySite.id);
    record(`${label} reads own site`, !own.error && own.data?.length === 1,
      own.error ? own.error.message : `${own.data?.length} row(s)`);

    const otherRead = await selectRow(me.client, "id", otherSite.id);
    record(`${label} sees 0 rows for the other barber's site`,
      !otherRead.error && otherRead.data?.length === 0,
      otherRead.error ? otherRead.error.message : `${otherRead.data?.length} row(s)`);

    const unclaimedRead = await selectRow(me.client, "id", S.unclaimed.id);
    record(`${label} sees 0 rows for the unclaimed draft`,
      !unclaimedRead.error && unclaimedRead.data?.length === 0,
      unclaimedRead.error ? unclaimedRead.error.message : `${unclaimedRead.data?.length} row(s)`);

    // Allowed: no-op content update on own row.
    const cur = await selectRow(me.client, "content", mySite.id);
    const upd = await me.client.from("generated_sites")
      .update({ content: cur.data?.[0]?.content ?? {} }).eq("id", mySite.id).select("id");
    record(`${label} CAN update own content`, !upd.error && upd.data?.length === 1,
      upd.error ? upd.error.message : `${upd.data?.length} row(s) updated`);

    // Denied: update other barber's site → RLS makes it affect 0 rows.
    const updOther = await other.client; // (ensure other is signed in; not used directly)
    void updOther;
    const updOtherTry = await me.client.from("generated_sites")
      .update({ status: "published" }).eq("id", otherSite.id).select("id");
    record(`${label} update of other's site affects 0 rows`,
      !updOtherTry.error && (updOtherTry.data?.length ?? 0) === 0,
      updOtherTry.error ? updOtherTry.error.message : `${updOtherTry.data?.length ?? 0} row(s)`);

    // Trigger: changing site_name on own row must be rejected.
    const nameTry = await me.client.from("generated_sites")
      .update({ site_name: mySite.site_name + "-probe" }).eq("id", mySite.id).select("id");
    record(`${label} CANNOT change site_name (lock trigger)`, !!nameTry.error,
      nameTry.error ? nameTry.error.message : "NO ERROR — trigger did not block!");

    // Trigger: changing owner_id on own row must be rejected.
    const ownerTry = await me.client.from("generated_sites")
      .update({ owner_id: ZERO_UUID }).eq("id", mySite.id).select("id");
    record(`${label} CANNOT change owner_id (lock trigger)`, !!ownerTry.error,
      ownerTry.error ? ownerTry.error.message : "NO ERROR — trigger did not block!");
  }

  // ============================ ADMIN ============================
  console.log(`\nADMIN (${admin.email}):`);
  {
    const all = await admin.client.from("generated_sites")
      .select("id").in("id", [S.barber1.id, S.barber2.id, S.unclaimed.id, S.published.id]);
    record("admin reads all 4 test sites", !all.error && all.data?.length === 4,
      all.error ? all.error.message : `${all.data?.length} row(s)`);
  }

  // ---- self-heal: restore any protected field that drifted (trigger missing) ----
  console.log("\nIntegrity restore (admin):");
  for (const orig of [S.barber1, S.barber2]) {
    const { data: now } = await admin.client.from("generated_sites")
      .select("site_name, owner_id").eq("id", orig.id).maybeSingle();
    const drift = now && (now.site_name !== orig.site_name || now.owner_id !== orig.owner_id);
    if (drift) {
      await admin.client.from("generated_sites")
        .update({ site_name: orig.site_name, owner_id: orig.owner_id }).eq("id", orig.id);
      console.log(`  RESTORED ${orig.site_name} (protected field had drifted — trigger FAILED)`);
    } else {
      console.log(`  ${orig.site_name}: unchanged ✓`);
    }
  }

  // ---- verdict ----
  const failed = results.filter((r) => !r.pass);
  console.log(`\n================ ${failed.length === 0 ? "ALL PASS ✅" : `${failed.length} FAILED ❌`} ================`);
  if (failed.length) for (const f of failed) console.log(`  FAIL: ${f.name} — ${f.detail}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error("Probe crashed:", e); process.exit(2); });
