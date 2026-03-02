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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowLeft, 
  Plus, 
  Users, 
  DollarSign, 
  Clock, 
  CheckCircle, 
  Loader2, 
  Copy, 
  Link2, 
  Trash2, 
  ExternalLink,
  TrendingUp,
  Percent,
  ArrowRight,
  Timer,
  Info
} from 'lucide-react';

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
  trial_signups: number;
  trialing: number;
  click_count: number;
  total_revenue: number;
  paid_subscriptions: number;
  click_to_trial: string;
  trial_to_paid: string;
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

const SITE_URL = 'https://lead-finder-app.com';

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
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedAffiliate, setSelectedAffiliate] = useState<Affiliate | null>(null);
  const [affiliateToDelete, setAffiliateToDelete] = useState<Affiliate | null>(null);
  
  // New affiliate form
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newCommissionRate, setNewCommissionRate] = useState('30');
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    checkAdminAndLoad();
  }, [user]);

  const checkAdminAndLoad = async () => {
    if (!user) return;
    
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
      navigate('/');
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

  const generateCode = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    setNewCode(code);
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
          commission_rate: parseInt(newCommissionRate) / 100,
        },
      });
      
      if (error) throw error;
      
      toast({ title: 'Affiliate created successfully' });
      setShowCreateDialog(false);
      setNewCode('');
      setNewName('');
      setNewEmail('');
      setNewCommissionRate('30');
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

  const handleDeleteAffiliate = async () => {
    if (!affiliateToDelete) return;
    
    setIsDeleting(true);
    try {
      const { error } = await supabase.functions.invoke('admin-affiliates', {
        body: { 
          action: 'delete',
          id: affiliateToDelete.id,
        },
      });
      
      if (error) throw error;
      
      toast({ title: 'Affiliate deleted' });
      setShowDeleteDialog(false);
      setAffiliateToDelete(null);
      await loadAffiliates();
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to delete affiliate',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
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

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied to clipboard` });
  };

  const getAffiliateLink = (code: string) => `${SITE_URL}/?ref=${code}`;

  const formatCurrency = (amount: number, currency = 'gbp') => {
    return new Intl.NumberFormat('en-GB', {
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
  const totalTrialSignups = affiliates.reduce((sum, a) => sum + a.trial_signups, 0);
  const totalTrialing = affiliates.reduce((sum, a) => sum + (a.trialing || 0), 0);
  const totalClicks = affiliates.reduce((sum, a) => sum + (a.click_count || 0), 0);
  const totalRevenue = affiliates.reduce((sum, a) => sum + (a.total_revenue || 0), 0);

  const overallClickToTrial = totalClicks > 0 ? ((totalTrialSignups / totalClicks) * 100).toFixed(1) : '0.0';
  const overallTrialToPaid = totalTrialSignups > 0 ? ((totalConversions / totalTrialSignups) * 100).toFixed(1) : '0.0';

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Affiliate Dashboard</h1>
              <p className="text-muted-foreground">Create links, manage partners & track commissions</p>
              <p className="text-xs text-muted-foreground/70 mt-1 flex items-center gap-1">
                <Info className="h-3 w-3" />
                Trials last 5 days. Paid conversions and commission will update after the trial ends and the first payment succeeds.
              </p>
            </div>
          </div>
          <Button onClick={() => setShowCreateDialog(true)} size="lg">
            <Plus className="h-4 w-4 mr-2" />
            Create Affiliate Link
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Clicks</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Link2 className="h-5 w-5 text-primary" />
                <span className="text-2xl font-bold">{totalClicks}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Trials Started</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-blue-500" />
                <span className="text-2xl font-bold">{totalTrialSignups}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-amber-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Trialing</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Timer className="h-5 w-5 text-amber-500" />
                <span className="text-2xl font-bold">{totalTrialing}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Paid</CardTitle>
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
              <CardTitle className="text-sm font-medium text-muted-foreground">Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-emerald-500" />
                <span className="text-2xl font-bold">{formatCurrency(totalRevenue)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
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
              <CardTitle className="text-sm font-medium text-muted-foreground">Click→Trial</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Percent className="h-5 w-5 text-primary" />
                <span className="text-2xl font-bold">{overallClickToTrial}%</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Trial→Paid</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Percent className="h-5 w-5 text-green-500" />
                <span className="text-2xl font-bold">{overallTrialToPaid}%</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Pipeline Section */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Pipeline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-2 overflow-x-auto">
              <div className="flex flex-col items-center min-w-[80px]">
                <span className="text-2xl font-bold">{totalClicks}</span>
                <span className="text-xs text-muted-foreground">Clicks</span>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex flex-col items-center min-w-[80px]">
                <span className="text-2xl font-bold text-blue-500">{totalTrialSignups}</span>
                <span className="text-xs text-muted-foreground">Trials Started</span>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex flex-col items-center min-w-[80px]">
                <span className="text-2xl font-bold text-amber-500">{totalTrialing}</span>
                <span className="text-xs text-muted-foreground">Trialing</span>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex flex-col items-center min-w-[80px]">
                <span className="text-2xl font-bold text-green-500">{totalConversions}</span>
                <span className="text-xs text-muted-foreground">Paid</span>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex flex-col items-center min-w-[80px]">
                <span className="text-2xl font-bold text-yellow-500">{formatCurrency(totalPending)}</span>
                <span className="text-xs text-muted-foreground">Pending Commission</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Link Generator */}
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Quick Link Generator
            </CardTitle>
            <CardDescription>
              Generate a shareable affiliate link instantly
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <Label>Your Base URL</Label>
                <div className="flex gap-2 mt-1">
                  <Input 
                    value={SITE_URL} 
                    readOnly 
                    className="font-mono text-sm bg-muted"
                  />
                  <Button 
                    variant="outline" 
                    size="icon"
                    onClick={() => copyToClipboard(SITE_URL, 'URL')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex-1">
                <Label>Example Affiliate Link</Label>
                <div className="flex gap-2 mt-1">
                  <Input 
                    value={`${SITE_URL}/?ref=yourcode`} 
                    readOnly 
                    className="font-mono text-sm bg-muted"
                  />
                  <Button 
                    variant="outline"
                    onClick={() => window.open(`${SITE_URL}/?ref=test`, '_blank')}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Affiliates Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Affiliates</CardTitle>
            <CardDescription>
              Click on a row to view conversions. Copy links to share with partners.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : affiliates.length === 0 ? (
              <div className="text-center py-12">
                <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No affiliates yet</h3>
                <p className="text-muted-foreground mb-4">
                  Create your first affiliate link to start tracking referrals
                </p>
                <Button onClick={() => setShowCreateDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Affiliate
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                     <TableRow>
                      <TableHead>Affiliate</TableHead>
                      <TableHead>Link</TableHead>
                      <TableHead>Clicks</TableHead>
                      <TableHead>Trials</TableHead>
                      <TableHead>Trialing</TableHead>
                      <TableHead>Paid</TableHead>
                      <TableHead>Click→Trial</TableHead>
                      <TableHead>Trial→Paid</TableHead>
                      <TableHead>Revenue</TableHead>
                      <TableHead>Commission</TableHead>
                      <TableHead>Active</TableHead>
                      <TableHead></TableHead>
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
                          <div>
                            <p className="font-medium">{affiliate.name}</p>
                            <p className="text-xs text-muted-foreground">{affiliate.email}</p>
                          </div>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="font-mono text-xs">
                              ?ref={affiliate.code}
                            </Badge>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-7 w-7"
                              onClick={() => copyToClipboard(getAffiliateLink(affiliate.code), 'Affiliate link')}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{affiliate.click_count || 0}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-blue-500 font-medium">{affiliate.trial_signups}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-amber-500 font-medium">{affiliate.trialing || 0}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-green-500 font-medium">{affiliate.paid_subscriptions || 0}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{affiliate.click_to_trial}%</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{affiliate.trial_to_paid}%</Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                            {formatCurrency(affiliate.total_revenue || 0)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-amber-600 dark:text-amber-400 font-medium">
                            {formatCurrency(affiliate.pending_commission + affiliate.paid_commission)}
                          </span>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Switch
                            checked={affiliate.is_active}
                            onCheckedChange={() => handleToggleActive(affiliate)}
                          />
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => {
                              setAffiliateToDelete(affiliate);
                              setShowDeleteDialog(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create Affiliate Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create Affiliate Link</DialogTitle>
              <DialogDescription>
                Add a new affiliate partner with a unique referral code
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="code">Referral Code</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    id="code"
                    placeholder="e.g., john2024"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                    className="font-mono"
                  />
                  <Button variant="outline" onClick={generateCode} type="button">
                    Generate
                  </Button>
                </div>
                {newCode && (
                  <p className="text-xs text-muted-foreground mt-2 font-mono bg-muted p-2 rounded">
                    {SITE_URL}/?ref={newCode}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="name">Partner Name</Label>
                <Input
                  id="name"
                  placeholder="John Doe"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="email">Partner Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="john@example.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="rate">Commission Rate (%)</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    id="rate"
                    type="number"
                    min="1"
                    max="100"
                    value={newCommissionRate}
                    onChange={(e) => setNewCommissionRate(e.target.value)}
                    className="w-24"
                  />
                  <Percent className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    of first payment
                  </span>
                </div>
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

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Affiliate</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete {affiliateToDelete?.name}? 
                This will permanently remove the affiliate and their referral link.
                Existing conversions will be preserved.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteAffiliate}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={isDeleting}
              >
                {isDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Conversions Dialog */}
        <Dialog open={showConversionsDialog} onOpenChange={setShowConversionsDialog}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                Conversions for {selectedAffiliate?.name}
              </DialogTitle>
              <DialogDescription className="flex items-center gap-2">
                <span>Referral link:</span>
                <code className="bg-muted px-2 py-1 rounded text-xs font-mono">
                  {selectedAffiliate && getAffiliateLink(selectedAffiliate.code)}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => selectedAffiliate && copyToClipboard(getAffiliateLink(selectedAffiliate.code), 'Link')}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              {conversions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>No paid conversions yet for this affiliate.</p>
                  <p className="text-sm mt-1">Conversions appear when referred users pay their first invoice after the 5-day trial.</p>
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
                            {new Date(conversion.created_at).toLocaleDateString('en-GB', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </TableCell>
                          <TableCell>
                            {formatCurrency(conversion.first_payment_amount, conversion.currency)}
                          </TableCell>
                          <TableCell className="font-medium">
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
                        <CheckCircle className="h-4 w-4 mr-2" />
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
