import { useState, useCallback, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

export type CallOutcome = 
  | 'interested'
  | 'not_interested'
  | 'no_answer'
  | 'callback_scheduled'
  | 'wrong_number'
  | 'left_voicemail';

export interface LeadContact {
  id: string;
  lead_id: string;
  lead_name: string;
  outcome: CallOutcome;
  notes: string | null;
  contacted_at: string;
  user_id: string;
}

export function useContactTracking() {
  const [contacts, setContacts] = useState<LeadContact[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const fetchContacts = useCallback(async () => {
    const { data, error } = await supabase
      .from('lead_contacts')
      .select('*')
      .order('contacted_at', { ascending: false });

    if (error) {
      console.error('Error fetching contacts:', error);
      return;
    }

    setContacts(data as LeadContact[]);
  }, []);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const markAsContacted = useCallback(async (
    leadId: string,
    leadName: string,
    outcome: CallOutcome,
    notes?: string
  ) => {
    if (!user) {
      toast({
        title: 'Not authenticated',
        description: 'Please log in to track contacts.',
        variant: 'destructive',
      });
      return null;
    }

    setIsLoading(true);
    
    const { data, error } = await supabase
      .from('lead_contacts')
      .insert({
        lead_id: leadId,
        lead_name: leadName,
        outcome,
        notes: notes || null,
        user_id: user.id,
      })
      .select()
      .single();

    setIsLoading(false);

    if (error) {
      toast({
        title: 'Error saving contact',
        description: error.message,
        variant: 'destructive',
      });
      return null;
    }

    setContacts((prev) => [data as LeadContact, ...prev]);
    
    toast({
      title: 'Contact recorded',
      description: `Marked ${leadName} as ${outcome.replace('_', ' ')}.`,
    });

    return data as LeadContact;
  }, [toast, user]);

  const getContactsForLead = useCallback((leadId: string) => {
    return contacts.filter((c) => c.lead_id === leadId);
  }, [contacts]);

  const hasBeenContacted = useCallback((leadId: string) => {
    return contacts.some((c) => c.lead_id === leadId);
  }, [contacts]);

  const getLatestContact = useCallback((leadId: string) => {
    return contacts.find((c) => c.lead_id === leadId);
  }, [contacts]);

  return {
    contacts,
    isLoading,
    markAsContacted,
    getContactsForLead,
    hasBeenContacted,
    getLatestContact,
    refetch: fetchContacts,
  };
}
