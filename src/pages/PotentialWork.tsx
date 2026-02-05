 import { useState, useMemo } from 'react';
 import { useOutreach } from '@/hooks/useOutreach';
 import { OutreachLeadDialog } from '@/components/OutreachLeadDialog';
 import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
 import { Button } from '@/components/ui/button';
 import { Input } from '@/components/ui/input';
 import { Textarea } from '@/components/ui/textarea';
 import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
 } from '@/components/ui/select';
 import {
   Dialog,
   DialogContent,
   DialogHeader,
   DialogTitle,
 } from '@/components/ui/dialog';
 import { Calendar } from '@/components/ui/calendar';
 import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
 import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
 import { OutreachStatusBadge } from '@/components/OutreachStatusBadge';
 import { NextActionBadge } from '@/components/NextActionBadge';
 import { Briefcase, Phone, Search, Calendar as CalendarIcon, FileText, MapPin, ExternalLink, Trash2 } from 'lucide-react';
 import { format } from 'date-fns';
 import type { OutreachLead, LeadStatus, NextActionType } from '@/types/outreach';
 
 // Potential work specific statuses
 const POTENTIAL_WORK_STATUSES: { value: LeadStatus; label: string }[] = [
   { value: 'interested', label: 'Interested' },
   { value: 'wants_draft', label: 'Wants a Draft' },
   { value: 'on_hold', label: 'Waiting' },
   { value: 'contacted', label: 'Reviewing Draft' },
   { value: 'call_back', label: 'Paid for Draft' },
   { value: 'completed' as LeadStatus, label: 'Completed (Client)' },
 ];
 
 const PotentialWorkPage = () => {
   const {
     leads,
     isLoading,
     updateStatus,
     updateNextAction,
     updateNotes,
     deleteLead,
     fetchActivities,
   } = useOutreach();
 
   const [searchQuery, setSearchQuery] = useState('');
   const [selectedLead, setSelectedLead] = useState<OutreachLead | null>(null);
   const [editingLead, setEditingLead] = useState<OutreachLead | null>(null);
   const [editNotes, setEditNotes] = useState('');
   const [editNextAction, setEditNextAction] = useState<NextActionType>('none');
   const [editNextActionDate, setEditNextActionDate] = useState<Date | undefined>();
 
   // Filter to only show interested leads (potential work)
   const potentialWorkLeads = useMemo(() => {
    // Filter by is_potential_work flag (set automatically when status becomes interested, wants_draft, etc.)
    let result = leads.filter((lead) => lead.is_potential_work);
     
     if (searchQuery) {
       const query = searchQuery.toLowerCase();
       result = result.filter(
         (lead) =>
           lead.business_name.toLowerCase().includes(query) ||
           lead.phone?.toLowerCase().includes(query)
       );
     }
     
     return result;
   }, [leads, searchQuery]);
 
   const openEditDialog = (lead: OutreachLead) => {
     setEditingLead(lead);
     setEditNotes(lead.notes || '');
     setEditNextAction(lead.next_action || 'none');
     setEditNextActionDate(lead.next_action_date ? new Date(lead.next_action_date) : undefined);
   };
 
   const handleSaveEdit = async () => {
     if (!editingLead) return;
     
     await updateNotes(editingLead.id, editNotes);
     await updateNextAction(
       editingLead.id,
       editNextAction,
       editNextActionDate ? format(editNextActionDate, 'yyyy-MM-dd') : undefined
     );
     setEditingLead(null);
   };
 
   const handleStatusChange = async (leadId: string, status: LeadStatus) => {
     await updateStatus(leadId, status);
   };
 
   const handleDelete = async (leadId: string) => {
     if (confirm('Are you sure you want to remove this lead?')) {
       await deleteLead(leadId);
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
           <Briefcase className="h-6 w-6" />
           Potential Work
         </h1>
         <p className="text-muted-foreground">
           Manage interested leads through your sales pipeline
         </p>
       </div>
 
       {/* Search & Stats */}
       <div className="flex items-center justify-between gap-4">
         <div className="relative max-w-md flex-1">
           <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
           <Input
             placeholder="Search by name or phone..."
             value={searchQuery}
             onChange={(e) => setSearchQuery(e.target.value)}
             className="pl-9"
           />
         </div>
         <div className="text-sm text-muted-foreground">
           {potentialWorkLeads.length} potential clients
         </div>
       </div>
 
       {/* Leads Table */}
       <Card className="bg-card/50 border-border/50">
         <CardContent className="p-0">
           <div className="overflow-x-auto">
             <Table>
               <TableHeader>
                 <TableRow className="border-border/50">
                   <TableHead className="w-[220px]">Business</TableHead>
                   <TableHead className="w-[130px]">Phone</TableHead>
                   <TableHead className="w-[140px]">Status</TableHead>
                   <TableHead className="w-[140px]">Next Action</TableHead>
                   <TableHead className="w-[200px]">Notes</TableHead>
                   <TableHead className="w-[120px]">Actions</TableHead>
                 </TableRow>
               </TableHeader>
               <TableBody>
                 {potentialWorkLeads.length === 0 ? (
                   <TableRow>
                     <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                       No potential work leads yet. Mark leads as "Interested" in the Archive to see them here.
                     </TableCell>
                   </TableRow>
                 ) : (
                   potentialWorkLeads.map((lead) => (
                     <TableRow
                       key={lead.id}
                       className="border-border/50 hover:bg-muted/30"
                     >
                       <TableCell>
                         <div className="flex flex-col">
                           <span className="font-medium truncate max-w-[200px]">
                             {lead.business_name}
                           </span>
                           {lead.address && (
                             <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                               {lead.address}
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
                         <Select
                           value={lead.status}
                           onValueChange={(v) => handleStatusChange(lead.id, v as LeadStatus)}
                         >
                           <SelectTrigger className="h-8 w-[130px]">
                             <SelectValue />
                           </SelectTrigger>
                           <SelectContent>
                             {POTENTIAL_WORK_STATUSES.map((opt) => (
                               <SelectItem key={opt.value} value={opt.value}>
                                 {opt.label}
                               </SelectItem>
                             ))}
                           </SelectContent>
                         </Select>
                       </TableCell>
                       <TableCell>
                         <div className="flex flex-col gap-1">
                           {lead.next_action && (
                             <NextActionBadge action={lead.next_action} />
                           )}
                           {lead.next_action_date && (
                             <span className="text-xs text-muted-foreground">
                               {format(new Date(lead.next_action_date), 'MMM d')}
                             </span>
                           )}
                         </div>
                       </TableCell>
                       <TableCell>
                         <span className="text-sm text-muted-foreground truncate max-w-[180px] block">
                           {lead.notes || '—'}
                         </span>
                       </TableCell>
                       <TableCell>
                         <div className="flex items-center gap-1">
                           <Button
                             variant="ghost"
                             size="icon"
                             className="h-8 w-8"
                             onClick={() => openEditDialog(lead)}
                           >
                             <FileText className="h-4 w-4" />
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
                           <Button
                             variant="ghost"
                             size="icon"
                             className="h-8 w-8 text-destructive hover:text-destructive"
                             onClick={() => handleDelete(lead.id)}
                           >
                             <Trash2 className="h-4 w-4" />
                           </Button>
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
 
       {/* Edit Dialog */}
       <Dialog open={!!editingLead} onOpenChange={(open) => !open && setEditingLead(null)}>
         <DialogContent className="sm:max-w-[500px]">
           <DialogHeader>
             <DialogTitle>Edit Lead: {editingLead?.business_name}</DialogTitle>
           </DialogHeader>
           <div className="space-y-4 py-4">
             <div className="space-y-2">
               <label className="text-sm font-medium">Notes</label>
               <Textarea
                 value={editNotes}
                 onChange={(e) => setEditNotes(e.target.value)}
                 placeholder="Add notes about this lead..."
                 rows={4}
               />
             </div>
             <div className="space-y-2">
               <label className="text-sm font-medium">Next Action</label>
               <Select
                 value={editNextAction}
                 onValueChange={(v) => setEditNextAction(v as NextActionType)}
               >
                 <SelectTrigger>
                   <SelectValue />
                 </SelectTrigger>
                 <SelectContent>
                   <SelectItem value="none">None</SelectItem>
                   <SelectItem value="call">Call</SelectItem>
                   <SelectItem value="follow_up">Follow Up</SelectItem>
                   <SelectItem value="send_draft">Send Draft</SelectItem>
                 </SelectContent>
               </Select>
             </div>
             <div className="space-y-2">
               <label className="text-sm font-medium">Action Date</label>
               <Popover>
                 <PopoverTrigger asChild>
                   <Button variant="outline" className="w-full justify-start text-left font-normal">
                     <CalendarIcon className="mr-2 h-4 w-4" />
                     {editNextActionDate ? format(editNextActionDate, 'PPP') : 'Pick a date'}
                   </Button>
                 </PopoverTrigger>
                 <PopoverContent className="w-auto p-0" align="start">
                   <Calendar
                     mode="single"
                     selected={editNextActionDate}
                     onSelect={setEditNextActionDate}
                     initialFocus
                   />
                 </PopoverContent>
               </Popover>
             </div>
           </div>
           <div className="flex justify-end gap-2">
             <Button variant="outline" onClick={() => setEditingLead(null)}>
               Cancel
             </Button>
             <Button onClick={handleSaveEdit}>Save Changes</Button>
           </div>
         </DialogContent>
       </Dialog>
     </div>
   );
 };
 
 export default PotentialWorkPage;