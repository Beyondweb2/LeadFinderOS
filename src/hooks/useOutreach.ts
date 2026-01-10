import { useState, useCallback, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import type { OutreachLead, OutreachActivity, LeadStatus, NextActionType } from '@/types/outreach';
import type { Lead } from '@/types/lead';

export function useOutreach() {
  const [leads, setLeads] = useState<OutreachLead[]>([]);
  const [activities, setActivities] = useState<OutreachActivity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const fetchLeads = useCallback(async () => {
    if (!user) return;
    
    setIsLoading(true);
    const { data, error } = await supabase
      .from('outreach_leads')
      .select('*')
      .order('next_action_date', { ascending: true, nullsFirst: false });

    setIsLoading(false);

    if (error) {
      console.error('Error fetching outreach leads:', error);
      toast({
        title: 'Error loading leads',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    setLeads(data as OutreachLead[]);
  }, [user, toast]);

  const fetchActivities = useCallback(async (leadId: string) => {
    const { data, error } = await supabase
      .from('outreach_activities')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching activities:', error);
      return [];
    }

    return data as OutreachActivity[];
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const addLead = useCallback(async (lead: Lead) => {
    if (!user) {
      toast({
        title: 'Not authenticated',
        description: 'Please log in to add leads.',
        variant: 'destructive',
      });
      return null;
    }

    // Check if lead was EVER added before (even if deleted) using outreach_history
    const { data: historyMatch } = await supabase
      .from('outreach_history')
      .select('id')
      .or(`business_name.eq.${lead.name},google_maps_url.eq.${lead.googleMapsUrl}`)
      .limit(1)
      .maybeSingle();

    if (historyMatch) {
      toast({
        title: 'Previously added',
        description: `${lead.name} was already added to your outreach list before.`,
        variant: 'destructive',
      });
      return null;
    }

    const { data, error } = await supabase
      .from('outreach_leads')
      .insert({
        user_id: user.id,
        business_name: lead.name,
        phone: lead.phone || null,
        email: null,
        google_maps_url: lead.googleMapsUrl,
        address: lead.address,
        category: lead.category || null,
        status: 'not_contacted' as LeadStatus,
        next_action: 'call' as NextActionType,
        next_action_date: new Date().toISOString().split('T')[0],
      })
      .select()
      .single();

    if (error) {
      toast({
        title: 'Error adding lead',
        description: error.message,
        variant: 'destructive',
      });
      return null;
    }

    const newLead = data as OutreachLead;
    setLeads((prev) => [...prev, newLead]);

    // Track in history (so we remember even if deleted later)
    await supabase.from('outreach_history').insert({
      user_id: user.id,
      business_name: lead.name,
      google_maps_url: lead.googleMapsUrl || null,
    });

    // Log activity
    await logActivity(newLead.id, 'added', `Added ${lead.name} to outreach list`);

    toast({
      title: 'Lead added',
      description: `${lead.name} added to your outreach list.`,
    });

    return newLead;
  }, [user, toast]);

  const updateLead = useCallback(async (
    leadId: string,
    updates: Partial<Pick<OutreachLead, 'status' | 'next_action' | 'next_action_date' | 'notes' | 'email'>>
  ) => {
    const { data, error } = await supabase
      .from('outreach_leads')
      .update(updates)
      .eq('id', leadId)
      .select()
      .single();

    if (error) {
      toast({
        title: 'Error updating lead',
        description: error.message,
        variant: 'destructive',
      });
      return null;
    }

    const updatedLead = data as OutreachLead;
    setLeads((prev) => prev.map((l) => (l.id === leadId ? updatedLead : l)));

    return updatedLead;
  }, [toast]);

  const updateStatus = useCallback(async (leadId: string, status: LeadStatus) => {
    const lead = leads.find((l) => l.id === leadId);
    const result = await updateLead(leadId, { status });
    
    if (result && lead) {
      await logActivity(leadId, 'status_change', `Status changed to ${status.replace('_', ' ')}`);
    }
    
    return result;
  }, [leads, updateLead]);

  const updateNextAction = useCallback(async (
    leadId: string,
    nextAction: NextActionType,
    nextActionDate?: string
  ) => {
    const updates: Partial<OutreachLead> = { next_action: nextAction };
    if (nextActionDate) {
      updates.next_action_date = nextActionDate;
    }
    
    const lead = leads.find((l) => l.id === leadId);
    const result = await updateLead(leadId, updates);
    
    if (result && lead) {
      const dateStr = nextActionDate ? ` for ${nextActionDate}` : '';
      await logActivity(leadId, 'action_scheduled', `Next action: ${nextAction.replace('_', ' ')}${dateStr}`);
    }
    
    return result;
  }, [leads, updateLead]);

  const updateNotes = useCallback(async (leadId: string, notes: string) => {
    return updateLead(leadId, { notes });
  }, [updateLead]);

  const deleteLead = useCallback(async (leadId: string) => {
    const lead = leads.find((l) => l.id === leadId);
    
    const { error } = await supabase
      .from('outreach_leads')
      .delete()
      .eq('id', leadId);

    if (error) {
      toast({
        title: 'Error deleting lead',
        description: error.message,
        variant: 'destructive',
      });
      return false;
    }

    setLeads((prev) => prev.filter((l) => l.id !== leadId));
    
    toast({
      title: 'Lead removed',
      description: lead ? `${lead.business_name} removed from outreach.` : 'Lead removed.',
    });

    return true;
  }, [leads, toast]);

  const logActivity = useCallback(async (
    leadId: string,
    activityType: string,
    description: string
  ) => {
    if (!user) return null;

    const { data, error } = await supabase
      .from('outreach_activities')
      .insert({
        lead_id: leadId,
        user_id: user.id,
        activity_type: activityType,
        description,
      })
      .select()
      .single();

    if (error) {
      console.error('Error logging activity:', error);
      return null;
    }

    return data as OutreachActivity;
  }, [user]);

  const isInOutreach = useCallback((leadName: string, googleMapsUrl?: string): boolean => {
    // Check current leads only (for UI state - fast, sync check)
    return leads.some(
      (l) => l.business_name === leadName || (googleMapsUrl && l.google_maps_url === googleMapsUrl)
    );
  }, [leads]);

  return {
    leads,
    activities,
    isLoading,
    addLead,
    updateLead,
    updateStatus,
    updateNextAction,
    updateNotes,
    deleteLead,
    fetchActivities,
    logActivity,
    isInOutreach,
    refetch: fetchLeads,
  };
}
