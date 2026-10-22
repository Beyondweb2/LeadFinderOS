import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Callout } from '@/components/operator/ui';
import { useCountrySettings } from '@/hooks/useCountrySettings';
import { countryAutoOffRuleWords, countryAutoPauseHeadline } from '@/lib/countryAutoPause';
import { SMS_SENDER_WORDS, checkCountryValue, hhmm, MARKET_NAME, MAX_COUNTRY_DAILY_CAP, WHATSAPP_ONLY_MARKETS, PER_LEAD_ZONE_MARKETS, type Market, type CountrySetting } from '@/lib/outreachMarkets';

/* ══ SENDING BY COUNTRY — ADMIN ONLY (2026-10-14, Malaysia / Singapore; src/lib/outreachMarkets.ts) ═════════════════
   One row per country: a switch for WhatsApp, SMS and browser calling, the country's own daily caps and its local send
   hours. Saved through set_outreach_country (admin-only on the server). The UK row's hours and caps are the existing
   queue settings above (07:00-21:30 London, the team cap), so only its switches are shown here.
   Australia (2026-10-22): WhatsApp only (its SMS / call switches are shown off and cannot be turned on); its hours are read
   in each lead's own zone, Mon–Fri; its cap is its own budget, outside the team cap. */

const ROWS: Market[] = ['UK', 'MY', 'SG', 'AU'];
const t = (n: number | null | undefined) => (n == null ? '' : String(n));
const toMin = (s: string): number | null | 'bad' => {
  const v = s.trim();
  if (!v) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(v);
  if (!m) return 'bad';
  const n = Number(m[1]) * 60 + Number(m[2]);
  return Number(m[1]) > 24 || Number(m[2]) > 59 || n > 1440 ? 'bad' : n;
};

export function CountrySendingSettings() {
  const { settings, loaded, error, save } = useCountrySettings();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Market | null>(null);
  const [draft, setDraft] = useState<Record<Market, { wa: string; sms: string; start: string; end: string }>>(
    { UK: { wa: '', sms: '', start: '', end: '' }, MY: { wa: '', sms: '', start: '', end: '' }, SG: { wa: '', sms: '', start: '', end: '' },
      AU: { wa: '', sms: '', start: '', end: '' } });

  useEffect(() => {
    if (!open) return;
    const row = (s: CountrySetting) => ({ wa: t(s.whatsapp_daily_cap), sms: t(s.sms_daily_cap),
      start: s.send_start_min == null ? '' : hhmm(s.send_start_min), end: s.send_end_min == null ? '' : hhmm(s.send_end_min) });
    setDraft({ UK: row(settings.UK), MY: row(settings.MY), SG: row(settings.SG), AU: row(settings.AU) });
  }, [open, settings]);

  const apply = async (m: Market, patch: Record<string, unknown>, done: string) => {
    setBusy(m);
    try { await save(m, patch); toast({ title: done, description: 'It applies from the next queue tick.' }); }
    catch (e) { toast({ title: 'Not saved', description: (e as Error)?.message ?? 'Failed', variant: 'destructive' }); }
    finally { setBusy(null); }
  };

  const saveRow = (m: Market) => {
    const d = draft[m];
    const wa = checkCountryValue('whatsapp_daily_cap', d.wa);
    const sms = checkCountryValue('sms_daily_cap', d.sms);
    const start = toMin(d.start); const end = toMin(d.end);
    if (!wa.ok || !sms.ok) { toast({ title: 'A cap is out of range', description: `Use a whole number 0–${MAX_COUNTRY_DAILY_CAP}, or leave it blank.`, variant: 'destructive' }); return; }
    if (start === 'bad' || end === 'bad' || (start != null && end != null && start >= end)) {
      toast({ title: 'Check the hours', description: 'Use 24-hour times like 09:00 and 19:00, with the start before the end.', variant: 'destructive' }); return;
    }
    const patch: Record<string, unknown> = { whatsapp_daily_cap: wa.value, send_start_min: start, send_end_min: end };
    if (!WHATSAPP_ONLY_MARKETS.has(m)) patch.sms_daily_cap = sms.value;
    void apply(m, patch, `${MARKET_NAME[m]} limits saved`);
  };

  const summary = ROWS.filter((m) => m !== 'UK').map((m) => {
    const s = settings[m];
    const waOnly = WHATSAPP_ONLY_MARKETS.has(m);
    const on = [s.whatsapp_on && 'WhatsApp', !waOnly && s.sms_on && 'SMS', !waOnly && s.call_on && 'calls'].filter(Boolean);
    return `${MARKET_NAME[m]}: ${on.length ? on.join(', ') : 'off'}`;
  }).join(' · ');

  /* A country that switched ITSELF off (country_whatsapp_auto_pause, 2026-10-15): said in a banner that shows even with
     the settings folded, in the stored words, until a person switches it back on. */
  const autoOff = ROWS.filter((m) => m !== 'UK' && settings[m].whatsapp_on !== true && settings[m].whatsapp_auto_pause_reason);

  return (
    <div className="mt-2 space-y-2" data-testid="country-sending">
      {autoOff.map((m) => (
        <Callout key={m} tone="red" icon={AlertTriangle} className="px-3 py-2 text-[11px]" testId={`country-auto-off-${m}`}>
          <strong>{countryAutoPauseHeadline(MARKET_NAME[m])}</strong>
          {settings[m].whatsapp_auto_paused_at ? ` on ${new Date(settings[m].whatsapp_auto_paused_at as string).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })}` : ''}.
          {' '}{settings[m].whatsapp_auto_pause_reason}
        </Callout>
      ))}
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground" data-testid="country-sending-toggle">
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Countries: UK on · {summary}
      </button>
      {open && (
        <div className="rounded-xl bg-muted/30 p-3 ring-1 ring-inset ring-border/40 space-y-3 text-xs" data-testid="country-sending-form">
          {error && <Callout tone="red" icon={AlertTriangle} className="px-3 py-2 text-[11px]">Could not read the country settings, so Malaysia, Singapore and Australia are treated as off.</Callout>}
          {!loaded && !error && <p className="text-muted-foreground">Loading…</p>}
          {loaded && ROWS.map((m) => {
            const s = settings[m];
            const waOnly = WHATSAPP_ONLY_MARKETS.has(m);
            return (
              <div key={m} className="rounded-lg bg-background/60 p-2.5 ring-1 ring-inset ring-border/40 space-y-2" data-testid={`country-row-${m}`}>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                  <span className="w-32 font-medium">{MARKET_NAME[m]}</span>
                  {([['whatsapp_on', 'WhatsApp'], ['sms_on', 'SMS'], ['call_on', 'Browser calls']] as const).filter(([k]) => !waOnly || k === 'whatsapp_on').map(([k, label]) => (
                    <label key={k} className="flex items-center gap-1.5">
                      <Switch checked={s[k] === true} disabled={busy === m}
                        onCheckedChange={(v) => void apply(m, { [k]: v }, `${MARKET_NAME[m]} ${label} ${v ? 'on' : 'off'}`)}
                        data-testid={`country-${m}-${k}`} />
                      {label}
                    </label>
                  ))}
                  {waOnly && <span className="text-[11px] text-muted-foreground" data-testid={`country-${m}-whatsapp-only`}>SMS and browser calls: never (WhatsApp only, prospect-only)</span>}
                  {busy === m && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                </div>
                {m === 'UK' ? (
                  <p className="text-[11px] text-muted-foreground">UK hours and caps are the queue limits above (WhatsApp 07:00–21:30, texts 09:00–20:00 London).</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 items-end">
                    <label className="flex flex-col gap-1"><span className="text-muted-foreground">WhatsApp a day</span>
                      <Input className="h-8" inputMode="numeric" value={draft[m].wa} onChange={(e) => setDraft((d) => ({ ...d, [m]: { ...d[m], wa: e.target.value } }))} placeholder="No country cap" data-testid={`country-${m}-wa-cap`} /></label>
                    {waOnly ? (
                      <div className="flex flex-col gap-1"><span className="text-muted-foreground">Texts a day</span>
                        <span className="h-8 flex items-center text-muted-foreground">Never (WhatsApp only)</span></div>
                    ) : (
                      <label className="flex flex-col gap-1"><span className="text-muted-foreground">Texts a day</span>
                        <Input className="h-8" inputMode="numeric" value={draft[m].sms} onChange={(e) => setDraft((d) => ({ ...d, [m]: { ...d[m], sms: e.target.value } }))} placeholder="No country cap" /></label>
                    )}
                    <label className="flex flex-col gap-1"><span className="text-muted-foreground">{PER_LEAD_ZONE_MARKETS.has(m) ? 'From (lead’s local)' : 'From (local)'}</span>
                      <Input className="h-8" value={draft[m].start} onChange={(e) => setDraft((d) => ({ ...d, [m]: { ...d[m], start: e.target.value } }))} placeholder="09:00" /></label>
                    <label className="flex flex-col gap-1"><span className="text-muted-foreground">{PER_LEAD_ZONE_MARKETS.has(m) ? 'Until (lead’s local)' : 'Until (local)'}</span>
                      <Input className="h-8" value={draft[m].end} onChange={(e) => setDraft((d) => ({ ...d, [m]: { ...d[m], end: e.target.value } }))} placeholder={PER_LEAD_ZONE_MARKETS.has(m) ? '17:00' : '19:00'} /></label>
                    <Button size="sm" className="h-8 text-xs" disabled={busy === m} onClick={() => saveRow(m)} data-testid={`country-${m}-save`}>Save</Button>
                  </div>
                )}
                {m !== 'UK' && (
                  <p className="text-[11px] text-muted-foreground" data-testid={`country-${m}-auto-off-rule`}>{countryAutoOffRuleWords(s)}</p>
                )}
                {PER_LEAD_ZONE_MARKETS.has(m) && (
                  <p className="text-[11px] text-muted-foreground" data-testid={`country-${m}-zone-note`}>
                    Monday–Friday only, in each lead’s own time zone from its state (Sydney, Melbourne, Hobart, Brisbane, Adelaide, Darwin or Perth).
                    A lead with no state is held as “Needs state”. Its daily cap is its own budget: it does not count against the team cap, and the team cap does not stop it.
                  </p>
                )}
              </div>
            );
          })}
          <p className="text-[11px] text-muted-foreground">
            ⛔ Cold WhatsApp to Malaysia, Singapore and Australia goes only through these switches — test a handful by hand first. A failed
            send there is never retried automatically: that lead is handed back. While a country is off, its queued leads wait in the
            queue and send when it is switched back on.
            {' '}Malaysia and Singapore send in their own time (UTC+8). Their caps come on top of the team cap — the team cap still counts every message.
            {' '}Australia is prospect-only: no price, sign-up or checkout message is ever sent there.
            {' '}WhatsApp templates are written in English for UK businesses: send only the openers, and not explain_offer / explain_offer_v2 (they quote £ prices and “UK businesses”).
          </p>
          <Callout tone="amber" icon={AlertTriangle} className="px-3 py-2 text-[11px]" testId="country-sms-warning">{SMS_SENDER_WORDS}</Callout>
        </div>
      )}
    </div>
  );
}
