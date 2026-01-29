import { useState, useCallback, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import type { Template, TemplateType, TemplateCategory } from '@/types/outreach';

const DEFAULT_TEMPLATES: Omit<Template, 'id' | 'user_id' | 'created_at' | 'updated_at'>[] = [
  {
    template_type: 'text',
    category: 'initial',
    title: 'Initial Text',
    content: 'Hi, are you taking on work?',
    is_default: true,
  },
  {
    template_type: 'text',
    category: 'follow_up',
    title: 'Follow-up Text',
    content: 'Did you get my voice note?',
    is_default: true,
  },
  {
    template_type: 'voice_script',
    category: 'no_website',
    title: 'No Website Pitch',
    content: `Hi, I noticed you don't have a website yet. I build websites for local businesses like yours - simple, professional sites that help customers find you and learn about your services. Would you be interested in seeing some examples of what I could create for you?`,
    is_default: true,
  },
  {
    template_type: 'voice_script',
    category: 'poor_website',
    title: 'Poor Website Pitch',
    content: `Hi, I was looking at your current website and thought there might be some ways to improve it - maybe make it faster, more mobile-friendly, or just give it a fresh modern look. I specialize in redesigning websites for local businesses. Would you be open to a quick chat about what could be done?`,
    is_default: true,
  },
  {
    template_type: 'voice_script',
    category: 'coming_soon',
    title: 'Coming Soon Pitch',
    content: `Hi, I saw your website says coming soon. I build websites for local businesses and could help you get something up and running quickly. Would you be interested in seeing some examples of my work?`,
    is_default: true,
  },
];

export function useTemplates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const fetchTemplates = useCallback(async () => {
    if (!user) return;

    setIsLoading(true);
    const { data, error } = await supabase
      .from('templates')
      .select('*')
      .order('created_at', { ascending: true });

    setIsLoading(false);

    if (error) {
      console.error('Error fetching templates:', error);
      toast({
        title: 'Error loading templates',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    // Cast to Template type
    const typedData = (data || []).map(t => ({
      ...t,
      template_type: t.template_type as TemplateType,
      category: t.category as TemplateCategory,
    })) as Template[];

    setTemplates(typedData);
  }, [user, toast]);

  const initializeDefaults = useCallback(async () => {
    if (!user) return;

    // Check if user has any templates
    const { count, error } = await supabase
      .from('templates')
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.error('Error checking templates:', error);
      return;
    }

    // If no templates, create defaults
    if (count === 0) {
      const templatesWithUser = DEFAULT_TEMPLATES.map((t) => ({
        ...t,
        user_id: user.id,
      }));

      const { error: insertError } = await supabase
        .from('templates')
        .insert(templatesWithUser);

      if (insertError) {
        console.error('Error creating default templates:', insertError);
      } else {
        await fetchTemplates();
      }
    }
  }, [user, fetchTemplates]);

  useEffect(() => {
    if (user) {
      fetchTemplates().then(() => initializeDefaults());
    }
  }, [user, fetchTemplates, initializeDefaults]);

  const createTemplate = useCallback(async (
    template: Pick<Template, 'template_type' | 'category' | 'title' | 'content'>
  ) => {
    if (!user) return null;

    const { data, error } = await supabase
      .from('templates')
      .insert({
        ...template,
        user_id: user.id,
        is_default: false,
      })
      .select()
      .single();

    if (error) {
      toast({
        title: 'Error creating template',
        description: error.message,
        variant: 'destructive',
      });
      return null;
    }

    const newTemplate = {
      ...data,
      template_type: data.template_type as TemplateType,
      category: data.category as TemplateCategory,
    } as Template;

    setTemplates((prev) => [...prev, newTemplate]);
    toast({
      title: 'Template created',
      description: `"${template.title}" has been saved.`,
    });

    return newTemplate;
  }, [user, toast]);

  const updateTemplate = useCallback(async (
    id: string,
    updates: Partial<Pick<Template, 'title' | 'content' | 'category'>>
  ) => {
    const { data, error } = await supabase
      .from('templates')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      toast({
        title: 'Error updating template',
        description: error.message,
        variant: 'destructive',
      });
      return null;
    }

    const updatedTemplate = {
      ...data,
      template_type: data.template_type as TemplateType,
      category: data.category as TemplateCategory,
    } as Template;

    setTemplates((prev) => prev.map((t) => (t.id === id ? updatedTemplate : t)));
    toast({
      title: 'Template updated',
      description: 'Your changes have been saved.',
    });

    return updatedTemplate;
  }, [toast]);

  const deleteTemplate = useCallback(async (id: string) => {
    const template = templates.find((t) => t.id === id);

    const { error } = await supabase
      .from('templates')
      .delete()
      .eq('id', id);

    if (error) {
      toast({
        title: 'Error deleting template',
        description: error.message,
        variant: 'destructive',
      });
      return false;
    }

    setTemplates((prev) => prev.filter((t) => t.id !== id));
    toast({
      title: 'Template deleted',
      description: template ? `"${template.title}" has been removed.` : 'Template removed.',
    });

    return true;
  }, [templates, toast]);

  const copyToClipboard = useCallback((content: string, title?: string) => {
    navigator.clipboard.writeText(content);
    toast({
      title: 'Copied!',
      description: title ? `"${title}" copied to clipboard.` : 'Template copied to clipboard.',
    });
  }, [toast]);

  const getTemplatesByType = useCallback((type: TemplateType) => {
    return templates.filter((t) => t.template_type === type);
  }, [templates]);

  const getTemplatesByCategory = useCallback((category: TemplateCategory) => {
    return templates.filter((t) => t.category === category);
  }, [templates]);

  return {
    templates,
    isLoading,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    copyToClipboard,
    getTemplatesByType,
    getTemplatesByCategory,
    refetch: fetchTemplates,
  };
}
