import type { Tone } from '@/components/operator/ui';

/* Tier colours on the UGC page: A teal (best), B blue, C purple, D amber, unrated grey, skip red. */
export const TIER_TONE: Record<string, Tone> = { A: 'green', B: 'blue', C: 'purple', D: 'amber', unrated: 'grey', local: 'purple', skip: 'red' };
export const tierLabel = (t: string) => (t === 'unrated' ? 'Unrated' : t === 'skip' ? 'Skip' : t === 'local' ? 'Local' : `Tier ${t}`);
