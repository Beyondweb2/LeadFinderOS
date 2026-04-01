import { useState, useMemo, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useOutreach } from '@/hooks/useOutreach';
import { useCopiedPhones } from '@/hooks/useCopiedPhones';
import { useSubscription } from '@/hooks/useSubscription';
import { OutreachLeadDialog } from '@/components/OutreachLeadDialog';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Search, 
  MessageSquare, 
  Phone, 
  MapPin, 
  ExternalLink, 
  Star, 
  Loader2, 
  PhoneCall, 
  Copy,
  CheckCheck,
  Lock
} from 'lucide-react';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { OutreachStatusBadge } from '@/components/OutreachStatusBadge';
import { useToast } from '@/hooks/use-toast';
import type { OutreachLead } from '@/types/outreach';

const ITEMS_PER_PAGE = 50;

const ArchivePage = () => {
  const {
    archivedLeads,
    isLoading,
    updateStatus,
    updateNextAction,
    updateNotes,
    deleteLead,
    fetchActivities,
    unarchiveLead,
    bulkLookupPhones,
  } = useOutreach();

  const { isPhoneCopied, markAsCopied, markMultipleAsCopied } = useCopiedPhones();
  const { subscribed, isLoading: isLoadingSubscription } = useSubscription();
  const { toast } = useToast();

  const [phoneQuery, setPhoneQuery] = useState('');
  const [selectedLead, setSelectedLead] = useState<OutreachLead | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Non-subscribers can view but not interact
  const isReadOnly = !subscribed && !isLoadingSubscription;
 
  // Count leads missing phone numbers
  const missingPhoneCount = useMemo(() => 
    archivedLeads.filter(l => !l.phone).length,
  [archivedLeads]);

  // Real-time search with typeahead
  const filteredLeads = useMemo(() => {
    if (!phoneQuery.trim()) return archivedLeads;
    
    const digitsOnly = phoneQuery.replace(/\D/g, '');
    if (digitsOnly.length < 2) return archivedLeads;
    
    return archivedLeads.filter((lead) => {
      const leadDigits = lead.phone?.replace(/\D/g, '') || '';
      return leadDigits.includes(digitsOnly);
    });
  }, [archivedLeads, phoneQuery]);

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [phoneQuery]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredLeads.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedLeads = filteredLeads.slice(startIndex, endIndex);

  // Selection handlers
  const handleSelectAll = () => {
    if (selectedIds.size === filteredLeads.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredLeads.map(l => l.id)));
    }
  };

  const handleSelectOne = (leadId: string, checked: boolean) => {
    const newSet = new Set(selectedIds);
    if (checked) {
      newSet.add(leadId);
    } else {
      newSet.delete(leadId);
    }
    setSelectedIds(newSet);
  };

  // Copy selected phones in bulk format: "447477932564, 447477932565"
  const copySelectedPhones = async () => {
    const leadsWithPhones = filteredLeads
      .filter(l => selectedIds.has(l.id) && l.phone);
    
    const phones = leadsWithPhones
      .map(l => l.phone!.replace(/\D/g, '').replace(/^\+/, ''))
      .filter(p => p.length > 0);
    
    if (phones.length === 0) {
      toast({
        title: 'No phone numbers',
        description: 'No phone numbers found in selected leads.',
        variant: 'destructive',
      });
      return;
    }
    
    navigator.clipboard.writeText(phones.join(', '));
    
    // Mark all as copied
    const leadIds = leadsWithPhones.map(l => l.id);
    await markMultipleAsCopied(leadIds);
    
    // Copied — no toast
  };

  // Copy all filtered phones
  const copyAllFilteredPhones = async () => {
    const leadsWithPhones = filteredLeads.filter(l => l.phone);
    
    const phones = leadsWithPhones
      .map(l => l.phone!.replace(/\D/g, '').replace(/^\+/, ''))
      .filter(p => p.length > 0);
    
    if (phones.length === 0) {
      toast({
        title: 'No phone numbers',
        description: 'No phone numbers found in filtered leads.',
        variant: 'destructive',
      });
      return;
    }
    
    navigator.clipboard.writeText(phones.join(', '));
    
    // Mark all as copied
    const leadIds = leadsWithPhones.map(l => l.id);
    await markMultipleAsCopied(leadIds);
    
    // Copied — no toast
  };

  // Copy single phone
  const copySinglePhone = async (lead: OutreachLead, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!lead.phone) return;
    
    const phone = lead.phone.replace(/\D/g, '').replace(/^\+/, '');
    navigator.clipboard.writeText(phone);
    
    await markAsCopied(lead.id);
    
    // Copied — no toast
  };

  const handleMarkInterested = async (lead: OutreachLead) => {
    await updateStatus(lead.id, 'interested');
    await unarchiveLead(lead.id);
  };

  const [lookupProgress, setLookupProgress] = useState<{ current: number; total: number } | null>(null);

  const handleBulkLookup = useCallback(async () => {
    setIsLookingUp(true);
    setLookupProgress({ current: 0, total: missingPhoneCount });
    try {
      const missingIds = archivedLeads.filter(l => !l.phone).map(l => l.id);
      const result = await bulkLookupPhones(missingIds, (current, total) => {
        setLookupProgress({ current, total });
      });

      if (result.updated > 0 || result.failed > 0) {
        toast({
          title: 'Phone lookup complete',
          description: `${result.updated} found, ${result.skipped} skipped, ${result.failed} failed`,
        });
      }
    } catch (err) {
      console.error('Bulk lookup error:', err);
      toast({
        title: 'Lookup failed',
        description: 'An error occurred during phone lookup.',
        variant: 'destructive',
      });
    } finally {
      setIsLookingUp(false);
      setLookupProgress(null);
    }
  }, [archivedLeads, bulkLookupPhones, missingPhoneCount, toast]);
 
   if (isLoading) {
     return (
       <div className="flex items-center justify-center py-16">
         <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
       </div>
     );
   }
 
   return (
     <div className="space-y-4 sm:space-y-6">
        <div className="text-center sm:text-left">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex flex-col sm:flex-row items-center gap-2 justify-center sm:justify-start">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 sm:h-6 sm:w-6" />
              <span>Contacted</span>
            </div>
            <span className="text-sm sm:text-base font-normal text-muted-foreground">
              ({archivedLeads.length} businesses)
            </span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-lg">
            Businesses you've bulk texted. When someone responds, search by their phone number here and click "Track" to move them to Track Leads.
          </p>
        </div>

        {/* Subscribe banner for non-subscribers */}
        {isReadOnly && (
          <Alert className="border-primary/30 bg-primary/5">
            <Lock className="h-4 w-4 text-primary" />
            <AlertDescription className="flex items-center justify-between gap-4 flex-wrap">
              <span>Subscribe for full access to manage your leads.</span>
              <Button asChild size="sm" className="bg-primary">
                <Link to="/subscribe">Subscribe Now</Link>
              </Button>
            </AlertDescription>
          </Alert>
        )}
 
       {/* Search Bar */}
       <Card className={`bg-card/50 border-border/50 ${isReadOnly ? 'opacity-70' : ''}`}>
         <CardHeader className="pb-3 px-4 sm:px-6">
           <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
             <CardTitle className="text-sm sm:text-base">Search by Phone</CardTitle>
             {!isReadOnly && (
               <div className="flex flex-wrap items-center gap-2">
                 {selectedIds.size > 0 && (
                   <Button
                     variant="default"
                     size="sm"
                     onClick={copySelectedPhones}
                     className="bg-primary text-xs sm:text-sm"
                   >
                     <Copy className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                     Copy Numbers ({selectedIds.size})
                   </Button>
                 )}
                 <Button
                   variant="outline"
                   size="sm"
                   onClick={copyAllFilteredPhones}
                   disabled={filteredLeads.filter(l => l.phone).length === 0}
                   className="text-xs sm:text-sm"
                 >
                   <Copy className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                   <span className="hidden sm:inline">Copy All Numbers </span>({filteredLeads.filter(l => l.phone).length})
                 </Button>
                 {missingPhoneCount > 0 && (
                   <Button
                     variant="outline"
                     size="sm"
                     onClick={handleBulkLookup}
                     disabled={isLookingUp}
                     className="text-xs sm:text-sm"
                   >
                     {isLookingUp ? (
                       <>
                         <Loader2 className="mr-1.5 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin" />
                         <span className="hidden sm:inline">Looking up...</span>
                         <span className="sm:hidden">...</span>
                     </>
                   ) : (
                     <>
                       <PhoneCall className="mr-1.5 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
                       <span className="hidden sm:inline">Lookup </span>{missingPhoneCount}
                     </>
                     )}
                   </Button>
                 )}
               </div>
             )}
           </div>
         </CardHeader>
         <CardContent className="px-4 sm:px-6">
           <div className="relative max-w-full sm:max-w-md">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
             <Input
               placeholder="Start typing a phone number..."
               value={phoneQuery}
               onChange={(e) => setPhoneQuery(e.target.value)}
               className="pl-9 text-sm"
             />
           </div>
           {phoneQuery && (
             <p className="mt-2 text-xs sm:text-sm text-muted-foreground">
               Showing {filteredLeads.length} of {archivedLeads.length} archived leads
             </p>
           )}
           {selectedIds.size > 0 && (
             <p className="mt-2 text-xs sm:text-sm text-primary">
               {selectedIds.size} selected
             </p>
           )}
         </CardContent>
       </Card>
 
       {/* Results Table */}
       <Card className="bg-card/50 border-border/50">
         <CardContent className="p-0">
           <div className="overflow-x-auto">
             <Table>
               <TableHeader>
                 <TableRow className="border-border/50">
                   <TableHead className="w-[50px]">
                     <Checkbox
                       checked={selectedIds.size === filteredLeads.length && filteredLeads.length > 0}
                       onCheckedChange={handleSelectAll}
                       disabled={isReadOnly}
                       aria-label="Select all"
                     />
                   </TableHead>
                   <TableHead className="w-[250px]">Business</TableHead>
                   <TableHead className="w-[180px]">Phone</TableHead>
                   <TableHead className="w-[200px]">Address</TableHead>
                   <TableHead className="w-[120px]">Status</TableHead>
                   <TableHead className="w-[150px]">Actions</TableHead>
                 </TableRow>
               </TableHeader>
               <TableBody>
                  {paginatedLeads.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                        {phoneQuery ? 'No archived leads match this phone number.' : 'No archived leads yet.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedLeads.map((lead) => {
                      const phoneCopied = isPhoneCopied(lead.id);
                      
                      return (
                        <TableRow
                          key={lead.id}
                          className="border-border/50 hover:bg-muted/30 cursor-pointer"
                          onClick={() => setSelectedLead(lead)}
                        >
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedIds.has(lead.id)}
                              onCheckedChange={(checked) => handleSelectOne(lead.id, checked as boolean)}
                              aria-label={`Select ${lead.business_name}`}
                              disabled={isReadOnly}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium truncate max-w-[230px]">
                                {lead.business_name}
                              </span>
                              {lead.category && (
                                <span className="text-xs text-muted-foreground truncate">
                                  {lead.category}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {lead.phone ? (
                              <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1">
                                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="font-mono text-sm">{lead.phone}</span>
                                </div>
                                {!isReadOnly && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={(e) => copySinglePhone(lead, e)}
                                    title={phoneCopied ? 'Already copied' : 'Copy phone number'}
                                  >
                                    {phoneCopied ? (
                                      <CheckCheck className="h-3.5 w-3.5 text-primary" />
                                    ) : (
                                      <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                                    )}
                                  </Button>
                                )}
                                {phoneCopied && !isReadOnly && (
                                  <span className="text-xs text-primary">Copied</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {lead.address ? (
                              <div className="flex items-center gap-1">
                                <MapPin className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                <span className="truncate max-w-[180px] text-muted-foreground text-sm">
                                  {lead.address}
                                </span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <OutreachStatusBadge status={lead.status} />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                              {!isReadOnly ? (
                                <Button
                                  variant="default"
                                  size="sm"
                                  onClick={() => handleMarkInterested(lead)}
                                  className="bg-primary hover:bg-primary/90"
                                >
                                  <Star className="h-3.5 w-3.5 mr-1" />
                                  Track
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground">View only</span>
                              )}
                              {lead.google_maps_url && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  asChild
                                >
                                  <a
                                    href={lead.google_maps_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                  </a>
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
               </TableBody>
             </Table>
            </div>
          </CardContent>
          
          {/* Pagination Controls */}
          {filteredLeads.length > ITEMS_PER_PAGE && (
            <div className="flex items-center justify-between border-t border-border/50 px-6 py-4">
              <p className="text-sm text-muted-foreground">
                Showing {startIndex + 1}-{Math.min(endIndex, filteredLeads.length)} of {filteredLeads.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground px-2">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* Lead Detail Dialog */}
       <OutreachLeadDialog
         lead={selectedLead}
         open={!!selectedLead}
         onOpenChange={(open) => !open && setSelectedLead(null)}
         onUpdateStatus={updateStatus}
         onUpdateNextAction={updateNextAction}
         onUpdateNotes={updateNotes}
         onDelete={deleteLead}
         fetchActivities={fetchActivities}
       />
     </div>
   );
 };
 
 export default ArchivePage;
