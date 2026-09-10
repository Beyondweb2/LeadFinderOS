import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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

/** Stable empty — a fresh array per render re-runs getTemplatesByType/Category for every caller. */
const EMPTY_TEMPLATES: Template[] = [];

/** The hardcoded set a signed-out visitor sees. Built once, not per render. */
const GUEST_TEMPLATES: Template[] = DEFAULT_TEMPLATES.map((t, i) => ({
  ...t,
  id: `default-${i}`,
  user_id: '',
  is_default: true,
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
})) as Template[];

const typeRow = (t: Record<string, unknown>): Template => ({
  ...t,
  template_type: t.template_type as TemplateType,
  category: t.category as TemplateCategory,
}) as Template;

export function useTemplates() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  /* ⛔ ON REACT QUERY SINCE 2026-09-10. Three refs and a hand-rolled effect used to do what the
     cache does: `userIdRef` stopped an auth-token refresh refetching, `hasFetched` stopped a
     second load, `hasLoadedTemplatesOnce` suppressed the spinner on refreshes. All three were
     approximations of "hold this until the key changes" and all three are gone.
     ⚠️ NOT `enabled`-GATED, deliberately: a signed-out visitor is a real case here, not an
     absence. They see the hardcoded defaults, which is what the guest branch has always done. */
  const queryKey = useMemo(() => ['templates', user?.id ?? null] as const, [user?.id]);

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<Template[]> => {
      if (!user) return GUEST_TEMPLATES;

      const { data, error } = await supabase
        .from('templates')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message);

      if (data && data.length > 0) return data.map(typeRow);

      /* NO TEMPLATES YET → seed the defaults, then read back what the database actually stored.
         ⚠️ `hasCreatedDefaults` was a ref guarding against seeding twice. React Query
         de-duplicates concurrent fetches of one key, so two components mounting at once share a
         single run of this function — the ref's job, without the ref. */
      const seeded = DEFAULT_TEMPLATES.map((t) => ({ ...t, user_id: user.id, is_default: true }));
      const { error: insErr } = await supabase.from('templates').insert(seeded);
      if (insErr) {
        console.error('Error creating default templates:', insErr);
        /* ⛔ RETURN THE GUEST SET RATHER THAN NOTHING. The old code returned early and left the
           list EMPTY on a seeding failure, so the Templates page read as "you have no
           templates" when the truth was "we could not create them". */
        return GUEST_TEMPLATES;
      }
      const { data: seededRows } = await supabase
        .from('templates')
        .select('*')
        .order('created_at', { ascending: true });
      return (seededRows ?? []).map(typeRow);
    },
  });

  const templates = query.data ?? EMPTY_TEMPLATES;
  const isLoading = query.isPending;

  const refetch = useCallback(
    () => { void queryClient.invalidateQueries({ queryKey }); },
    [queryClient, queryKey],
  );

  /* ⛔ ONE HELPER FOR ALL THREE MUTATIONS' CACHE WRITE. Each one already has the authoritative
     row back from `.select().single()`, so the list is patched with what the DATABASE stored —
     never with what was submitted — and then invalidated so the next read is authoritative
     regardless. Three copies of this is how they drift. */
  const patchCache = useCallback(async (fn: (prev: Template[]) => Template[]) => {
    queryClient.setQueryData<Template[]>(queryKey, (prev) => fn(prev ?? EMPTY_TEMPLATES));
    await queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

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

    await patchCache((prev) => [...prev, newTemplate]);

    return newTemplate;
  }, [user, toast, patchCache]);

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

    await patchCache((prev) => prev.map((t) => (t.id === id ? updatedTemplate : t)));

    return updatedTemplate;
  }, [toast, patchCache]);

  const deleteTemplate = useCallback(async (id: string) => {
    /* ⚠️ The unused `templates.find(...)` that used to sit here is gone — it was dead, and it
       was the only reason this callback depended on the whole list, which rebuilt it on every
       load. */
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

    await patchCache((prev) => prev.filter((t) => t.id !== id));

    return true;
  }, [toast, patchCache]);

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
    refetch,
  };
}
