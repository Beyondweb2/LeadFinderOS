import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Copy, CheckCheck, RefreshCw, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { OutreachLead } from '@/types/outreach';

interface AiOpenerModalProps {
  lead: OutreachLead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when user clicks a message to use it */
  onSelectMessage?: (message: string) => void;
}

export function AiOpenerModal({ lead, open, onOpenChange, onSelectMessage }: AiOpenerModalProps) {
  const [messages, setMessages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const { toast } = useToast();

  const generate = async () => {
    if (!lead) return;
    setIsLoading(true);
    setMessages([]);
    setCopiedIdx(null);

    try {
      const { data, error } = await supabase.functions.invoke('admin-ai-opener', {
        body: {
          business_name: lead.business_name,
          category: lead.category || null,
          website: lead.website || null,
          address: lead.address || null,
          notes: lead.notes || null,
        },
      });

      if (error) throw error;
      if (data?.messages && Array.isArray(data.messages)) {
        setMessages(data.messages);
      } else if (data?.error) {
        toast({ title: 'Error', description: data.error, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to generate', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-generate when modal opens
  useEffect(() => {
    if (open && lead && messages.length === 0 && !isLoading) {
      generate();
    }
    // Reset state when modal closes
    if (!open) {
      setMessages([]);
      setCopiedIdx(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lead]);

  const copyMessage = async (msg: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(msg);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    } catch {
      toast({ title: 'Copy failed', variant: 'destructive' });
    }
  };

  const selectMessage = (msg: string) => {
    if (onSelectMessage) {
      onSelectMessage(msg);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Opener — {lead?.business_name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="ml-2 text-sm text-muted-foreground">Generating...</span>
            </div>
          )}

          {!isLoading && messages.map((msg, idx) => (
            <div
              key={idx}
              className={`group relative rounded-lg border border-border/50 bg-muted/30 p-3 ${onSelectMessage ? 'cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors' : ''}`}
              onClick={() => onSelectMessage && selectMessage(msg)}
            >
              <p className="text-sm pr-8 whitespace-pre-wrap">{msg}</p>
              <button
                onClick={(e) => { e.stopPropagation(); copyMessage(msg, idx); }}
                className="absolute top-2 right-2 p-1.5 rounded-md hover:bg-background/80 text-muted-foreground hover:text-foreground transition-colors"
                title="Copy"
              >
                {copiedIdx === idx ? (
                  <CheckCheck className="h-3.5 w-3.5 text-green-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          ))}

          {!isLoading && messages.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={generate}
              className="w-full text-xs"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Regenerate
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
