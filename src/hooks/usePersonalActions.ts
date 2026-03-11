import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface PersonalAction {
  id: string;
  user_id: string;
  text: string;
  due_date: string | null;
  completed: boolean;
  created_at: string;
}

export function usePersonalActions() {
  const { user } = useAuth();
  const [actions, setActions] = useState<PersonalAction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchActions = useCallback(async () => {
    if (!user) { setActions([]); setIsLoading(false); return; }
    const { data, error } = await supabase
      .from('personal_actions')
      .select('*')
      .eq('user_id', user.id)
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });
    if (!error && data) {
      // Sort: items with due_date first (ascending), then items without due_date by created_at
      const withDate = (data as PersonalAction[]).filter(a => a.due_date);
      const noDate = (data as PersonalAction[]).filter(a => !a.due_date);
      setActions([...withDate, ...noDate]);
    }
    setIsLoading(false);
  }, [user]);

  useEffect(() => { fetchActions(); }, [fetchActions]);

  const addAction = useCallback(async (text: string, dueDate?: string) => {
    if (!user) return;
    const { data, error } = await supabase
      .from('personal_actions')
      .insert({ user_id: user.id, text, due_date: dueDate || null } as any)
      .select()
      .single();
    if (!error && data) {
      setActions(prev => {
        const next = [...prev, data as PersonalAction];
        const withDate = next.filter(a => a.due_date);
        const noDate = next.filter(a => !a.due_date);
        withDate.sort((a, b) => a.due_date!.localeCompare(b.due_date!));
        return [...withDate, ...noDate];
      });
    }
  }, [user]);

  const toggleComplete = useCallback(async (id: string, completed: boolean) => {
    const { error } = await supabase
      .from('personal_actions')
      .update({ completed } as any)
      .eq('id', id);
    if (!error) {
      setActions(prev => prev.map(a => a.id === id ? { ...a, completed } : a));
    }
  }, []);

  const deleteAction = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('personal_actions')
      .delete()
      .eq('id', id);
    if (!error) {
      setActions(prev => prev.filter(a => a.id !== id));
    }
  }, []);

  const activeActions = actions.filter(a => !a.completed);
  const completedActions = actions.filter(a => a.completed);

  return { actions, activeActions, completedActions, isLoading, addAction, toggleComplete, deleteAction, refetch: fetchActions };
}
