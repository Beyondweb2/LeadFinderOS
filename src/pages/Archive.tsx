import { useState, useMemo } from 'react';
import { useOutreach } from '@/hooks/useOutreach';
import { useCopiedPhones } from '@/hooks/useCopiedPhones';
import { OutreachLeadDialog } from '@/components/OutreachLeadDialog';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Search, 
  Archive, 
  Phone, 
  MapPin, 
  ExternalLink, 
  Star, 
  Loader2, 
  PhoneCall, 
  Copy,
  CheckCheck 
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
  const { toast } = useToast();

  const [phoneQuery, setPhoneQuery] = useState('');
  const [selectedLead, setSelectedLead] = useState<OutreachLead | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
 
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
  useMemo(() => {
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
    
    toast({
      title: 'Copied!',
      description: `${phones.length} phone numbers copied in bulk format.`,
    });
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
    
    toast({
      title: 'Copied!',
      description: `${phones.length} phone numbers copied in bulk format.`,
    });
  };

  // Copy single phone
  const copySinglePhone = async (lead: OutreachLead, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!lead.phone) return;
    
    const phone = lead.phone.replace(/\D/g, '').replace(/^\+/, '');
    navigator.clipboard.writeText(phone);
    
    await markAsCopied(lead.id);
    
    toast({
      title: 'Copied!',
      description: `Phone number copied.`,
    });
  };

  const handleMarkInterested = async (lead: OutreachLead) => {
    await updateStatus(lead.id, 'interested');
    await unarchiveLead(lead.id);
  };

  const handleBulkLookup = async () => {
    setIsLookingUp(true);
    try {
      const missingIds = archivedLeads.filter(l => !l.phone).map(l => l.id);
      
      // Process in batches of 50 (API limit)
      const batchSize = 50;
      
      for (let i = 0; i < missingIds.length; i += batchSize) {
        const batch = missingIds.slice(i, i + batchSize);
        await bulkLookupPhones(batch);
        
        // Small delay between batches
        if (i + batchSize < missingIds.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    } finally {
      setIsLookingUp(false);
    }
  };
 
   if (isLoading) {
     return (
       <div className="flex items-center justify-center py-16">
         <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
       </div>
     );
   }
 
   return (
     <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Archive className="h-6 w-6" />
            Archive
            <span className="text-base font-normal text-muted-foreground">
              ({archivedLeads.length} businesses)
            </span>
          </h1>
          <p className="text-muted-foreground">
            Search archived businesses by phone number
          </p>
        </div>
 
       {/* Search Bar */}
       <Card className="bg-card/50 border-border/50">
         <CardHeader className="pb-3">
           <div className="flex items-center justify-between flex-wrap gap-3">
             <CardTitle className="text-base">Search by Phone</CardTitle>
             <div className="flex items-center gap-2">
               {selectedIds.size > 0 && (
                 <Button
                   variant="default"
                   size="sm"
                   onClick={copySelectedPhones}
                   className="bg-primary"
                 >
                   <Copy className="h-4 w-4 mr-2" />
                   Copy {selectedIds.size} Phones
                 </Button>
               )}
               <Button
                 variant="outline"
                 size="sm"
                 onClick={copyAllFilteredPhones}
                 disabled={filteredLeads.filter(l => l.phone).length === 0}
               >
                 <Copy className="h-4 w-4 mr-2" />
                 Copy All Filtered ({filteredLeads.filter(l => l.phone).length})
               </Button>
               {missingPhoneCount > 0 && (
                 <Button
                   variant="outline"
                   size="sm"
                   onClick={handleBulkLookup}
                   disabled={isLookingUp}
                 >
                   {isLookingUp ? (
                     <>
                       <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                       Looking up...
                     </>
                   ) : (
                     <>
                       <PhoneCall className="mr-2 h-4 w-4" />
                       Lookup {missingPhoneCount} Missing
                     </>
                   )}
                 </Button>
               )}
             </div>
           </div>
         </CardHeader>
         <CardContent>
           <div className="relative max-w-md">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
             <Input
               placeholder="Start typing a phone number..."
               value={phoneQuery}
               onChange={(e) => setPhoneQuery(e.target.value)}
               className="pl-9"
             />
           </div>
           {phoneQuery && (
             <p className="mt-2 text-sm text-muted-foreground">
               Showing {filteredLeads.length} of {archivedLeads.length} archived leads
             </p>
           )}
           {selectedIds.size > 0 && (
             <p className="mt-2 text-sm text-primary">
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
                                {phoneCopied && (
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
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => handleMarkInterested(lead)}
                               className="bg-primary hover:bg-primary/90"
                              >
                                <Star className="h-3.5 w-3.5 mr-1" />
                                Interested
                              </Button>
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
