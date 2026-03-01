import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Zap, Phone, MessageCircle, Mail, Facebook, UserCheck, Send } from 'lucide-react';

interface OutreachActivityCardProps {
  totalContacted: number;
  contactedToday: number;
  callsMade: number;
  whatsappSent: number;
  smsSent: number;
  emailsSent: number;
  facebookSent: number;
  manualContacted: number;
}

const typeItems = [
  { key: 'calls', icon: Phone, color: 'text-amber-500', label: 'Calls' },
  { key: 'whatsapp', icon: MessageCircle, color: 'text-green-500', label: 'WhatsApp' },
  { key: 'sms', icon: Send, color: 'text-sky-400', label: 'SMS' },
  { key: 'email', icon: Mail, color: 'text-blue-500', label: 'Email' },
  { key: 'facebook', icon: Facebook, color: 'text-indigo-400', label: 'Facebook' },
  { key: 'manual', icon: UserCheck, color: 'text-muted-foreground', label: 'Manual' },
] as const;

export function OutreachActivityCard(props: OutreachActivityCardProps) {
  const counts: Record<string, number> = {
    calls: props.callsMade,
    whatsapp: props.whatsappSent,
    sms: props.smsSent,
    email: props.emailsSent,
    facebook: props.facebookSent,
    manual: props.manualContacted,
  };

  return (
    <Card className="bg-gradient-to-br from-blue-500/10 via-indigo-500/5 to-transparent border-blue-500/20 col-span-2 lg:col-span-2">
      <CardHeader className="pb-1 p-3 sm:p-4 md:p-6">
        <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Zap className="h-4 w-4 text-blue-500" />
          Outreach Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0 md:p-6 md:pt-0 space-y-3">
        {/* Hero numbers */}
        <div className="flex items-end gap-6">
          <div>
            <div className="text-3xl sm:text-4xl font-bold text-blue-500">
              {props.totalContacted.toLocaleString()}
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Lifetime Contacted</p>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold text-foreground">
              {props.contactedToday}
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Today</p>
          </div>
        </div>

        {/* Type breakdown grid */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-2 border-t border-border/50">
          {typeItems.map(({ key, icon: Icon, color, label }) => (
            <div key={key} className="text-center py-1.5">
              <Icon className={`h-3.5 w-3.5 mx-auto mb-0.5 ${color}`} />
              <div className="text-sm sm:text-base font-semibold">{counts[key]}</div>
              <p className="text-[9px] sm:text-[10px] text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
