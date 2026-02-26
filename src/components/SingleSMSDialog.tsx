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
import { MessageCircle, Send, AlertTriangle, RotateCcw, FileText } from 'lucide-react';
import { generateSMSUrl } from '@/lib/leadUtils';
import { TemplatePicker } from '@/components/TemplatePicker';
import { useDemoChecklist } from '@/contexts/DemoChecklistContext';
import { useAutoRotateTemplate } from '@/hooks/useAutoRotateTemplate';
import { AutoRotateToggle } from '@/components/AutoRotateToggle';

interface SingleSMSDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: { phone: string; business_name: string } | null;
}

const DEFAULT_TEMPLATE = `Hi, is this the right number for {{business_name}}?`;
const STORAGE_KEY = 'leadfinder_sms_template';

export function SingleSMSDialog({ open, onOpenChange, lead }: SingleSMSDialogProps) {
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [isModified, setIsModified] = useState(false);
  const [showTemplateNudge, setShowTemplateNudge] = useState(false);
  const [templatesOpened, setTemplatesOpened] = useState(false);

  const { autoOn, toggleAuto, getNextTemplate } = useAutoRotateTemplate();

  // Walkthrough awareness
  const { isDemoUser, state } = useDemoChecklist();
  const isWalkthroughStep3 = isDemoUser && state.addedToCrm && !state.contactAttempted;

  useEffect(() => {
    if (open && isWalkthroughStep3) {
      setShowTemplateNudge(true);
      setTemplatesOpened(false);
    } else {
      setShowTemplateNudge(false);
    }
  }, [open, isWalkthroughStep3]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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

  const hasBusinessNamePlaceholder = template.includes('{{business_name}}');

  const previewMessage = useMemo(() => {
    if (!lead) return template;
    return template.replace(/\{\{business_name\}\}/g, lead.business_name);
  }, [template, lead]);

  const handleSend = () => {
    if (!lead || !lead.phone) return;
    
    const message = template.replace(/\{\{business_name\}\}/g, lead.business_name);
    const url = generateSMSUrl(lead.phone, message);
    window.open(url, '_self');
    onOpenChange(false);

    // Trigger walkthrough contact step + post-contact modal
    window.dispatchEvent(new CustomEvent('demo-checklist-contact'));
    window.dispatchEvent(new CustomEvent('post-contact-modal-trigger'));

    supabase.rpc('log_usage_event', {
      p_event_type: 'message_sent',
      p_meta: {
        channel: 'sms',
        business_name: lead.business_name,
        source: 'single-sms-dialog',
      },
    }).then(({ error }) => { if (error) console.error('Usage tracking failed:', error); });
  };

  if (!lead) return null;

  const hasPhone = Boolean(lead.phone);

  return (
    <Dialog open={open} onOpenChange={(v) => {
      onOpenChange(v);
    }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-blue-500" />
            SMS Message
          </DialogTitle>
          <DialogDescription>
            Send an SMS to <span className="font-semibold text-foreground">{lead.business_name}</span>
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
              {showTemplateNudge && !templatesOpened && (
                <div className="mb-3 p-3 rounded-lg border border-yellow-500/40 bg-card shadow-lg">
                  <div className="text-[10px] font-semibold text-primary mb-0.5">Step 4 of 7</div>
                  <p className="text-xs text-foreground">
                    Select <span className="font-semibold text-primary">"Initial Contact Cycle"</span> to auto-rotate between 6 proven messages.
                  </p>
                </div>
              )}
              <TemplatePicker 
                onSelectTemplate={(content, templateId) => {
                  handleTemplateChange(content);
                  setShowTemplateNudge(false);
                  if (templateId === 'default-0') {
                    toggleAuto(true);
                  } else {
                    if (autoOn) toggleAuto(false);
                  }
                }} 
                templateType="text" 
                isWalkthrough={showTemplateNudge}
                onWalkthroughTemplatesOpened={() => setTemplatesOpened(true)}
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
              <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-sm whitespace-pre-wrap">
                {previewMessage}
              </div>
            </div>

            <p className="text-[10px] text-muted-foreground/50 text-center">
              Ensure outreach complies with platform and local regulations.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => {
            onOpenChange(false);
          }}>
            Cancel
          </Button>
          {hasPhone && (
            <Button onClick={handleSend} className="bg-blue-600 hover:bg-blue-700">
              <Send className="h-4 w-4 mr-2" />
              Open SMS App
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
