import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import type { LeadStatus, NextActionType } from '@/types/outreach';

interface AddCustomLeadDialogProps {
  onLeadAdded: () => void;
}

export const AddCustomLeadDialog = ({ onLeadAdded }: AddCustomLeadDialogProps) => {
  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const [form, setForm] = useState({
    business_name: '',
    phone: '',
    email: '',
    category: '',
    address: '',
    google_maps_url: '',
    notes: '',
  });

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const resetForm = () => {
    setForm({
      business_name: '',
      phone: '',
      email: '',
      category: '',
      address: '',
      google_maps_url: '',
      notes: '',
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !form.business_name.trim()) return;

    setIsSaving(true);
    try {
      // Check for duplicate
      const { data: existing } = await supabase
        .from('outreach_leads')
        .select('id')
        .eq('business_name', form.business_name.trim())
        .limit(1)
        .maybeSingle();

      if (existing) {
        toast({
          title: 'Already exists',
          description: `${form.business_name} is already in your list.`,
          variant: 'destructive',
        });
        setIsSaving(false);
        return;
      }

      const { error } = await supabase.from('outreach_leads').insert({
        user_id: user.id,
        business_name: form.business_name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        category: form.category.trim() || null,
        address: form.address.trim() || null,
        google_maps_url: form.google_maps_url.trim() || null,
        notes: form.notes.trim() || null,
        status: 'interested' as LeadStatus,
        is_potential_work: true,
        next_action: 'none' as NextActionType,
        country: 'UK',
        list_type: 'manual',
      });

      if (error) throw error;

      // Also add to history
      await supabase.from('outreach_history').insert({
        user_id: user.id,
        business_name: form.business_name.trim(),
        google_maps_url: form.google_maps_url.trim() || null,
        phone: form.phone.trim() || null,
      });

      // Lead added — no toast

      resetForm();
      setOpen(false);
      onLeadAdded();
    } catch (err: any) {
      toast({
        title: 'Error adding lead',
        description: err.message || 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-8 sm:h-10 text-xs sm:text-sm gap-1.5">
          <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          Add Lead
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Custom Lead</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="business_name">Business Name *</Label>
            <Input
              id="business_name"
              value={form.business_name}
              onChange={(e) => updateField('business_name', e.target.value)}
              placeholder="e.g. Joe's Plumbing"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => updateField('phone', e.target.value)}
                placeholder="+44 7123 456789"
                type="tel"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                value={form.email}
                onChange={(e) => updateField('email', e.target.value)}
                placeholder="info@business.com"
                type="email"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                value={form.category}
                onChange={(e) => updateField('category', e.target.value)}
                placeholder="e.g. Plumber"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={form.address}
                onChange={(e) => updateField('address', e.target.value)}
                placeholder="123 High St, London"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="google_maps_url">Google Maps URL</Label>
            <Input
              id="google_maps_url"
              value={form.google_maps_url}
              onChange={(e) => updateField('google_maps_url', e.target.value)}
              placeholder="https://maps.google.com/..."
              type="url"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={form.notes}
              onChange={(e) => updateField('notes', e.target.value)}
              placeholder="Any details about this lead..."
              rows={3}
              className="resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSaving || !form.business_name.trim()}>
              {isSaving ? 'Adding...' : 'Add Lead'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
