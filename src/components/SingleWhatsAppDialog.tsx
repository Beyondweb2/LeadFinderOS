import { useState, useMemo, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
import { MessageSquare, Send, AlertTriangle, RotateCcw, Loader2 } from 'lucide-react';
import { generateWhatsAppUrl } from '@/lib/leadUtils';
import { TemplatePicker } from '@/components/TemplatePicker';
import { useDemoChecklist } from '@/contexts/DemoChecklistContext';
import { useAutoRotateTemplate } from '@/hooks/useAutoRotateTemplate';
import { AutoRotateToggle } from '@/components/AutoRotateToggle';
import { useToast } from '@/hooks/use-toast';

interface SingleWhatsAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: { phone: string; business_name: string; id?: string; whatsapp_status?: string | null; status?: string } | null;
  /** Called when user clicks "Open WhatsApp" — signals a send happened (confirmation handled externally) */
  onSent?: (leadId: string, channel: 'whatsapp') => void;
}

const DEFAULT_TEMPLATE = `Hi, is this the right number for {{business_name}}?`;
const STORAGE_KEY = 'leadfinder_whatsapp_template';

export function SingleWhatsAppDialog({ open, onOpenChange, lead, onSent }: SingleWhatsAppDialogProps) {
  const handleOpenChange = (v: boolean) => {
    onOpenChange(v);
    if (!v) {
      // Notify walkthrough that the contact panel was closed
      window.dispatchEvent(new CustomEvent('demo-checklist-contact-panel-closed'));
    }
  };
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [isModified, setIsModified] = useState(false);
  const [showTemplateNudge] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const { autoOn, toggleAuto, getNextTemplate } = useAutoRotateTemplate();
  const { toast } = useToast();

  // Walkthrough awareness
  const { isDemoUser, state } = useDemoChecklist();
  const isWalkthroughStep3 = isDemoUser && state.addedToCrm && !state.contactAttempted;


  // Auto-rotate on dialog open
  useEffect(() => {
    if (open && autoOn) {
      const next = getNextTemplate(template);
      setTemplate(next);
      setIsModified(next !== DEFAULT_TEMPLATE);
      localStorage.setItem(STORAGE_KEY, next);
    } else if (open && !autoOn) {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setTemplate(saved);
        setIsModified(saved !== DEFAULT_TEMPLATE);
      }
    }
    if (open) setIsSending(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Check WhatsApp status when dialog opens — if 'no', show toast and close
  useEffect(() => {
    if (!open || !lead) return;
    if (lead.whatsapp_status === 'no') {
      toast({
        title: 'Not on WhatsApp',
        description: `${lead.business_name} was previously marked as not on WhatsApp. Try SMS or Call instead.`,
      });
      handleOpenChange(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lead?.whatsapp_status]);

  const handleTemplateChange = (value: string) => {
    setTemplate(value);
    setIsModified(value !== DEFAULT_TEMPLATE);
    localStorage.setItem(STORAGE_KEY, value);
  };

  const handleReset = () => {
    setTemplate(DEFAULT_TEMPLATE);
    setIsModified(false);
    localStorage.setItem(STORAGE_KEY, DEFAULT_TEMPLATE);
  };

  const previewMessage = useMemo(() => {
    if (!lead) return template;
    return template.replace(/\{\{business_name\}\}/g, lead.business_name);
  }, [template, lead]);

  const handleSend = async () => {
    if (!lead || !lead.phone || isSending) return;
    setIsSending(true);
    
    const message = template.replace(/\{\{business_name\}\}/g, lead.business_name);
    const url = generateWhatsAppUrl(lead.phone, message);

    // Store pending WhatsApp check markers in localStorage
    if (lead.id && (!lead.whatsapp_status || lead.whatsapp_status === 'unknown')) {
      localStorage.setItem('pending_whatsapp_check_lead_id', lead.id);
      localStorage.setItem('pending_whatsapp_check_started_at', Date.now().toString());
      localStorage.setItem('pending_whatsapp_check_lead_name', lead.business_name);
    }

    window.open(url, '_blank');
    // demo-checklist-contact dispatched by OutreachTable on button click
    window.dispatchEvent(new CustomEvent('challenge-contact-sent', { detail: { leadId: lead.business_name } }));

    // Signal send happened — confirmation & logAttempt handled externally
    if (lead.id && onSent) {
      onSent(lead.id, 'whatsapp');
    }

    handleOpenChange(false);

    supabase.rpc('log_usage_event', {
      p_event_type: 'message_sent',
      p_meta: {
        channel: 'whatsapp',
        business_name: lead.business_name,
        source: 'single-whatsapp-dialog',
      },
    }).then(({ error }) => { if (error) console.error('Usage tracking failed:', error); });
  };

  if (!lead) return null;

  const hasPhone = Boolean(lead.phone);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-green-500" />
            WhatsApp Message
          </DialogTitle>
          <DialogDescription>
            To <span className="font-semibold text-foreground">{lead.business_name}</span>
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
          <div className="space-y-5">
            {/* Template Editor */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label htmlFor="template" className="text-sm font-semibold">Initial Message</Label>
                <div className="flex items-center gap-2">
                  {isModified && !autoOn && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleReset}
                      className="h-7 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Reset
                    </Button>
                  )}
                  <AutoRotateToggle autoOn={autoOn} onToggle={toggleAuto} />
                </div>
              </div>
              <TemplatePicker 
                onSelectTemplate={(content, templateId) => {
                  handleTemplateChange(content);
                  if (templateId === 'default-0') {
                    toggleAuto(true);
                  } else {
                    if (autoOn) toggleAuto(false);
                  }
                }} 
                templateType="text" 
                isWalkthrough={false}
              />
              <Textarea
                id="template"
                value={template}
                onChange={(e) => {
                  handleTemplateChange(e.target.value);
                  if (autoOn) toggleAuto(false);
                }}
                rows={4}
                className="font-mono text-sm mt-2"
              />
              {autoOn && (
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Rotating between 6 proven opening messages to reduce repetition and improve reply rates.
                </p>
              )}
            </div>

            {/* Live Preview */}
            <div>
              <Label className="flex items-center gap-1.5 mb-2 text-sm font-semibold">
                <span>📝</span>
                Preview
              </Label>
              <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-sm whitespace-pre-wrap">
                {previewMessage}
              </div>
            </div>

            {/* Compliance note */}
            <p className="text-[10px] text-muted-foreground/50 text-center">
              Ensure outreach complies with platform and local regulations.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 flex-row justify-end">
          <Button variant="outline" onClick={() => {
            handleOpenChange(false);
          }}>
            Cancel
          </Button>
          {hasPhone && (
            <Button onClick={handleSend} disabled={isSending} className="bg-green-600 hover:bg-green-700 whitespace-nowrap">
              {isSending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Opening...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Open WhatsApp
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
