import { Card, CardContent } from '@/components/ui/card';

interface PostSearchTipsProps {
  searchCount: number;
}

export function PostSearchTips({ searchCount }: PostSearchTipsProps) {
  if (searchCount === 1) {
    return (
      <Card className="mt-4 border-border/40 bg-muted/30">
        <CardContent className="p-4 space-y-2">
          <p className="text-sm font-medium text-foreground/80">Quick Outreach Tips</p>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
            <li>Start casual – ask if this is the correct number</li>
            <li>Don't send links or images in your first message</li>
            <li>Keep it short and human</li>
            <li>Focus on starting a conversation, not pitching</li>
          </ul>
          <p className="text-[11px] text-muted-foreground/60 italic pt-1">
            The goal is to start a conversation, not close a deal immediately.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (searchCount === 2) {
    return (
      <Card className="mt-4 border-border/40 bg-muted/30">
        <CardContent className="p-4 space-y-2">
          <p className="text-sm font-medium text-foreground/80">Stay Consistent</p>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
            <li>If no reply after 2–3 days, send a short follow-up</li>
            <li>Keep it friendly</li>
            <li>Avoid long explanations</li>
          </ul>
          <p className="text-[11px] text-muted-foreground/60 italic pt-1">
            Consistency builds momentum.
          </p>
        </CardContent>
      </Card>
    );
  }

  return null;
}
