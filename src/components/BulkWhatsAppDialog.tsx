import { useState } from 'react';
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
import { MessageSquare, Send, ChevronRight } from 'lucide-react';
import { generateWhatsAppUrl } from '@/lib/leadUtils';

interface BulkWhatsAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leads: Array<{ phone: string; business_name: string }>;
}

const DEFAULT_TEMPLATE = `Hi {{business_name}},

I noticed your business doesn't have a website yet. I help local businesses get online with professional, affordable websites.

Would you be interested in a quick chat about how a website could help grow your business?

Best regards`;

export function BulkWhatsAppDialog({ open, onOpenChange, leads }: BulkWhatsAppDialogProps) {
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [currentIndex, setCurrentIndex] = useState(0);

  const leadsWithPhone = leads.filter(l => l.phone);

  const handleSendCurrent = () => {
    if (currentIndex >= leadsWithPhone.length) return;
    
    const lead = leadsWithPhone[currentIndex];
    const message = template.replace(/\{\{business_name\}\}/g, lead.business_name);
    const url = generateWhatsAppUrl(lead.phone, message);
    window.open(url, '_blank');
    
    // Move to next lead
    if (currentIndex < leadsWithPhone.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleReset = () => {
    setCurrentIndex(0);
  };

  const handleClose = () => {
    setCurrentIndex(0);
    onOpenChange(false);
  };

  const currentLead = leadsWithPhone[currentIndex];
  const isComplete = currentIndex >= leadsWithPhone.length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-green-500" />
            Bulk WhatsApp Sender
          </DialogTitle>
          <DialogDescription>
            Send WhatsApp messages to {leadsWithPhone.length} leads with phone numbers.
            Click "Send" to open WhatsApp for each lead.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="template">Message Template</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Use <code className="bg-muted px-1 rounded">{`{{business_name}}`}</code> to personalize
            </p>
            <Textarea
              id="template"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              rows={6}
              className="font-mono text-sm"
            />
          </div>

          {leadsWithPhone.length > 0 && (
            <div className="p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Progress</span>
                <span className="text-sm text-muted-foreground">
                  {currentIndex} / {leadsWithPhone.length} sent
                </span>
              </div>
              
              {!isComplete && currentLead && (
                <div className="flex items-center gap-2 text-sm">
                  <ChevronRight className="h-4 w-4 text-primary" />
                  <span className="font-medium">{currentLead.business_name}</span>
                  <span className="text-muted-foreground">({currentLead.phone})</span>
                </div>
              )}
              
              {isComplete && (
                <p className="text-sm text-green-600">
                  ✓ All messages sent! You can close this dialog.
                </p>
              )}
            </div>
          )}

          {leadsWithPhone.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No selected leads have phone numbers.
            </p>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {currentIndex > 0 && !isComplete && (
            <Button variant="outline" onClick={handleReset}>
              Start Over
            </Button>
          )}
          <Button variant="outline" onClick={handleClose}>
            Close
          </Button>
          {!isComplete && leadsWithPhone.length > 0 && (
            <Button onClick={handleSendCurrent} className="bg-green-600 hover:bg-green-700">
              <Send className="h-4 w-4 mr-2" />
              Send to {currentLead?.business_name?.slice(0, 15)}...
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
