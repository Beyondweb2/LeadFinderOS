import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { MessageSquare, Send, AlertTriangle } from 'lucide-react';
import { generateWhatsAppUrl } from '@/lib/leadUtils';

interface SingleWhatsAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: { phone: string; business_name: string } | null;
}

const DEFAULT_TEMPLATE = `Hi {{business_name}},

I noticed your business doesn't have a website yet. I help local businesses get online with professional, affordable websites.

Would you be interested in a quick chat about how a website could help grow your business?

Best regards`;

export function SingleWhatsAppDialog({ open, onOpenChange, lead }: SingleWhatsAppDialogProps) {
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);

  // Live preview with business name replaced
  const previewMessage = useMemo(() => {
    if (!lead) return template;
    return template.replace(/\{\{business_name\}\}/g, lead.business_name);
  }, [template, lead]);

  const handleSend = () => {
    if (!lead || !lead.phone) return;
    
    const message = template.replace(/\{\{business_name\}\}/g, lead.business_name);
    const url = generateWhatsAppUrl(lead.phone, message);
    window.open(url, '_blank');
    onOpenChange(false);
  };

  if (!lead) return null;

  const hasPhone = Boolean(lead.phone);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-green-500" />
            WhatsApp Message
          </DialogTitle>
          <DialogDescription>
            Send a WhatsApp message to <span className="font-semibold text-foreground">{lead.business_name}</span>
          </DialogDescription>
        </DialogHeader>

        {!hasPhone ? (
          <Alert className="border-amber-500/50 bg-amber-500/10">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <AlertDescription>
              This business doesn't have a phone number on file.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4">
            {/* Template Editor */}
            <div>
              <Label htmlFor="template">Message Template</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Use <code className="bg-muted px-1 rounded">{`{{business_name}}`}</code> to personalize
              </p>
              <Textarea
                id="template"
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                rows={5}
                className="font-mono text-sm"
              />
            </div>

            {/* Live Preview */}
            <div>
              <Label className="flex items-center gap-1.5 mb-2">
                <span>📝</span>
                Preview
              </Label>
              <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-sm whitespace-pre-wrap">
                {previewMessage}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {hasPhone && (
            <Button onClick={handleSend} className="bg-green-600 hover:bg-green-700">
              <Send className="h-4 w-4 mr-2" />
              Open WhatsApp
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
