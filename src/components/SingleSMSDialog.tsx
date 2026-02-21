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
import { MessageCircle, Send, AlertTriangle, RotateCcw } from 'lucide-react';
import { generateSMSUrl } from '@/lib/leadUtils';
import { TemplatePicker } from '@/components/TemplatePicker';

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

  // Load saved template from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setTemplate(saved);
      setIsModified(saved !== DEFAULT_TEMPLATE);
    }
  }, []);

  // Save template to localStorage whenever it changes
  const handleTemplateChange = (value: string) => {
    setTemplate(value);
    setIsModified(value !== DEFAULT_TEMPLATE);
    localStorage.setItem(STORAGE_KEY, value);
  };

  // Reset to default
  const handleReset = () => {
    setTemplate(DEFAULT_TEMPLATE);
    setIsModified(false);
    localStorage.setItem(STORAGE_KEY, DEFAULT_TEMPLATE);
  };

  // Check if {{business_name}} placeholder is present
  const hasBusinessNamePlaceholder = template.includes('{{business_name}}');

  // Live preview with business name replaced
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

    // Usage tracking (non-blocking, fire-and-forget)
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
      if (!v) window.dispatchEvent(new CustomEvent('demo-checklist-contact'));
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
          <div className="space-y-4">
            {/* Template Editor */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label htmlFor="template">Message Template</Label>
                {isModified && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleReset}
                    className="h-7 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Reset to default
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                Use <code className="bg-muted px-1 rounded">{`{{business_name}}`}</code> to personalize
              </p>
              <TemplatePicker onSelectTemplate={handleTemplateChange} templateType="text" />
              <Textarea
                id="template"
                value={template}
                onChange={(e) => handleTemplateChange(e.target.value)}
                rows={5}
                className="font-mono text-sm"
              />
              {!hasBusinessNamePlaceholder && (
                <p className="text-xs text-amber-500 mt-1.5 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Tip: Add {`{{business_name}}`} to personalize your message
                </p>
              )}
            </div>

            {/* Live Preview */}
            <div>
              <Label className="flex items-center gap-1.5 mb-2">
                <span>📝</span>
                Preview
              </Label>
              <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-sm whitespace-pre-wrap">
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
