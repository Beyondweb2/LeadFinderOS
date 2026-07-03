import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bell, KeyRound, Sparkles } from 'lucide-react';
import type { SiteAlert } from '@/hooks/useDashboardMetrics';

interface AlertsCardProps {
  alerts: SiteAlert[];
}

/** Short relative time (mirrors the Inbox's relTime): now / 5m / 3h / 2d / date. */
function relTime(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString();
}

/**
 * Recent site claims + add-on/upsell requests, newest-first (from generated_sites'
 * claimed_at / addon_interest_at, RLS-scoped in useDashboardMetrics). Replaces the
 * old "Businesses contacted" box. Distinct icon/colour per type so it's scannable.
 */
export function AlertsCard({ alerts }: AlertsCardProps) {
  return (
    <Card className="bg-gradient-to-br from-purple-500/10 via-violet-500/5 to-transparent border-purple-500/20">
      <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-4 md:p-6">
        <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1.5 sm:gap-2">
          <Bell className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-purple-500" />
          <span className="truncate">Alerts</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0 md:p-6 md:pt-0">
        {alerts.length === 0 ? (
          <div className="py-6 text-center">
            <Bell className="mx-auto mb-1 h-4 w-4 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">No claims or add-on requests yet.</p>
          </div>
        ) : (
          <div className="max-h-[260px] space-y-0.5 overflow-y-auto pr-0.5">
            {alerts.map((a, i) => {
              const isClaim = a.type === 'claim';
              return (
                <div
                  key={`${a.leadId ?? 'x'}-${a.type}-${i}`}
                  className="flex items-center justify-between gap-2 rounded-md p-2"
                >
                  <span className="flex min-w-0 items-center gap-1.5 text-sm">
                    {isClaim ? (
                      <KeyRound className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                    )}
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{a.businessName}</span>{' '}
                      <span className="text-muted-foreground">
                        {isClaim ? 'claimed the site' : 'requested the add-on'}
                      </span>
                    </span>
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{relTime(a.at)}</span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
