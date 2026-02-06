 import { useState, useMemo } from 'react';
 import { useOutreach } from '@/hooks/useOutreach';
 import { OutreachLeadDialog } from '@/components/OutreachLeadDialog';
 import { Input } from '@/components/ui/input';
 import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
 import { Button } from '@/components/ui/button';
 import { Search, Archive, Phone, MapPin, ExternalLink, Star, Loader2, PhoneCall } from 'lucide-react';
 import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
 import { OutreachStatusBadge } from '@/components/OutreachStatusBadge';
 import type { OutreachLead } from '@/types/outreach';
 
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
 
   const [phoneQuery, setPhoneQuery] = useState('');
   const [selectedLead, setSelectedLead] = useState<OutreachLead | null>(null);
   const [isLookingUp, setIsLookingUp] = useState(false);
 
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
      let totalUpdated = 0;
      
      for (let i = 0; i < missingIds.length; i += batchSize) {
        const batch = missingIds.slice(i, i + batchSize);
        const result = await bulkLookupPhones(batch);
        totalUpdated += result.updated;
        
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
         </h1>
         <p className="text-muted-foreground">
           Search archived businesses by phone number
         </p>
       </div>
 
       {/* Search Bar */}
       <Card className="bg-card/50 border-border/50">
         <CardHeader className="pb-3">
           <div className="flex items-center justify-between">
             <CardTitle className="text-base">Search by Phone</CardTitle>
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
                     Lookup {missingPhoneCount} Missing Phones
                   </>
                 )}
               </Button>
             )}
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
         </CardContent>
       </Card>
 
       {/* Results Table */}
       <Card className="bg-card/50 border-border/50">
         <CardContent className="p-0">
           <div className="overflow-x-auto">
             <Table>
               <TableHeader>
                 <TableRow className="border-border/50">
                   <TableHead className="w-[250px]">Business</TableHead>
                   <TableHead className="w-[150px]">Phone</TableHead>
                   <TableHead className="w-[200px]">Address</TableHead>
                   <TableHead className="w-[120px]">Status</TableHead>
                   <TableHead className="w-[150px]">Actions</TableHead>
                 </TableRow>
               </TableHeader>
               <TableBody>
                 {filteredLeads.length === 0 ? (
                   <TableRow>
                     <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                       {phoneQuery ? 'No archived leads match this phone number.' : 'No archived leads yet.'}
                     </TableCell>
                   </TableRow>
                 ) : (
                   filteredLeads.slice(0, 50).map((lead) => (
                     <TableRow
                       key={lead.id}
                       className="border-border/50 hover:bg-muted/30 cursor-pointer"
                       onClick={() => setSelectedLead(lead)}
                     >
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
                           <div className="flex items-center gap-1">
                             <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                             <span className="font-mono text-sm">{lead.phone}</span>
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
                   ))
                 )}
               </TableBody>
             </Table>
           </div>
         </CardContent>
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