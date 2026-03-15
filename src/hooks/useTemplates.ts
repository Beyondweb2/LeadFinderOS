import { useState, useCallback, useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import type { Template, TemplateType, TemplateCategory } from '@/types/outreach';

// Default templates for new users - casual, non-salesy
const DEFAULT_TEMPLATES: Array<{
  template_type: TemplateType;
  category: TemplateCategory;
  title: string;
  content: string;
}> = [
  // Text message templates
  {
    template_type: 'text',
    category: 'initial',
    title: 'First Text - Friendly Opener',
    content: `Hi, is this the right number for {{business_name}}?`,
  },
  {
    template_type: 'text',
    category: 'initial',
    title: 'First Text - Direct',
    content: `Hi there, I help local businesses get online with simple websites. Saw you're not online yet - is that something you've been thinking about?`,
  },
  {
    template_type: 'text',
    category: 'follow_up',
    title: 'Follow Up - Check In',
    content: `Hey, just following up on my last message. No pressure at all - just wanted to check if you had any questions about getting a website going?`,
  },
  {
    template_type: 'text',
    category: 'follow_up',
    title: 'Follow Up - Final',
    content: `Hi again! Just checking in one more time. If you're not interested that's totally fine - just let me know either way and I'll stop bothering you 😊`,
  },
  {
    template_type: 'text',
    category: 'no_website',
    title: 'No Website - Casual',
    content: `Hey! Noticed your business isn't online yet. These days most people search online before visiting anywhere - happy to chat about getting you set up if you're interested?`,
  },
  {
    template_type: 'text',
    category: 'poor_website',
    title: 'Outdated Website',
    content: `Hi! I was looking at your website and it looks like it could use a refresh. Would you be open to chatting about giving it a modern update?`,
  },
  // Voice script templates
  {
    template_type: 'voice_script',
    category: 'initial',
    title: 'Voice Note - First Contact',
    content: `Hey, hope you're having a good day! I came across your business and thought I'd reach out. I help local businesses get online with websites that actually bring in customers. Noticed you don't have one yet so thought I'd see if that's something you've been thinking about. Anyway, no pressure - just drop me a message if you want to chat about it. Cheers!`,
  },
  {
    template_type: 'voice_script',
    category: 'no_website',
    title: 'Voice Note - No Website Pitch',
    content: `Hi there! Quick voice note for you. I was looking for businesses like yours on Google and noticed you're not popping up in search results because there's no website. Most of your competitors are online now so you're probably missing out on quite a few customers. I could help you get something simple set up if you're interested - nothing fancy, just something that works. Let me know if you'd like to have a chat about it!`,
  },
  {
    template_type: 'voice_script',
    category: 'follow_up',
    title: 'Voice Note - Follow Up',
    content: `Hey, just me again! Sent you a message the other day about getting a website sorted. Totally understand if you're busy - just wanted to check if you got my message and if you had any questions. Let me know either way, no worries if it's not for you. Take care!`,
  },
];

export function useTemplates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  
  // Track the user ID to prevent refetches on auth token refreshes
  const userIdRef = useRef<string | null>(null);
  const hasCreatedDefaults = useRef(false);
  const hasLoadedTemplatesOnce = useRef(false);

  const createDefaultTemplates = useCallback(async () => {
    if (!user || hasCreatedDefaults.current) return;
    
    hasCreatedDefaults.current = true;
    
    const templatesWithUserId = DEFAULT_TEMPLATES.map((t) => ({
      ...t,
      user_id: user.id,
      is_default: true,
    }));

    const { error } = await supabase
      .from('templates')
      .insert(templatesWithUserId);

    if (error) {
      console.error('Error creating default templates:', error);
      hasCreatedDefaults.current = false;
      return false;
    }

    return true;
  }, [user]);

  const fetchTemplates = useCallback(async () => {
    if (!user) {
      // No auth — show hardcoded defaults so ad-entry/guest users can view templates
      const defaults = DEFAULT_TEMPLATES.map((t, i) => ({
        ...t,
        id: `default-${i}`,
        user_id: '',
        is_default: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })) as Template[];
      setTemplates(defaults);
      setIsLoading(false);
      setHasFetched(true);
      return;
    }

    if (!hasLoadedTemplatesOnce.current) {
      setIsLoading(true);
    }
    const { data, error } = await supabase
      .from('templates')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      setIsLoading(false);
      console.error('Error fetching templates:', error);
      toast({
        title: 'Error loading templates',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    // If no templates exist, create defaults
    if (!data || data.length === 0) {
      const created = await createDefaultTemplates();
      if (created) {
        // Refetch after creating defaults
        const { data: newData } = await supabase
          .from('templates')
          .select('*')
          .order('created_at', { ascending: true });
        
        const typedData = (newData || []).map(t => ({
          ...t,
          template_type: t.template_type as TemplateType,
          category: t.category as TemplateCategory,
        })) as Template[];

        setTemplates(typedData);
      }
    } else {
      // Cast to Template type
      const typedData = data.map(t => ({
        ...t,
        template_type: t.template_type as TemplateType,
        category: t.category as TemplateCategory,
      })) as Template[];

      setTemplates(typedData);
    }
    
    hasLoadedTemplatesOnce.current = true;
    setIsLoading(false);
    setHasFetched(true);
  }, [user, toast, createDefaultTemplates]);

  // Only fetch when user ID actually changes, not on every auth state change
  useEffect(() => {
    const currentUserId = user?.id ?? null;
    
    // Only refetch if user ID changed (login/logout), not on token refresh
    if (currentUserId !== userIdRef.current) {
      userIdRef.current = currentUserId;
      hasCreatedDefaults.current = false;
      if (currentUserId && !hasFetched) {
        fetchTemplates();
      } else if (!currentUserId) {
        // User logged out - clear templates
        setTemplates([]);
        setHasFetched(false);
      }
    }
  }, [user?.id, hasFetched, fetchTemplates]);

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
    // Template created — no toast

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
    // Template updated — no toast

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
    // Template deleted — no toast

    return true;
  }, [templates, toast]);

  const copyToClipboard = useCallback((content: string, title?: string) => {
    navigator.clipboard.writeText(content);
    // Copied — no toast
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
