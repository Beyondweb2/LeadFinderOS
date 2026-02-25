import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText, Copy, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface TemplatePickerProps {
  onSelectTemplate: (content: string, templateId?: string) => void;
  /** Filter to only show text templates (not voice scripts) */
  templateType?: 'text' | 'voice_script';
  /** When true, show walkthrough guidance to highlight first template */
  isWalkthrough?: boolean;
  /** Callback when templates list opens during walkthrough */
  onWalkthroughTemplatesOpened?: () => void;
}

interface SimpleTemplate {
  id: string;
  title: string;
  content: string;
  category: string;
  template_type: string;
}

// Default pre-made templates shown when user has none
const DEFAULT_PREMADE_TEMPLATES: SimpleTemplate[] = [
  { id: 'default-0', title: 'Initial Contact Cycle', content: `Hi, is this the right number for {{business_name}}?`, category: 'outreach', template_type: 'text' },
  { id: 'default-1', title: 'First Text – Friendly Opener', content: `Hi! Is this {{business_name}}? I came across your business and wanted to reach out. I help businesses like yours get set up online with a simple, professional website. Would you be open to a quick chat about it?`, category: 'outreach', template_type: 'text' },
  { id: 'default-2', title: 'First Text – Direct', content: `Hi, is this {{business_name}}? I noticed you don't have a website yet. I build affordable websites for local businesses — would you be interested in hearing more?`, category: 'outreach', template_type: 'text' },
  { id: 'default-3', title: 'Follow Up – Check In', content: `Hi {{business_name}}, just following up on my earlier message. I'd love to help you get online with a simple website. Let me know if you're interested!`, category: 'follow_up', template_type: 'text' },
  { id: 'default-4', title: 'Follow Up – Value Add', content: `Hey {{business_name}}, I help local businesses get found online with a clean, mobile-friendly website. It's a quick setup and very affordable. Happy to send you an example if you're curious!`, category: 'follow_up', template_type: 'text' },
  { id: 'default-5', title: 'Second Follow Up – Gentle Nudge', content: `Hi {{business_name}}, just checking in one last time. I know you're busy — if now's not the right time, no worries at all. But if you'd like a quick, affordable website, I'm here to help!`, category: 'follow_up', template_type: 'text' },
  { id: 'default-6', title: 'Intro – Social Proof', content: `Hi {{business_name}}! I've been helping local businesses in your area get online. A simple website can bring in new customers from Google. Would you like to see some examples?`, category: 'outreach', template_type: 'text' },
];

export function TemplatePicker({ onSelectTemplate, templateType = 'text', isWalkthrough = false, onWalkthroughTemplatesOpened }: TemplatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [templates, setTemplates] = useState<SimpleTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen && user && !fetched) {
      setIsLoading(true);
      supabase
        .from('templates')
        .select('id, title, content, category, template_type')
        .eq('template_type', templateType)
        .order('updated_at', { ascending: false })
        .then(({ data, error }) => {
          setIsLoading(false);
          setFetched(true);
          if (error) {
            console.error('Error fetching templates:', error);
            // Show defaults on error
            setTemplates(DEFAULT_PREMADE_TEMPLATES.filter(t => t.template_type === templateType));
            return;
          }
          if (data && data.length > 0) {
            setTemplates(data);
          } else {
            // No user templates — show pre-made defaults
            setTemplates(DEFAULT_PREMADE_TEMPLATES.filter(t => t.template_type === templateType));
          }
        });
    }
  }, [isOpen, user, templateType, fetched]);

  const handleSelect = (template: SimpleTemplate) => {
    onSelectTemplate(template.content, template.id);
    toast({
      title: 'Template applied',
      description: `"${template.title}" loaded into message.`,
    });
    setIsOpen(false);
  };

  // Notify parent when templates list opens during walkthrough
  useEffect(() => {
    if (isOpen && isWalkthrough && onWalkthroughTemplatesOpened) {
      onWalkthroughTemplatesOpened();
    }
  }, [isOpen, isWalkthrough, onWalkthroughTemplatesOpened]);

  // Highlight the "Initial Contact Cycle" template during walkthrough
  const firstTextTemplate = isWalkthrough ? templates.find(t => 
    t.title.toLowerCase().includes('initial contact cycle') || t.id === 'default-0'
  ) || templates[0] : null;

  return (
    <div>
      <Button
        type="button"
        variant={isWalkthrough && !isOpen ? 'default' : 'ghost'}
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className={`h-8 text-xs gap-1.5 ${
          isWalkthrough && !isOpen 
            ? 'relative animate-bounce shadow-[0_0_16px_hsl(var(--primary)/0.5),0_0_4px_hsl(var(--primary)/0.3)] ring-2 ring-primary/60 font-semibold' 
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <FileText className="h-3.5 w-3.5" />
        {isWalkthrough && !isOpen ? '👉 Select a Template' : 'My Templates'}
        {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </Button>

      {isOpen && (
        <div className="mt-2 border border-border/50 rounded-lg bg-card/80 backdrop-blur-sm overflow-hidden">
          {isWalkthrough && templates.length > 0 && (
            <div className="px-3 pt-2.5 pb-1.5 bg-primary/5 border-b border-primary/10">
              <p className="text-[11px] text-primary font-medium">Select "Initial Contact Cycle" to get started.</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">You can explore other templates anytime.</p>
            </div>
          )}
          {isLoading ? (
            <div className="p-3 text-xs text-muted-foreground text-center">Loading templates...</div>
          ) : (
            <ScrollArea className="max-h-48">
              <div className="divide-y divide-border/30">
                {templates.map((t) => {
                  const isHighlighted = isWalkthrough && firstTextTemplate?.id === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => handleSelect(t)}
                      className={`w-full text-left px-3 py-2.5 hover:bg-accent/50 transition-colors group ${
                        isHighlighted ? 'bg-primary/10 ring-1 ring-primary/30 animate-[pulse-scale_1.5s_ease-in-out_infinite]' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-xs font-medium ${isHighlighted ? 'text-primary' : ''}`}>{t.title}</span>
                        <Copy className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>
      )}
    </div>
  );
}
