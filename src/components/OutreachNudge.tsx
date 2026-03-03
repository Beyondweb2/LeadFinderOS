import { Lightbulb } from 'lucide-react';

const NUDGES: Record<string, string> = {
  replied: "Send a short voice note to increase trust.",
  interested: "Offer a paid draft instead of a free build.",
  wants_draft: "Send a clear scope & price before starting any work.",
  sent_initial_text: "Follow up in 48 hours if no reply.",
};

interface OutreachNudgeProps {
  status: string;
}

export function OutreachNudge({ status }: OutreachNudgeProps) {
  const tip = NUDGES[status];
  if (!tip) return null;

  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground mt-2">
      <Lightbulb className="h-3.5 w-3.5 shrink-0 text-amber-500 mt-0.5" />
      <span><span className="font-medium text-foreground">Tip:</span> {tip}</span>
    </div>
  );
}
