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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import type { LeadStatus, NextActionType } from '@/types/outreach';

const CONTACT_METHOD_OPTIONS = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'sms', label: 'SMS' },
  { value: 'contacted', label: 'Call' },
  { value: 'facebook_msg', label: 'Facebook' },
];

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
    website: '',
    contact_name: '',
    potential_revenue: '',
    notes: '',
    contact_method: '',
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
      website: '',
      contact_name: '',
      potential_revenue: '',
      notes: '',
      contact_method: '',
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

      const revenueValue = form.potential_revenue ? parseFloat(form.potential_revenue) : null;

      const { error } = await supabase.from('outreach_leads').insert({
        user_id: user.id,
        business_name: form.business_name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        category: form.category.trim() || null,
        address: form.address.trim() || null,
        google_maps_url: form.google_maps_url.trim() || null,
        website: form.website.trim() || null,
        contact_name: form.contact_name.trim() || null,
        potential_revenue: revenueValue,
        notes: form.notes.trim() || null,
        contact_method: form.contact_method || null,
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
        <form onSubmit={handleSubmit} className="space-y-3 pt-2">
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
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact_method">Contact Method</Label>
              <Select value={form.contact_method} onValueChange={(v) => updateField('contact_method', v)}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {CONTACT_METHOD_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="contact_name">Contact Name</Label>
              <Input
                id="contact_name"
                value={form.contact_name}
                onChange={(e) => updateField('contact_name', e.target.value)}
                placeholder="John Smith"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                value={form.category}
                onChange={(e) => updateField('category', e.target.value)}
                placeholder="e.g. Plumber"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                value={form.email}
                onChange={(e) => updateField('email', e.target.value)}
                placeholder="info@business.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="potential_revenue">Potential Revenue (£)</Label>
              <Input
                id="potential_revenue"
                value={form.potential_revenue}
                onChange={(e) => updateField('potential_revenue', e.target.value)}
                placeholder="1500"
                type="number"
                min="0"
                step="0.01"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="address">Address / Location</Label>
            <Input
              id="address"
              value={form.address}
              onChange={(e) => updateField('address', e.target.value)}
              placeholder="123 High St, London"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                value={form.website}
                onChange={(e) => updateField('website', e.target.value)}
                placeholder="example.com or any text"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="google_maps_url">Google Maps</Label>
              <Input
                id="google_maps_url"
                value={form.google_maps_url}
                onChange={(e) => updateField('google_maps_url', e.target.value)}
                placeholder="Link or location note"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={form.notes}
              onChange={(e) => updateField('notes', e.target.value)}
              placeholder="Any details about this lead..."
              rows={2}
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
