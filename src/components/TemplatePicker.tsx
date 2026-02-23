import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText, Copy, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface TemplatePickerProps {
  onSelectTemplate: (content: string) => void;
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

export function TemplatePicker({ onSelectTemplate, templateType = 'text', isWalkthrough = false, onWalkthroughTemplatesOpened }: TemplatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [templates, setTemplates] = useState<SimpleTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen && user && templates.length === 0) {
      setIsLoading(true);
      supabase
        .from('templates')
        .select('id, title, content, category, template_type')
        .eq('template_type', templateType)
        .order('updated_at', { ascending: false })
        .then(({ data, error }) => {
          setIsLoading(false);
          if (error) {
            console.error('Error fetching templates:', error);
            return;
          }
          setTemplates(data || []);
        });
    }
  }, [isOpen, user, templateType, templates.length]);

  const handleSelect = (template: SimpleTemplate) => {
    onSelectTemplate(template.content);
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

  // Find the "First Text" template for highlighting
  const firstTextTemplate = isWalkthrough ? templates.find(t => 
    t.title.toLowerCase().includes('first text') || t.title.toLowerCase().includes('friendly opener')
  ) : null;

  return (
    <div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className={`h-7 text-xs gap-1 ${
          isWalkthrough && !isOpen 
            ? 'text-primary font-medium animate-[pulse-scale_2s_ease-in-out_infinite] shadow-[0_0_8px_hsl(var(--primary)/0.3)]' 
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <FileText className="h-3 w-3" />
        My Templates
        {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </Button>

      {isOpen && (
        <div className="mt-2 border border-border/50 rounded-lg bg-card/80 backdrop-blur-sm overflow-hidden">
          {isWalkthrough && templates.length > 0 && (
            <div className="px-3 pt-2.5 pb-1.5 bg-primary/5 border-b border-primary/10">
              <p className="text-[11px] text-primary font-medium">Select the first template to get started.</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">You can edit it or choose a different one anytime.</p>
            </div>
          )}
          {isLoading ? (
            <div className="p-3 text-xs text-muted-foreground text-center">Loading templates...</div>
          ) : templates.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground text-center">
              No templates found. Create some on the{' '}
              <a href="/templates" className="text-primary underline hover:text-primary/80">Templates page</a>.
            </div>
          ) : (
            <ScrollArea className="max-h-48">
              <div className="divide-y divide-border/30">
                {templates.map((t) => {
                  const isHighlighted = isWalkthrough && firstTextTemplate?.id === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => handleSelect(t)}
                      className={`w-full text-left px-3 py-2 hover:bg-accent/50 transition-colors group ${
                        isHighlighted ? 'bg-primary/10 ring-1 ring-primary/30' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-xs font-medium truncate ${isHighlighted ? 'text-primary' : ''}`}>{t.title}</span>
                        <Copy className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {t.content.slice(0, 80)}{t.content.length > 80 ? '…' : ''}
                      </p>
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
