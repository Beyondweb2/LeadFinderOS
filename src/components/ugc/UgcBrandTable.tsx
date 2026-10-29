import { AtSign, BadgeCheck, Instagram, Lock, Mail, MessageCircle, Phone } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ToneChip } from '@/components/operator/ui';
import { TIER_TONE, tierLabel } from './tierTone';
import { UGC_STATUS_LABEL, UGC_STATUS_TONE, type UgcStatus } from '@/lib/ugc/config';
import { CONTACT_KIND_LABEL, type BrandView } from '@/lib/ugc/brandView';
import type { UgcBrand } from '@/hooks/useUgc';
import { cn } from '@/lib/utils';


export function StatusChip({ status }: { status: string }) {
  const s = status as UgcStatus;
  return <ToneChip tone={UGC_STATUS_TONE[s] ?? 'grey'} dot testId="ugc-status">{UGC_STATUS_LABEL[s] ?? status}</ToneChip>;
}

const CHANNEL_ICON = { email: Mail, instagram: Instagram, whatsapp: MessageCircle } as const;

export function UgcBrandTable({ rows, onOpen, selected, onToggle }: {
  rows: { brand: UgcBrand; view: BrandView }[];
  onOpen: (id: string) => void;
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table data-testid="ugc-brand-table">
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead>Brand</TableHead>
            <TableHead>Tier</TableHead>
            <TableHead>Best contact</TableHead>
            <TableHead>WhatsApp</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Next</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ brand: b, view: v }) => {
            const Ch = b.active_channel ? CHANNEL_ICON[b.active_channel as keyof typeof CHANNEL_ICON] : null;
            const mobile = v.wa.find((w) => w.worthTrying);
            const fu = v.followUp;
            return (
              <TableRow key={b.id} className={cn('cursor-pointer', v.hidden && 'opacity-60')} onClick={() => onOpen(b.id)} data-testid="ugc-brand-row">
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" aria-label={`Select ${b.name}`} checked={selected.has(b.id)} onChange={() => onToggle(b.id)} className="h-4 w-4 accent-primary" />
                </TableCell>
                <TableCell className="min-w-[200px]">
                  <p className="font-semibold leading-tight">{b.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{[b.domain, b.niche, b.country].filter(Boolean).join(' · ') || '—'}</p>
                </TableCell>
                <TableCell className="min-w-[120px]">
                  <ToneChip tone={TIER_TONE[v.tier.tier]} title={v.tier.why}>{tierLabel(v.tier.tier)}</ToneChip>
                  <p className="mt-0.5 max-w-[180px] truncate text-[11px] text-muted-foreground" title={v.tier.why}>{v.tier.why}</p>
                </TableCell>
                <TableCell className="min-w-[180px]">
                  <span className="inline-flex items-center gap-1 text-xs font-medium">
                    {v.contact.kind === 'named' ? <BadgeCheck className="h-3.5 w-3.5 text-teal-500" /> : v.contact.kind === 'instagram' ? <Instagram className="h-3.5 w-3.5" /> : <AtSign className="h-3.5 w-3.5 text-muted-foreground" />}
                    {CONTACT_KIND_LABEL[v.contact.kind]}
                  </span>
                  <p className="max-w-[200px] truncate text-[11px] text-muted-foreground">{v.contact.person ? `${v.contact.person.name}, ${v.contact.person.title}` : v.contact.email ?? ''}</p>
                </TableCell>
                <TableCell>
                  {mobile ? <ToneChip tone="green" icon={MessageCircle} title={mobile.sourceLabel}>{mobile.lineType === 'mobile' ? 'Mobile' : 'Chat button'}</ToneChip>
                    : v.wa.length ? <ToneChip tone="grey" icon={Phone} title={v.wa[0].sourceLabel}>Landline</ToneChip>
                    : <span className="text-xs text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="min-w-[130px]">
                  <div className="flex items-center gap-1.5">
                    <StatusChip status={b.status} />
                    {Ch && <span title={`Active channel: ${b.active_channel}`} className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground"><Lock className="h-3 w-3" /><Ch className="h-3 w-3" /></span>}
                  </div>
                </TableCell>
                <TableCell className="min-w-[140px] text-xs">
                  {fu.next ? <span className={cn(fu.overdue && 'font-semibold text-amber-600 dark:text-amber-400')}>{fu.next === 'follow_up_1' ? 'Follow-up 1' : 'Follow-up 2'} · {fu.nextDue}</span>
                    : b.todo ? <span>{b.todo}{b.todo_on ? ` · ${b.todo_on}` : ''}</span>
                    : <span className="text-muted-foreground">—</span>}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
