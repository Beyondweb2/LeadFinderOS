import { useQuery } from '@tanstack/react-query';
import { useSubscription } from '@/hooks/useSubscription';
import { invokeEdge } from '@/lib/edgeInvoke';
import type { ClientEarnings, CommissionLine, EarningsTotals } from '@/lib/commission';

/* Commission from the payment ledger (fn sales-earnings). A salesperson always gets their own — the
   server decides; `person` only matters for the admin ('all' | 'me' | a user id). */
export interface EarningsResponse {
  ok: true;
  scope: { person: string | null; self: boolean; role: string };
  lines: CommissionLine[];
  clients: (ClientEarnings & { remainingPotential: number; subscriptionStatus: string | null })[];
  totals: EarningsTotals;
  commissionable: boolean;
  bySeller: { sellerId: string; earned: number; due: number; offset: number; paidOut: number }[];
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
