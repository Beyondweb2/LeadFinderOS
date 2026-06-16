import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Globe, Send, Eye, CheckCircle2, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface SiteFunnelCardProps {
  sent: number;
  opened: number;
  claimed: number;
  addonRequested: number;
}

function Stat({ icon: Icon, value, label, color }: { icon: LucideIcon; value: number; label: string; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Icon className={`h-3.5 w-3.5 ${color}`} />
        <span className="text-lg sm:text-2xl font-bold tabular-nums">{value}</span>
      </div>
      <p className="text-[10px] sm:text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

/**
 * Overall barber-site funnel for the operator: how many sites were sent, opened,
 * claimed, and had the booking/SMS add-on requested. Built from the same
 * generated_sites tracking columns the Outreach row badges use.
 */
export function SiteFunnelCard({ sent, opened, claimed, addonRequested }: SiteFunnelCardProps) {
  return (
    <Card className="bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border-amber-500/20">
      <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-4 md:p-6">
        <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1.5 sm:gap-2">
          <Globe className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-500" />
          <span className="truncate">Site funnel</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0 md:p-6 md:pt-0">
        <div className="grid grid-cols-4 gap-2 sm:gap-4">
          <Stat icon={Send} value={sent} label="Sent" color="text-blue-500" />
          <Stat icon={Eye} value={opened} label="Opened" color="text-purple-500" />
          <Stat icon={CheckCircle2} value={claimed} label="Claimed" color="text-green-500" />
          <Stat icon={Sparkles} value={addonRequested} label="Add-on" color="text-amber-500" />
        </div>
      </CardContent>
    </Card>
  );
}
