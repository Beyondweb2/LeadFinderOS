import { useQuery } from '@tanstack/react-query';
import { useSubscription } from '@/hooks/useSubscription';
import { invokeEdge } from '@/lib/edgeInvoke';
import type { ClientEarnings, CommissionForecast, CommissionLine, EarningsTotals } from '@/lib/commission';

/* Commission from the payment ledger (fn sales-earnings). A salesperson always gets their own — the
   server decides; `person` only matters for the admin ('all' | 'me' | a user id). */
export interface EarningsResponse {
  ok: true;
  scope: { person: string | null; self: boolean; role: string };
  lines: CommissionLine[];
  clients: (ClientEarnings & { remainingPotential: number; subscriptionStatus: string | null; package: string | null })[];
  totals: EarningsTotals;
  commissionable: boolean;
  bySeller: { sellerId: string; earned: number; due: number; offset: number; paidOut: number }[];
  /** The next six London months (absent from a server deployed before 2026-10-02). */
  forecast?: CommissionForecast;
  /** The viewed person's engagement; null for everyone (absent from an older server). */
  engagement?: { status: 'active' | 'ended'; endedAt: string | null } | null;
  ms: number;
}

export const earningsKey = (role: string | null | undefined, person: string) => ['sales-earnings', role ?? null, person] as const;

export function useEarnings(person: string = 'me', enabled = true) {
  const { role } = useSubscription();
  return useQuery({
    queryKey: earningsKey(role, role === 'admin' ? person : 'me'),
    enabled: !!role && enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    queryFn: () => invokeEdge<EarningsResponse>('sales-earnings', { mode: 'summary', person: role === 'admin' ? person : 'me' }),
  });
}
