/* STRIPE TEST-MODE SETUP FOR THE PAYMENT PLANS (2026-10-29; src/lib/paymentPlans.ts, docs/payment-options-live-setup.md).

   Creates (once — idempotent by lookup_key) the ONE new Stripe object the plans need, and checks the one that exists:
     · findable_reduced_monthly  — Product "Findable Build — 12 months (monthly)", Price £49.99 / month (NEW)
     · findable_standard_monthly — the existing £99 / month Price (v5 plan and the six plan): READ ONLY, never created here
   Pay in full (£499) and every sign-up payment stay inline price_data in findable-checkout (they carry the guarantee as
   the line description, which a dashboard Price cannot).

   ⛔ TEST MODE ONLY. Refuses any key that is not sk_test_ / rk_test_. Never prints the key.
   Key source: env STRIPE_TEST_SECRET_KEY, else Windows Credential Manager target "Stripe:test" (generic credential).

   Run:  npx tsx scripts/stripe-payment-options-setup.ts            (dry run: says what it would do)
         npx tsx scripts/stripe-payment-options-setup.ts --apply    (creates what is missing, in TEST mode)
   Then set the printed price id as FINDABLE_REDUCED_MONTHLY_PRICE_ID on a TEST project's edge secrets. */
import { execFileSync } from 'node:child_process';
import { PAYMENT_PLAN_SPEC, REDUCED_MONTHLY_GBP } from '../src/lib/paymentPlans.ts';
import { FINDABLE_MONTHLY_GBP } from '../src/lib/findableOffer.ts';

const apply = process.argv.includes('--apply');

function keyFromCredentialManager(): string {
  if (process.platform !== 'win32') return '';
  const ps = [
    '$sig = \'using System; using System.Runtime.InteropServices; public class C { [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct CR { public int F; public int T; public string N; public string Cm; public System.Runtime.InteropServices.ComTypes.FILETIME W; public int S; public IntPtr B; public int P; public int AC; public IntPtr A; public string TA; public string U; } [DllImport("advapi32.dll", CharSet=CharSet.Unicode)] public static extern bool CredRead(string t, int ty, int f, out IntPtr c); public static string G(string t) { IntPtr p; if (!CredRead(t, 1, 0, out p)) return ""; var c = (CR)Marshal.PtrToStructure(p, typeof(CR)); var b = new byte[c.S]; Marshal.Copy(c.B, b, 0, b.Length); return System.Text.Encoding.Unicode.GetString(b); } }\';',
    'Add-Type -TypeDefinition $sig;',
    '[Console]::Out.Write([C]::G("Stripe:test"))',
  ].join(' ');
  try { return execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim(); } catch { return ''; }
}

const key = (process.env.STRIPE_TEST_SECRET_KEY ?? '').trim() || keyFromCredentialManager();
if (!key) {
  console.log('No Stripe TEST key found (env STRIPE_TEST_SECRET_KEY or Credential Manager "Stripe:test"). Nothing done.');
  process.exit(2);
}
if (!/^(sk|rk)_test_/.test(key)) {
  console.log('REFUSED: the key found is not a TEST-mode key. This script never touches live Stripe.');
  process.exit(3);
}

async function stripe(path: string, body?: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${key}`, ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    ...(body ? { body: new URLSearchParams(body).toString() } : {}),
  });
  const json = await res.json() as Record<string, unknown>;
  if (!res.ok) throw new Error(`Stripe ${path}: ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}

async function byLookupKey(k: string): Promise<Record<string, unknown> | null> {
  const r = await stripe(`prices?lookup_keys[]=${encodeURIComponent(k)}&active=true&limit=1`);
  return ((r.data as Record<string, unknown>[]) ?? [])[0] ?? null;
}

const pence = (gbp: number) => Math.round(gbp * 100);

(async () => {
  console.log(`Stripe TEST mode — ${apply ? 'APPLY' : 'dry run'}`);
  if (PAYMENT_PLAN_SPEC.twelve.monthlyGbp !== REDUCED_MONTHLY_GBP) throw new Error('paymentPlans.ts disagrees with itself');

  const reduced = await byLookupKey('findable_reduced_monthly');
  if (reduced) {
    const ok = reduced.unit_amount === pence(REDUCED_MONTHLY_GBP) && reduced.currency === 'gbp' && (reduced.recurring as { interval?: string })?.interval === 'month';
    console.log(`  £${REDUCED_MONTHLY_GBP}/month price exists: ${reduced.id} ${ok ? '(amount and interval correct)' : '— WRONG amount/interval, fix by hand'}`);
  } else if (!apply) {
    console.log(`  would create Product "Findable Build — 12 months (monthly)" + Price £${REDUCED_MONTHLY_GBP}/month, lookup_key findable_reduced_monthly`);
  } else {
    const product = await stripe('products', {
      name: 'Findable Build — 12 months (monthly)',
      description: `The ${PAYMENT_PLAN_SPEC.twelve.totalPayments - 1} monthly payments of the 12-month plan, after the £${PAYMENT_PLAN_SPEC.twelve.firstGbp} sign-up payment.`,
      'metadata[plan]': 'twelve',
    });
    const price = await stripe('prices', {
      product: String(product.id), currency: 'gbp', unit_amount: String(pence(REDUCED_MONTHLY_GBP)),
      'recurring[interval]': 'month', lookup_key: 'findable_reduced_monthly', nickname: `£${REDUCED_MONTHLY_GBP}/month (12-month plan)`,
    });
    console.log(`  created ${price.id} — set FINDABLE_REDUCED_MONTHLY_PRICE_ID to this on the TEST project`);
  }

  const standard = await byLookupKey('findable_standard_monthly');
  console.log(standard
    ? `  £${FINDABLE_MONTHLY_GBP}/month price (lookup_key findable_standard_monthly): ${standard.id}${standard.unit_amount === pence(FINDABLE_MONTHLY_GBP) ? '' : ' — WRONG amount'}`
    : `  no £${FINDABLE_MONTHLY_GBP}/month price tagged findable_standard_monthly in this TEST account — create one by hand (the six plan and the old plan use it) or point FINDABLE_STANDARD_MONTHLY_PRICE_ID at an existing test price`);
  console.log('Schedules are NOT Stripe objects: the webhook creates each subscription with cancel_at after the plan\'s last payment (delayed-subscription.ts).');
})().catch((e) => { console.error(String(e).replace(/(sk|rk)_test_[A-Za-z0-9]+/g, '[key]')); process.exit(1); });
