import { useToast } from '@/hooks/use-toast';
import { usePriceModel } from '@/hooks/usePriceModel';
import { PRICE_MODELS, PRICE_MODEL_LABEL, PRICE_MODEL_PAYMENT_LIVE, priceModelLinkRefusal, type PriceModel } from '@/lib/priceModel';
import { cn } from '@/lib/utils';

/* ONE CLICK BETWEEN THE PRICE MODELS (2026-10-14; src/lib/priceModel.ts). The person's own switch; the admin also sets
   the team default (what a person who never clicked gets). The call script and the Close tab follow it. A model whose
   payment is not live says so right here, so nobody pitches a price they cannot send a link for without knowing. */
export function PriceModelSwitch({ compact = false }: { compact?: boolean }) {
  const { toast } = useToast();
  const pm = usePriceModel();
  if (pm.isError) return null;
  const pick = (m: PriceModel) => pm.setMine.mutate(m, {
    onError: (e) => toast({ title: 'Price model not changed', description: (e as Error).message, variant: 'destructive' }),
  });
  const pickDefault = (m: PriceModel) => pm.setDefault.mutate(m, {
    onSuccess: () => toast({ title: 'Team default saved', description: `Everyone who has not chosen their own gets ${PRICE_MODEL_LABEL[m]}.` }),
    onError: (e) => toast({ title: 'Team default not changed', description: (e as Error).message, variant: 'destructive' }),
  });
  const notLive = priceModelLinkRefusal(pm.model);
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', compact ? 'text-xs' : 'text-sm')} data-testid="price-model-switch" data-model={pm.model}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Price model</span>
        <div className="inline-flex rounded-full bg-muted p-0.5" role="tablist" aria-label="Price model">
          {PRICE_MODELS.map((m) => (
            <button key={m} type="button" role="tab" aria-selected={pm.model === m} disabled={pm.isLoading || pm.setMine.isPending}
              onClick={() => pm.model !== m && pick(m)} data-testid={'price-model-' + m}
              className={cn('rounded-full px-3 py-1 text-xs font-semibold transition', pm.model === m ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
              {PRICE_MODEL_LABEL[m]}{!PRICE_MODEL_PAYMENT_LIVE[m] ? ' (no link yet)' : ''}
            </button>
          ))}
        </div>
        {pm.data?.isAdmin && (
          <label className="flex items-center gap-1 text-[11px] text-muted-foreground">Team default
            <select className="h-7 rounded-md border border-border/70 bg-background px-1.5 text-xs" value={pm.data.teamDefault}
              onChange={(e) => pickDefault(e.target.value as PriceModel)} disabled={pm.setDefault.isPending} data-testid="price-model-default">
              {PRICE_MODELS.map((m) => <option key={m} value={m}>{PRICE_MODEL_LABEL[m]}</option>)}
            </select>
          </label>
        )}
      </div>
      {notLive && <p className="text-[11px] text-amber-700 dark:text-amber-300" data-testid="price-model-not-live">{notLive}</p>}
    </div>
  );
}
