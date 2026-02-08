import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Plus, Users, DollarSign, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';

interface Affiliate {
  id: string;
  code: string;
  name: string;
  email: string;
  commission_rate: number;
  is_active: boolean;
  created_at: string;
  total_conversions: number;
  pending_commission: number;
  paid_commission: number;
}

interface Conversion {
  id: string;
  affiliate_id: string;
  user_id: string;
  first_payment_amount: number;
  commission_amount: number;
  currency: string;
  paid_at: string;
  status: 'pending' | 'paid' | 'void';
  created_at: string;
}

export default function AdminAffiliates() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [conversions, setConversions] = useState<Conversion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showConversionsDialog, setShowConversionsDialog] = useState(false);
  const [selectedAffiliate, setSelectedAffiliate] = useState<Affiliate | null>(null);
  
  // New affiliate form
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    checkAdminAndLoad();
  }, [user]);

  const checkAdminAndLoad = async () => {
    if (!user) return;
    
    // Check admin role
    const { data } = await supabase.rpc('has_role', { 
      _user_id: user.id, 
      _role: 'admin' 
    });
    
    if (!data) {
      toast({
        title: 'Access Denied',
        description: 'You do not have admin privileges.',
        variant: 'destructive',
      });
      navigate('/app');
      return;
    }
    
    setIsAdmin(true);
    await loadAffiliates();
  };

  const loadAffiliates = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-affiliates', {
        body: { action: 'list' },
      });
      
      if (error) throw error;
      setAffiliates(data.affiliates || []);
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to load affiliates',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadConversions = async (affiliateId?: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('admin-affiliates', {
        body: { action: 'list_conversions', affiliate_id: affiliateId },
      });
      
      if (error) throw error;
      setConversions(data.conversions || []);
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to load conversions',
        variant: 'destructive',
      });
    }
  };

  const handleCreateAffiliate = async () => {
    if (!newCode.trim() || !newName.trim() || !newEmail.trim()) {
      toast({
        title: 'Validation Error',
        description: 'All fields are required',
        variant: 'destructive',
      });
      return;
    }
    
    setIsCreating(true);
    try {
      const { error } = await supabase.functions.invoke('admin-affiliates', {
        body: { 
          action: 'create',
          code: newCode,
          name: newName,
          email: newEmail,
        },
      });
      
      if (error) throw error;
      
      toast({ title: 'Affiliate created successfully' });
      setShowCreateDialog(false);
      setNewCode('');
      setNewName('');
      setNewEmail('');
      await loadAffiliates();
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to create affiliate',
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggleActive = async (affiliate: Affiliate) => {
    try {
      const { error } = await supabase.functions.invoke('admin-affiliates', {
        body: { 
          action: 'update',
          id: affiliate.id,
          is_active: !affiliate.is_active,
        },
      });
      
      if (error) throw error;
      await loadAffiliates();
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to update affiliate',
        variant: 'destructive',
      });
    }
  };

  const handleViewConversions = async (affiliate: Affiliate) => {
    setSelectedAffiliate(affiliate);
    await loadConversions(affiliate.id);
    setShowConversionsDialog(true);
  };

  const handleMarkPaid = async (conversionIds: string[]) => {
    try {
      const { error } = await supabase.functions.invoke('admin-affiliates', {
        body: { 
          action: 'mark_paid',
          conversion_ids: conversionIds,
        },
      });
      
      if (error) throw error;
      
      toast({ title: 'Conversions marked as paid' });
      if (selectedAffiliate) {
        await loadConversions(selectedAffiliate.id);
      }
      await loadAffiliates();
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to mark conversions as paid',
        variant: 'destructive',
      });
    }
  };

  const formatCurrency = (amount: number, currency = 'usd') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalPending = affiliates.reduce((sum, a) => sum + a.pending_commission, 0);
  const totalPaid = affiliates.reduce((sum, a) => sum + a.paid_commission, 0);
  const totalConversions = affiliates.reduce((sum, a) => sum + a.total_conversions, 0);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/app')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Affiliate Management</h1>
              <p className="text-muted-foreground">Manage affiliates and track commissions</p>
            </div>
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Affiliate
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Affiliates
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                <span className="text-2xl font-bold">{affiliates.length}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Conversions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span className="text-2xl font-bold">{totalConversions}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pending Commission
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-yellow-500" />
                <span className="text-2xl font-bold">{formatCurrency(totalPending)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Paid Commission
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-green-500" />
                <span className="text-2xl font-bold">{formatCurrency(totalPaid)}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Affiliates Table */}
        <Card>
          <CardHeader>
            <CardTitle>Affiliates</CardTitle>
            <CardDescription>
              Click on an affiliate to view their conversions
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : affiliates.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No affiliates yet. Create your first affiliate to get started.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Rate</TableHead>
                    <TableHead>Conversions</TableHead>
                    <TableHead>Pending</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead>Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {affiliates.map((affiliate) => (
                    <TableRow 
                      key={affiliate.id} 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleViewConversions(affiliate)}
                    >
                      <TableCell>
                        <Badge variant="outline" className="font-mono">
                          {affiliate.code}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{affiliate.name}</TableCell>
                      <TableCell>{affiliate.email}</TableCell>
                      <TableCell>{(affiliate.commission_rate * 100).toFixed(0)}%</TableCell>
                      <TableCell>{affiliate.total_conversions}</TableCell>
                      <TableCell className="text-yellow-500">
                        {formatCurrency(affiliate.pending_commission)}
                      </TableCell>
                      <TableCell className="text-green-500">
                        {formatCurrency(affiliate.paid_commission)}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Switch
                          checked={affiliate.is_active}
                          onCheckedChange={() => handleToggleActive(affiliate)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Create Affiliate Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Affiliate</DialogTitle>
              <DialogDescription>
                Add a new affiliate partner. They'll receive a unique referral code.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="code">Referral Code</Label>
                <Input
                  id="code"
                  placeholder="e.g., john2024"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  URL will be: yourdomain.com/?ref={newCode || 'code'}
                </p>
              </div>
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  placeholder="John Doe"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="john@example.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateAffiliate} disabled={isCreating}>
                {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Affiliate
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Conversions Dialog */}
        <Dialog open={showConversionsDialog} onOpenChange={setShowConversionsDialog}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>
                Conversions for {selectedAffiliate?.name}
              </DialogTitle>
              <DialogDescription>
                Referral code: <Badge variant="outline" className="font-mono">{selectedAffiliate?.code}</Badge>
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              {conversions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No conversions yet for this affiliate.
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead>Commission</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {conversions.map((conversion) => (
                        <TableRow key={conversion.id}>
                          <TableCell>
                            {new Date(conversion.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            {formatCurrency(conversion.first_payment_amount, conversion.currency)}
                          </TableCell>
                          <TableCell>
                            {formatCurrency(conversion.commission_amount, conversion.currency)}
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant={
                                conversion.status === 'paid' ? 'default' : 
                                conversion.status === 'void' ? 'destructive' : 'secondary'
                              }
                            >
                              {conversion.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  
                  {conversions.some(c => c.status === 'pending') && (
                    <div className="mt-4 flex justify-end">
                      <Button 
                        onClick={() => handleMarkPaid(
                          conversions.filter(c => c.status === 'pending').map(c => c.id)
                        )}
                      >
                        Mark All Pending as Paid
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
