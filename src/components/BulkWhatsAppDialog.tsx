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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { MessageSquare, Send, ChevronRight, AlertTriangle, ChevronDown, Clock } from 'lucide-react';
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
  const [tipsOpen, setTipsOpen] = useState(false);

  const leadsWithPhone = leads.filter(l => l.phone);
  const currentLead = leadsWithPhone[currentIndex];
  const isComplete = currentIndex >= leadsWithPhone.length;

  // Live preview with business name replaced
  const previewMessage = useMemo(() => {
    if (!currentLead) return template;
    return template.replace(/\{\{business_name\}\}/g, currentLead.business_name);
  }, [template, currentLead]);

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

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-green-500" />
            Bulk WhatsApp Sender
          </DialogTitle>
          <DialogDescription>
            Send WhatsApp messages to {leadsWithPhone.length} leads with phone numbers.
          </DialogDescription>
        </DialogHeader>

        {/* Warning Alert */}
        <Alert className="border-amber-500/50 bg-amber-500/10">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <AlertDescription className="text-sm">
            <span className="font-medium">Important:</span> Bulk messaging may risk WhatsApp account restrictions.
            <Collapsible open={tipsOpen} onOpenChange={setTipsOpen}>
              <CollapsibleTrigger className="flex items-center gap-1 text-amber-600 hover:text-amber-700 mt-1 text-xs font-medium">
                Tips to stay safe
                <ChevronDown className={`h-3 w-3 transition-transform ${tipsOpen ? 'rotate-180' : ''}`} />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-1 text-xs text-muted-foreground">
                <p>• Space out messages (wait 2-5 minutes between sends)</p>
                <p>• Personalize each message with business names</p>
                <p>• Limit to 10-20 messages per day</p>
                <p>• Avoid sending identical messages repeatedly</p>
                <p>• Don't send to contacts who haven't opted in</p>
              </CollapsibleContent>
            </Collapsible>
          </AlertDescription>
        </Alert>

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
          {currentLead && !isComplete && (
            <div>
              <Label className="flex items-center gap-1.5 mb-2">
                <span>📝</span>
                Preview for: <span className="font-semibold text-primary">{currentLead.business_name}</span>
              </Label>
              <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-sm whitespace-pre-wrap">
                {previewMessage}
              </div>
            </div>
          )}

          {/* Progress Section */}
          {leadsWithPhone.length > 0 && (
            <div className="p-3 bg-muted/50 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Progress</span>
                <span className="text-sm text-muted-foreground">
                  {currentIndex} / {leadsWithPhone.length} sent
                </span>
              </div>
              
              {!isComplete && currentLead && (
                <>
                  <div className="flex items-center gap-2 text-sm">
                    <ChevronRight className="h-4 w-4 text-primary" />
                    <span className="font-medium">{currentLead.business_name}</span>
                    <span className="text-muted-foreground">({currentLead.phone})</span>
                  </div>
                  
                  {/* Delay Recommendation */}
                  {currentIndex > 0 && (
                    <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-500/10 px-2 py-1 rounded">
                      <Clock className="h-3 w-3" />
                      Wait 2-5 minutes before sending the next message
                    </div>
                  )}
                </>
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

        {/* Disclaimer */}
        <p className="text-[10px] text-muted-foreground text-center mt-2">
          LeadFinder Pro is not responsible for any WhatsApp account restrictions. 
          Users are solely responsible for their outreach methods.
        </p>
      </DialogContent>
    </Dialog>
  );
}
