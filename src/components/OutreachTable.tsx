import { useState, useMemo, useEffect, useRef, useCallback, memo } from 'react';
import type { PhoneFetchStatus } from '@/hooks/useOutreach';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { 
  Phone, 
  ExternalLink, 
  Search,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  Trash2,
  Copy,
  CheckCheck,
  Star,
  RefreshCw,
  Loader2,
  MessageSquare,
  MessageCircle,
  Upload,
  Eye,
  PhoneOff,
  PhoneCall,
  X,
  Facebook,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatPhoneForWhatsApp } from '@/lib/leadUtils';
import { openFacebookSearch } from '@/lib/facebookSearch';
import { useOutreachAttempt } from '@/hooks/useOutreachAttempt';
import { useContactAction } from '@/hooks/useContactAction';
import { useDebouncedCallback } from 'use-debounce';
import { useToast } from '@/hooks/use-toast';
import { useCopiedPhones } from '@/hooks/useCopiedPhones';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { OutreachStatusBadge } from './OutreachStatusBadge';
import { WhatsAppStatusBadge } from './WhatsAppStatusBadge';
import { ContactMethodBadge } from './ContactMethodBadge';
import { PipelineStatusBadge } from './PipelineStatusBadge';
import { NextActionEditor } from './NextActionEditor';
import { CSVImportDialog } from './CSVImportDialog';
import { OutreachMobileCard } from './OutreachMobileCard';
import type { OutreachLead, LeadStatus, NextActionType, Country, ContactMethod, PipelineStatus } from '@/types/outreach';
import { STATUS_OPTIONS, NEXT_ACTION_OPTIONS, OUTREACH_STATUS_OPTIONS, CONTACT_METHOD_OPTIONS, PIPELINE_STATUS_OPTIONS } from '@/types/outreach';
import { SingleWhatsAppDialog } from '@/components/SingleWhatsAppDialog';
import { SingleSMSDialog } from '@/components/SingleSMSDialog';

interface OutreachTableProps {
  leads: OutreachLead[];
  onLeadClick: (lead: OutreachLead) => void;
  onStatusChange: (leadId: string, status: LeadStatus) => void;
  onContactMethodChange?: (leadId: string, method: ContactMethod) => void;
  onPipelineStatusChange?: (leadId: string, status: PipelineStatus) => void;
  onNextActionChange: (leadId: string, action: NextActionType, date?: string) => void;
  onRemoveAll: () => void;
  onArchive?: (leadId: string) => void;
  onArchiveSelected?: (leadIds: string[]) => void;
  onDelete?: (leadId: string) => void;
  onDeleteSelected?: (leadIds: string[]) => void;
  onBulkStatusChange?: (leadIds: string[], status: LeadStatus) => void;
  onMarkAsInterested?: (leadIds: string[]) => void;
  onRefreshLeads?: () => void;
  onImportLeads?: (leads: Array<Partial<OutreachLead>>) => Promise<void>;
  showArchiveButton?: boolean;
  isArchiveView?: boolean;
  /** When true, hides status and next action editing (for simplified Outreach CRM view) */
  readOnly?: boolean;
  phoneFetchStatus?: Record<string, PhoneFetchStatus>;
  onRetryPhoneFetch?: (leadId: string) => void;
  /** Called before a contact action. Return true to allow, false to block (show paywall). */
  onContactGated?: () => boolean;
}

const ITEMS_PER_PAGE_DESKTOP = 15;
const ITEMS_PER_PAGE_MOBILE = 10;

type SortField = 'business_name' | 'status' | 'next_action_date' | 'created_at';
type SortDirection = 'asc' | 'desc';

export function OutreachTable({ 
  leads, 
  onLeadClick, 
  onStatusChange,
  onContactMethodChange,
  onPipelineStatusChange,
  onNextActionChange, 
  onRemoveAll,
  onArchive,
  onArchiveSelected,
  onDelete,
  onDeleteSelected,
  onBulkStatusChange,
  onMarkAsInterested,
  onRefreshLeads,
  onImportLeads,
  showArchiveButton = true,
  isArchiveView = false,
  readOnly = false,
  phoneFetchStatus = {},
  onRetryPhoneFetch,
  onContactGated,
}: OutreachTableProps) {
  const { toast } = useToast();
  const { isPhoneCopied, markMultipleAsCopied } = useCopiedPhones();
  const isMobile = useIsMobile();
  const ITEMS_PER_PAGE = isMobile ? ITEMS_PER_PAGE_MOBILE : ITEMS_PER_PAGE_DESKTOP;
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<LeadStatus | 'all'>('all');
  const [countryFilter, setCountryFilter] = useState<Country | 'all'>('all');
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isRecoveringPhones, setIsRecoveringPhones] = useState(false);
  const [recoveryProgress, setRecoveryProgress] = useState<{ current: number; total: number } | null>(null);
  const { logAttempt } = useOutreachAttempt();
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [lastContactedLeadId, setLastContactedLeadId] = useState<string | null>(null);
  // Dialog state for WhatsApp/SMS template pages
  const [whatsappDialogLead, setWhatsappDialogLead] = useState<OutreachLead | null>(null);
  const [smsDialogLead, setSmsDialogLead] = useState<OutreachLead | null>(null);
  // Optimistic UI state: leadId -> partial overrides
  const [optimisticUpdates, setOptimisticUpdates] = useState<Map<string, Record<string, any>>>(new Map());
  // Track leads contacted during walkthrough (so highlight moves to next business)
  const [walkthroughContactedIds, setWalkthroughContactedIds] = useState<Set<string>>(new Set());

  // Reset walkthroughContactedIds when walkthrough is restarted (replay)
  useEffect(() => {
    const onReset = () => setWalkthroughContactedIds(new Set());
    window.addEventListener('start-walkthrough', onReset);
    return () => window.removeEventListener('start-walkthrough', onReset);
  }, []);

  // Contact action hook: immediate persist, no undo
  const { executeContact } = useContactAction({
    onUpdate: useCallback((leadId: string, updates: Record<string, any>) => {
      setOptimisticUpdates(prev => {
        const next = new Map(prev);
        next.set(leadId, { ...(prev.get(leadId) || {}), ...updates });
        return next;
      });
    }, []),
    onPersisted: useCallback((leadId: string, _channel: 'whatsapp' | 'sms' | 'call') => {
      // Keep optimistic updates (including status) until the leads prop syncs.
      // The useEffect below will clear them when leads catch up.
      // We no longer strip `status` here because leads aren't re-fetched after
      // logAttempt, which caused the status to revert to 'not_contacted'.
    }, []),
  });

  // Clear optimistic updates when the leads prop catches up with the persisted values
  useEffect(() => {
    if (optimisticUpdates.size === 0) return;
    setOptimisticUpdates(prev => {
      const next = new Map(prev);
      let changed = false;
      for (const [leadId, updates] of prev) {
        const lead = leads.find(l => l.id === leadId);
        // If lead now has the status we optimistically set, clear the override
        if (lead && updates.status && lead.status === updates.status) {
          next.delete(leadId);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [leads, optimisticUpdates]);

  // Keep a ref to current leads for use in callbacks
  const leadsRef = useRef(leads);
  useEffect(() => { leadsRef.current = leads; }, [leads]);

  // Debounced search handlers (200ms)
  const debouncedSearch = useDebouncedCallback((value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  }, 200);

  const debouncedLocation = useDebouncedCallback((value: string) => {
    setLocationFilter(value);
    setCurrentPage(1);
  }, 200);

  // When a new lead arrives, always bring the user back to page 1 so it's visible immediately.
  const prevNewestLeadIdRef = useRef<string | null>(null);

  const tableStateKey = user?.id
    ? `leadfinder_outreach_table_state:${user.id}`
    : 'leadfinder_outreach_table_state';
  
  const lastContactedKey = user?.id
    ? `leadfinder_last_contacted:${user.id}`
    : 'leadfinder_last_contacted';

  const highlightLead = (leadId: string) => {
    setLastContactedLeadId(leadId);
    try {
      sessionStorage.setItem(lastContactedKey, leadId);
      localStorage.setItem(lastContactedKey, leadId);
    } catch {
      // ignore
    }
  };

  const forcePage1Key = user?.id
    ? `leadfinder_outreach_force_page1:${user.id}`
    : 'leadfinder_outreach_force_page1';

  // Helper to read from sessionStorage with localStorage fallback
  const readStoredState = () => {
    try {
      // Try sessionStorage first
      let raw = sessionStorage.getItem(tableStateKey);
      // If sessionStorage is empty, try localStorage as fallback
      if (!raw) {
        raw = localStorage.getItem(tableStateKey);
      }
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  // Helper to write to both storages for redundancy
  const writeStoredState = (state: object) => {
    try {
      const json = JSON.stringify(state);
      sessionStorage.setItem(tableStateKey, json);
      localStorage.setItem(tableStateKey, json);
    } catch {
      // ignore quota errors
    }
  };

  // Restore table state after any reload (e.g. returning from WhatsApp)
  useEffect(() => {
    const parsed = readStoredState();
    if (!parsed) return;

    // If a lead was just added (from Find Leads), always reset to page 1 so it shows immediately.
    let shouldForcePage1 = false;
    try {
      shouldForcePage1 = !!(sessionStorage.getItem(forcePage1Key) || localStorage.getItem(forcePage1Key));
      if (shouldForcePage1) {
        sessionStorage.removeItem(forcePage1Key);
        localStorage.removeItem(forcePage1Key);
      }
    } catch {
      // ignore
    }

    if (typeof parsed.searchQuery === 'string') setSearchQuery(parsed.searchQuery);
    if (parsed.statusFilter) setStatusFilter(parsed.statusFilter);
    if (parsed.countryFilter) setCountryFilter(parsed.countryFilter);
    if (parsed.sortField) setSortField(parsed.sortField);
    if (parsed.sortDirection) setSortDirection(parsed.sortDirection);
    if (shouldForcePage1) {
      setCurrentPage(1);
    } else if (typeof parsed.currentPage === 'number' && parsed.currentPage > 0) {
      setCurrentPage(parsed.currentPage);
    }
    // Restore last contacted lead highlight
    try {
      const last = sessionStorage.getItem(lastContactedKey) || localStorage.getItem(lastContactedKey);
      if (last) setLastContactedLeadId(last);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableStateKey]);

  

  // Persist table state to both storages
  useEffect(() => {
    writeStoredState({
      searchQuery,
      statusFilter,
      countryFilter,
      sortField,
      sortDirection,
      currentPage,
    });
  }, [tableStateKey, searchQuery, statusFilter, countryFilter, sortField, sortDirection, currentPage]);

  // Apply optimistic updates to leads for rendering
  const leadsWithOptimistic = useMemo(() => {
    if (optimisticUpdates.size === 0) return leads;
    return leads.map(lead => {
      const updates = optimisticUpdates.get(lead.id);
      if (!updates) return lead;
      return { ...lead, ...updates };
    });
  }, [leads, optimisticUpdates]);

  // Handle WhatsApp button click - open template dialog + count walkthrough contact
  const handleWhatsAppClick = useCallback((lead: OutreachLead) => {
    if (onContactGated && !onContactGated()) return;
    if (lead.whatsapp_status === 'no') {
      toast({
        description: `${lead.business_name} not on WhatsApp. Try SMS or Call.`,
        duration: 3000,
      });
      return;
    }
    // Auto-fill contact method
    if (onContactMethodChange) onContactMethodChange(lead.id, 'whatsapp' as ContactMethod);
    // Treat opening contact panel as selecting this lead for next walkthrough step
    highlightLead(lead.id);
    // Always emit walkthrough contact event on click (replay-safe)
    window.dispatchEvent(new CustomEvent('demo-checklist-contact'));
    setWalkthroughContactedIds(prev => {
      if (prev.has(lead.id)) return prev;
      const next = new Set(prev);
      next.add(lead.id);
      return next;
    });
    setWhatsappDialogLead(lead);
  }, [toast, onContactMethodChange]);

  // Handle SMS button click - open template dialog + count walkthrough contact
  const handleSMSClick = useCallback((lead: OutreachLead) => {
    // Auto-fill contact method
    if (onContactMethodChange) onContactMethodChange(lead.id, 'sms' as ContactMethod);
    // Treat opening contact panel as selecting this lead for next walkthrough step
    highlightLead(lead.id);
    // Always emit walkthrough contact event on click (replay-safe)
    window.dispatchEvent(new CustomEvent('demo-checklist-contact'));
    setWalkthroughContactedIds(prev => {
      if (prev.has(lead.id)) return prev;
      const next = new Set(prev);
      next.add(lead.id);
      return next;
    });
    setSmsDialogLead(lead);
  }, [onContactMethodChange]);

  // Handle Call button click - direct open + count walkthrough contact
  const handleCallClick = useCallback((lead: OutreachLead) => {
    // Auto-fill contact method
    if (onContactMethodChange) onContactMethodChange(lead.id, 'call' as ContactMethod);
    // Always emit walkthrough contact event on click (replay-safe)
    window.dispatchEvent(new CustomEvent('demo-checklist-contact'));
    setWalkthroughContactedIds(prev => {
      if (prev.has(lead.id)) return prev;
      const next = new Set(prev);
      next.add(lead.id);
      return next;
    });
    // Call has no dialog panel, so mark panel as closed immediately
    window.dispatchEvent(new CustomEvent('demo-checklist-contact-panel-closed'));
    highlightLead(lead.id);
    executeContact(lead, 'call');
  }, [executeContact, onContactMethodChange]);

  // handleCallClick is defined below with walkthrough tracking

  // Called when user clicks "Open App" in WhatsApp/SMS dialog
  const handleDialogSent = useCallback((leadId: string, channel: 'whatsapp' | 'sms') => {
    const lead = leadsRef.current.find(l => l.id === leadId);
    if (!lead) return;
    highlightLead(lead.id);
    executeContact(lead, channel);
  }, [executeContact]);

  // Count leads missing phone numbers
  const leadsWithMissingPhones = useMemo(() => {
    return leads.filter(l => !l.phone);
  }, [leads]);

  // Recover missing phone numbers via edge function
  const handleRecoverPhones = async () => {
    if (leadsWithMissingPhones.length === 0) {
      toast({
        title: 'All phones available',
        description: 'All leads already have phone numbers.',
      });
      return;
    }

    setIsRecoveringPhones(true);
    setRecoveryProgress({ current: 0, total: leadsWithMissingPhones.length });
    
    const batchSize = 50;
    let totalUpdated = 0;
    let totalProcessed = 0;

    try {
      // Process in batches of 50
      for (let i = 0; i < leadsWithMissingPhones.length; i += batchSize) {
        const batch = leadsWithMissingPhones.slice(i, i + batchSize);
        const leadIds = batch.map(l => l.id);

        const { data, error } = await supabase.functions.invoke('lookup-phones', {
          body: { leadIds },
        });

        if (error) {
          console.error('Phone lookup error:', error);
          toast({
            title: 'Recovery error',
            description: error.message || 'Failed to recover phone numbers.',
            variant: 'destructive',
          });
          break;
        }

        totalUpdated += data?.updated || 0;
        totalProcessed += batch.length;
        setRecoveryProgress({ current: totalProcessed, total: leadsWithMissingPhones.length });

        // Small delay between batches to avoid rate limits
        if (i + batchSize < leadsWithMissingPhones.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // Phone recovery complete — no toast

      // Refresh leads to show updated data
      if (onRefreshLeads) {
        onRefreshLeads();
      }
    } catch (err) {
      console.error('Phone recovery error:', err);
      toast({
        title: 'Recovery failed',
        description: 'An error occurred while recovering phone numbers.',
        variant: 'destructive',
      });
    } finally {
      setIsRecoveringPhones(false);
      setRecoveryProgress(null);
    }
  };

  // Selection handlers
  const handleSelectAll = () => {
    if (selectedIds.size === filteredAndSortedLeads.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAndSortedLeads.map(l => l.id)));
    }
  };

  const handleSelectOne = useCallback((leadId: string, checked: boolean) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(leadId);
      } else {
        newSet.delete(leadId);
      }
      return newSet;
    });
  }, []);

  // Copy selected phones in bulk format: "447477932564, 447477932565"
  const copySelectedPhones = async () => {
    const leadsWithPhones = filteredAndSortedLeads
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
    
    // Mark all as copied in backend
    const leadIds = leadsWithPhones.map(l => l.id);
    await markMultipleAsCopied(leadIds);
    
    // Copied — no toast
  };

  // Mark selected leads as contacted
  const handleMarkAsContacted = () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    // Update each lead's status to 'contacted'
    ids.forEach(id => onStatusChange(id, 'contacted'));
    setSelectedIds(new Set());
    // Status updated — no toast
  };

  // Mark selected leads as interested
  const handleMarkAsInterested = () => {
    if (selectedIds.size === 0 || !onMarkAsInterested) return;
    const ids = Array.from(selectedIds);
    onMarkAsInterested(ids);
    setSelectedIds(new Set());
  };

  // Archive selected leads
  const handleArchiveSelected = () => {
    if (selectedIds.size === 0) return;
    if (onArchiveSelected) {
      onArchiveSelected(Array.from(selectedIds));
      setSelectedIds(new Set());
    }
  };

  // Delete selected leads
  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    if (onDeleteSelected) {
      onDeleteSelected(Array.from(selectedIds));
      setSelectedIds(new Set());
    }
  };

  const exportToCsv = (mode: 'crm' | 'import' = 'crm') => {
    const leadsToExport = selectedIds.size > 0 
      ? filteredAndSortedLeads.filter(l => selectedIds.has(l.id))
      : filteredAndSortedLeads;
      
    if (leadsToExport.length === 0) {
      toast({
        title: 'No leads to export',
        description: selectedIds.size > 0 
          ? 'No leads selected for export.'
          : 'There are no leads matching your current filters.',
        variant: 'destructive',
      });
      return;
    }

    // Standard CSV escape: only quote if cell contains comma, quote, CR, or LF
    const csvEscape = (value: string): string => {
      if (/[",\r\n]/.test(value)) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    };

    const normalizeDate = (dateStr: string | null): string => {
      if (!dateStr) return '';
      return dateStr.split('T')[0];
    };

    const buildCsv = (headers: string[], rows: Array<Array<string | number | null | undefined>>) => {
      return [headers, ...rows]
        .map((row) => row.map((cell) => csvEscape(String(cell ?? ''))).join(','))
        .join('\r\n');
    };

    const crmHeaders = [
      'businessName',
      'contactPerson',
      'phone',
      'email',
      'googleMapsUrl',
      'notes',
      'status',
      'nextAction',
      'nextActionDate',
      'country',
      'address',
      'category',
    ];

    const crmRows = leadsToExport.map((lead) => [
      lead.business_name,
      '', // contactPerson - not stored in this app
      lead.phone || '',
      lead.email || '',
      lead.google_maps_url || '',
      lead.notes || '',
      lead.status,
      lead.next_action || '',
      normalizeDate(lead.next_action_date),
      lead.country || '',
      lead.address || '',
      lead.category || '',
    ]);

    // Other app importer (per its UI): requires businessName, optionally accepts only these columns
    const importHeaders = ['businessName', 'contactPerson', 'phone', 'email', 'googleMapsUrl', 'notes'];
    const importRows = leadsToExport.map((lead) => [
      lead.business_name,
      '',
      lead.phone || '',
      lead.email || '',
      lead.google_maps_url || '',
      lead.notes || '',
    ]);

    const csvContent = mode === 'import' ? buildCsv(importHeaders, importRows) : buildCsv(crmHeaders, crmRows);

    try {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download =
        mode === 'import'
          ? `import-businesses-${new Date().toISOString().split('T')[0]}.csv`
          : `outreach-leads-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      // Export complete — no toast
    } catch (err) {
      console.error('CSV export failed:', err);
      toast({
        title: 'Export failed',
        description: 'Failed to export leads to CSV. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const filteredAndSortedLeads = useMemo(() => {
    let result = [...leadsWithOptimistic];

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      // Normalize query for phone search (remove spaces and non-digits)
      const normalizedQuery = query.replace(/\s+/g, '');
      const isPhoneSearch = /^\d+$/.test(normalizedQuery);
      
      result = result.filter((lead) => {
        // Check business name and address normally
        if (lead.business_name.toLowerCase().includes(query)) return true;
        if (lead.address?.toLowerCase().includes(query)) return true;
        
        // For phone, normalize by removing spaces for comparison
        if (lead.phone) {
          const normalizedPhone = lead.phone.replace(/\s+/g, '').toLowerCase();
          // If user typed only digits, compare normalized versions
          if (isPhoneSearch) {
            return normalizedPhone.includes(normalizedQuery);
          }
          // Otherwise do normal search
          return normalizedPhone.includes(query.replace(/\s+/g, ''));
        }
        
        return false;
      });
    }

    // Filter by location
    if (locationFilter.trim()) {
      const tokens = locationFilter.trim().toLowerCase().replace(/\s+/g, ' ').split(' ');
      result = result.filter((lead) => {
        const haystack = `${lead.address || ''} ${lead.country || ''}`.toLowerCase();
        return tokens.every(token => haystack.includes(token));
      });
    }

    // Filter by status
    if (statusFilter !== 'all') {
      result = result.filter((lead) => lead.status === statusFilter);
    }

    // Filter by country
    if (countryFilter !== 'all') {
      result = result.filter((lead) => lead.country === countryFilter);
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'business_name':
          comparison = a.business_name.localeCompare(b.business_name);
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        case 'next_action_date':
          const dateA = a.next_action_date ? new Date(a.next_action_date).getTime() : Infinity;
          const dateB = b.next_action_date ? new Date(b.next_action_date).getTime() : Infinity;
          comparison = dateA - dateB;
          break;
        case 'created_at':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [leadsWithOptimistic, searchQuery, locationFilter, statusFilter, countryFilter, sortField, sortDirection]);

  const newestLeadId = useMemo(() => {
    if (leads.length === 0) return null;
    let newest = leads[0];
    for (let i = 1; i < leads.length; i++) {
      const candidate = leads[i];
      if (new Date(candidate.created_at).getTime() > new Date(newest.created_at).getTime()) {
        newest = candidate;
      }
    }
    return newest.id;
  }, [leads]);

  useEffect(() => {
    if (!newestLeadId) return;
    const prev = prevNewestLeadIdRef.current;

    // Only jump when the newest lead actually changed (i.e. a new lead was inserted).
    if (prev && prev !== newestLeadId) {
      setCurrentPage(1);
    }

    prevNewestLeadIdRef.current = newestLeadId;
  }, [newestLeadId]);

  const totalPages = Math.ceil(filteredAndSortedLeads.length / ITEMS_PER_PAGE);

  // If restoring state lands on a page that no longer exists (after filters/search), clamp it.
  useEffect(() => {
    const safeTotal = totalPages || 1;
    if (currentPage > safeTotal) setCurrentPage(safeTotal);
  }, [currentPage, totalPages]);

  const paginatedLeads = filteredAndSortedLeads.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Always point walkthrough Step 5 to a visible, actionable track button
  const walkthroughTrackLeadId = (
    paginatedLeads.find(l => l.id === lastContactedLeadId && !l.is_potential_work)?.id
    || paginatedLeads.find(l => !l.is_potential_work)?.id
    || null
  );

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const SortButton = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <Button
      variant="ghost"
      size="sm"
      className="h-auto p-0 hover:bg-transparent font-medium"
      onClick={() => handleSort(field)}
    >
      {children}
      <ArrowUpDown className="ml-1 h-3 w-3" />
    </Button>
  );

  // Count overdue items
  const overdueCount = leads.filter(
    (l) => l.next_action_date && new Date(l.next_action_date) < new Date(new Date().setHours(0, 0, 0, 0))
  ).length;

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="border-b border-border/50 px-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:gap-4">
          {/* Title row */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <ClipboardList className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            <CardTitle className="text-base sm:text-lg">
              {isArchiveView ? 'Archived' : 'Outreach'}
              <span className="ml-1.5 sm:ml-2 text-xs sm:text-sm font-normal text-muted-foreground">
                ({leads.length})
              </span>
              {selectedIds.size > 0 && (
                <span className="ml-1.5 sm:ml-2 text-xs sm:text-sm font-normal text-primary">
                  {selectedIds.size} sel
                </span>
              )}
              {!isArchiveView && overdueCount > 0 && (
                <span className="ml-1.5 sm:ml-2 text-xs sm:text-sm font-normal text-destructive">
                  {overdueCount} due
                </span>
              )}
            </CardTitle>
          </div>
          
          {/* Actions row */}
          <div className="flex flex-wrap gap-2">
            {selectedIds.size > 0 && (
              <>
                <Button
                  variant="default"
                  size="sm"
                  onClick={copySelectedPhones}
                  className="bg-primary text-xs h-8"
                >
                  <Copy className="h-3.5 w-3.5 mr-1.5" />
                  Copy Numbers ({selectedIds.size})
                </Button>
                {!readOnly && (
                  <>
                    {/* Bulk Status Dropdown */}
                    <Select
                      onValueChange={(v) => {
                        const ids = Array.from(selectedIds);
                        ids.forEach(id => onStatusChange(id, v as LeadStatus));
                        // Auto-track when setting to interested
                        if (v === 'interested' && onMarkAsInterested) {
                          const untracked = ids.filter(id => !leads.find(l => l.id === id)?.is_potential_work);
                          if (untracked.length > 0) onMarkAsInterested(untracked);
                        }
                        setSelectedIds(new Set());
                        // Status updated — no toast
                      }}
                    >
                      <SelectTrigger className="w-[130px] h-8 text-xs bg-background">
                        <SelectValue placeholder="Set Status..." />
                      </SelectTrigger>
                      <SelectContent>
                        {OUTREACH_STATUS_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Bulk Next Action Dropdown */}
                    <Select
                      onValueChange={(v) => {
                        const ids = Array.from(selectedIds);
                        ids.forEach(id => onNextActionChange(id, v as NextActionType));
                        setSelectedIds(new Set());
                        // Next action updated — no toast
                      }}
                    >
                      <SelectTrigger className="w-[140px] h-8 text-xs bg-background">
                        <SelectValue placeholder="Set Action..." />
                      </SelectTrigger>
                      <SelectContent>
                        {NEXT_ACTION_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {onMarkAsInterested && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={handleMarkAsInterested}
                        className="text-xs h-8"
                      >
                        <Star className="h-3.5 w-3.5 mr-1.5" />
                        Track
                      </Button>
                    )}
                  </>
                )}
                {onDeleteSelected && !readOnly && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDeleteSelected}
                    className="bg-background text-xs h-8 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Remove
                  </Button>
                )}
              </>
            )}
            {/* WhatsApp button - only show for single selection */}
            {selectedIds.size === 1 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const selectedLead = filteredAndSortedLeads.find(l => selectedIds.has(l.id));
                  if (selectedLead) {
                    handleWhatsAppClick(selectedLead);
                  }
                }}
                className="bg-background text-xs h-8"
              >
                <MessageSquare className="h-3.5 w-3.5 mr-1.5 text-green-500" />
                WhatsApp
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportToCsv('crm')}
              className="bg-background text-xs h-8"
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              <span className="hidden sm:inline">Export </span>CSV
            </Button>
            {/* Import button */}
            {!readOnly && onImportLeads && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowImportDialog(true)}
                className="bg-background text-xs h-8"
              >
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                <span className="hidden sm:inline">Import</span>
              </Button>
            )}
          </div>
          
          {/* Filters row */}
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[120px] max-w-[180px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search..."
                defaultValue={searchQuery}
                onChange={(e) => {
                  debouncedSearch(e.target.value);
                }}
                className="pl-8 h-8 text-xs bg-background"
              />
            </div>
            <div className="relative flex-1 min-w-[120px] max-w-[200px]">
              <Input
                placeholder="City, postcode, area..."
                defaultValue={locationFilter}
                onChange={(e) => {
                  debouncedLocation(e.target.value);
                }}
                className="h-8 text-xs bg-background pr-7"
              />
              {locationFilter && (
                <button
                  onClick={() => { setLocationFilter(''); setCurrentPage(1); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v as LeadStatus | 'all');
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-[120px] sm:w-[140px] bg-background h-8 text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {OUTREACH_STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={countryFilter}
              onValueChange={(v) => {
                setCountryFilter(v as Country | 'all');
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-[90px] sm:w-[100px] bg-background h-8 text-xs">
                <SelectValue placeholder="Country" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="UK">🇬🇧 UK</SelectItem>
                <SelectItem value="AUS">🇦🇺 AUS</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {/* Mobile Card View */}
        {isMobile ? (
          <div>
            {paginatedLeads.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {leads.length === 0
                  ? isArchiveView 
                    ? 'No archived leads yet.'
                    : 'No leads yet. Add from search.'
                  : 'No leads match filters.'}
              </div>
            ) : (
              paginatedLeads.map((lead) => (
                <OutreachMobileCard
                  key={lead.id}
                  lead={lead}
                  isSelected={selectedIds.has(lead.id)}
                  onSelect={(checked) => handleSelectOne(lead.id, checked as boolean)}
                  onLeadClick={() => onLeadClick(lead)}
                  onStatusChange={(status) => onStatusChange(lead.id, status)}
                  onNextActionChange={(action, date) => onNextActionChange(lead.id, action, date)}
                  onContactMethodChange={onContactMethodChange ? (method) => onContactMethodChange(lead.id, method) : undefined}
                onPipelineStatusChange={onPipelineStatusChange ? (status) => {
                    // Clear optimistic override so manual change isn't blocked
                    setOptimisticUpdates(prev => { const next = new Map(prev); next.delete(lead.id); return next; });
                    onPipelineStatusChange(lead.id, status);
                  } : undefined}
                  onWhatsAppClick={() => handleWhatsAppClick(lead)}
                  onSMSClick={() => handleSMSClick(lead)}
                  onCallClick={() => handleCallClick(lead)}
                  onTrack={onMarkAsInterested ? () => onMarkAsInterested([lead.id]) : undefined}
                  onAutoTrack={onMarkAsInterested ? () => onMarkAsInterested([lead.id]) : undefined}
                  readOnly={readOnly}
                  showTrackButton={!!onMarkAsInterested}
                  isHighlighted={lastContactedLeadId === lead.id}
                  isLastContacted={lastContactedLeadId === lead.id || walkthroughTrackLeadId === lead.id}
                  onCompleteAction={() => onNextActionChange(lead.id, 'none' as NextActionType)}
                  phoneFetchStatus={phoneFetchStatus[lead.id]}
                  onRetryPhoneFetch={() => onRetryPhoneFetch?.(lead.id)}
                  isWalkthroughContacted={walkthroughContactedIds.has(lead.id)}
                />
              ))
            )}
          </div>
        ) : (
          /* Desktop Table View */
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="w-[40px] sm:w-[50px]">
                    <Checkbox
                      checked={selectedIds.size === filteredAndSortedLeads.length && filteredAndSortedLeads.length > 0}
                      onCheckedChange={handleSelectAll}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead className="min-w-[150px] sm:w-[250px]">
                    <SortButton field="business_name">Business</SortButton>
                  </TableHead>
                  <TableHead className="min-w-[120px] sm:w-[150px]">Phone</TableHead>
                  {!readOnly && (
                    <>
                      <TableHead className="min-w-[100px] sm:w-[120px]">Contact</TableHead>
                      <TableHead className="min-w-[100px] sm:w-[140px]">
                        <SortButton field="status">Status</SortButton>
                      </TableHead>
                      <TableHead className="min-w-[140px] sm:w-[180px]">
                        <SortButton field="next_action_date">Next Action</SortButton>
                      </TableHead>
                    </>
                  )}
                  <TableHead className="w-[160px] text-center">Actions</TableHead>
                  {!readOnly && onMarkAsInterested && (
                    <TableHead className="w-[80px] text-center">Track</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedLeads.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={readOnly ? 4 : (onMarkAsInterested ? 8 : 7)} className="text-center py-6 sm:py-8 text-muted-foreground text-sm">
                      {leads.length === 0
                        ? isArchiveView 
                          ? 'No archived leads yet.'
                          : 'No leads yet. Add from search.'
                        : 'No leads match filters.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedLeads.map((lead) => (
                    <TableRow
                      key={lead.id}
                      className={`border-border/50 cursor-pointer hover:bg-muted/30 ${
                        lead.is_potential_work ? 'bg-primary/5' : ''
                      } ${lastContactedLeadId === lead.id ? 'ring-1 ring-primary/30 ring-inset bg-primary/5' : ''}`}
                      onClick={() => onLeadClick(lead)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(lead.id)}
                          onCheckedChange={(checked) => handleSelectOne(lead.id, checked as boolean)}
                          aria-label={`Select ${lead.business_name}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {lead.country === 'Australia' && (
                            <span className="text-xs" title="Australia">🇦🇺</span>
                          )}
                          <span className="truncate max-w-[200px]">{lead.business_name}</span>
                          {lead.is_potential_work && (
                            <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500 flex-shrink-0" />
                          )}
                          <WhatsAppStatusBadge status={lead.whatsapp_status} />
                        </div>
                      </TableCell>
                      <TableCell>
                        {lead.phone ? (
                          <div className="flex items-center gap-1.5">
                            <a
                              href={`tel:${lead.phone}`}
                              className="text-primary hover:underline flex items-center gap-1.5 text-sm"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                              <span className="font-mono">{lead.phone}</span>
                            </a>
                            {isPhoneCopied(lead.id) && (
                              <span title="Copied">
                                <CheckCheck className="h-3.5 w-3.5 text-primary" />
                              </span>
                            )}
                          </div>
                        ) : phoneFetchStatus[lead.id] === 'failed' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); onRetryPhoneFetch?.(lead.id); }}
                          >
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Retry
                          </Button>
                        ) : phoneFetchStatus[lead.id] === 'no_phone' ? (
                          <span className="text-muted-foreground text-xs">No phone listed</span>
                        ) : phoneFetchStatus[lead.id] === 'pending' ? (
                          <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            <span>Fetching…</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">No phone listed</span>
                        )}
                      </TableCell>
                      {!readOnly && (
                        <>
                          {/* Contact Method column */}
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            {onContactMethodChange ? (
                              <Select
                                value={lead.contact_method || ''}
                                onValueChange={(v) => {
                                  onContactMethodChange(lead.id, v as ContactMethod);
                                }}
                              >
                                <SelectTrigger className="w-auto h-auto p-0 border-0 bg-transparent focus:ring-0" {...(lastContactedLeadId === lead.id ? { 'data-walkthrough-step': 'contact-method', 'data-walkthrough': 'contact-method' } : {})}>
                                  <ContactMethodBadge method={lead.contact_method as ContactMethod} />
                                </SelectTrigger>
                                <SelectContent>
                                  {CONTACT_METHOD_OPTIONS.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <ContactMethodBadge method={lead.contact_method as ContactMethod} />
                            )}
                          </TableCell>
                          {/* Pipeline Status column */}
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            {onPipelineStatusChange ? (
                              <Select
                                value={lead.status}
                                onValueChange={(v) => {
                                  const status = v as PipelineStatus;
                                  // Clear optimistic override so manual change isn't blocked
                                  setOptimisticUpdates(prev => { const next = new Map(prev); next.delete(lead.id); return next; });
                                  onPipelineStatusChange(lead.id, status);
                                  if (status === 'interested' && onMarkAsInterested && !lead.is_potential_work) {
                                    onMarkAsInterested([lead.id]);
                                  }
                                }}
                              >
                                <SelectTrigger className="w-auto h-auto p-0 border-0 bg-transparent focus:ring-0" {...(lastContactedLeadId === lead.id ? { 'data-walkthrough-step': 'pipeline-status', 'data-walkthrough': 'pipeline-status' } : {})}>
                                  <PipelineStatusBadge status={lead.status as PipelineStatus} />
                                </SelectTrigger>
                                <SelectContent>
                                  {PIPELINE_STATUS_OPTIONS.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <PipelineStatusBadge status={lead.status as PipelineStatus} />
                            )}
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <NextActionEditor
                              action={lead.next_action}
                              date={lead.next_action_date}
                              onUpdate={(action, date) => onNextActionChange(lead.id, action, date)}
                              leadId={lead.id}
                            />
                          </TableCell>
                        </>
                      )}
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1.5">
                          {(lead.google_maps_url || ((lead as any).place_id ? `https://www.google.com/maps/place/?q=place_id:${(lead as any).place_id}` : null)) && (
                            <a
                              href={lead.google_maps_url || `https://www.google.com/maps/place/?q=place_id:${(lead as any).place_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-md hover:bg-blue-500/10 text-blue-500 hover:text-blue-400 transition-colors"
                              title="View on Google Maps"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                          <button
                            className="p-1.5 rounded-md hover:bg-blue-500/10 text-blue-600 hover:text-blue-500 transition-colors"
                            title="Search Facebook"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (onContactMethodChange) onContactMethodChange(lead.id, 'facebook_msg' as any);
                              openFacebookSearch(lead.business_name);
                            }}
                          >
                            <Facebook className="h-4 w-4" />
                          </button>
                          {lead.phone ? (
                            <>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    className="p-1.5 rounded-md hover:bg-amber-500/10 text-amber-500 hover:text-amber-400 transition-colors"
                                    title="Call options"
                                  >
                                    <Phone className="h-4 w-4" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="center" className="min-w-[160px]">
                                  <DropdownMenuItem asChild>
                                    <a href={`tel:${lead.phone}`} className="flex items-center gap-2 cursor-pointer" onClick={() => handleCallClick(lead)}>
                                      <PhoneCall className="h-4 w-4" />
                                      Normal Call
                                    </a>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem asChild>
                                    <a
                                      href={`https://wa.me/${formatPhoneForWhatsApp(lead.phone)}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-2 cursor-pointer"
                                      onClick={() => handleCallClick(lead)}
                                    >
                                      <Phone className="h-4 w-4 text-green-500" />
                                      WhatsApp Call
                                    </a>
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                              <div className="flex items-center gap-0.5" data-walkthrough={lead.outreach_attempts === 0 && !walkthroughContactedIds.has(lead.id) ? 'contact' : undefined}>
                                <button
                                  onClick={() => { window.dispatchEvent(new CustomEvent('outreach-first-contact-click', { detail: { method: 'sms' } })); handleSMSClick(lead); }}
                                  className="p-1.5 rounded-md hover:bg-blue-500/10 text-blue-400 hover:text-blue-300 transition-colors"
                                  title="Send SMS"
                                >
                                  <MessageCircle className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => { window.dispatchEvent(new CustomEvent('outreach-first-contact-click', { detail: { method: 'whatsapp' } })); handleWhatsAppClick(lead); }}
                                  className="p-1.5 rounded-md hover:bg-green-500/10 text-green-500 hover:text-green-400 transition-colors"
                                  title="Send WhatsApp message"
                                >
                                  <MessageSquare className="h-4 w-4" />
                                </button>
                              </div>
                            </>
                          ) : phoneFetchStatus[lead.id] === 'pending' ? (
                            <span className="text-muted-foreground text-xs flex items-center gap-1">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            </span>
                          ) : phoneFetchStatus[lead.id] === 'failed' ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                              onClick={(e) => { e.stopPropagation(); onRetryPhoneFetch?.(lead.id); }}
                            >
                              <RefreshCw className="h-3 w-3 mr-1" />
                              Retry
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                      {!readOnly && onMarkAsInterested && (
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-center">
                            {lead.is_potential_work ? (
                              <span className="text-xs text-yellow-500 font-medium">Tracked</span>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs hover:bg-primary/10 hover:text-primary"
                                onClick={() => onMarkAsInterested([lead.id])}
                                {...(walkthroughTrackLeadId === lead.id ? { 'data-walkthrough-step': 'track-star', 'data-walkthrough': 'track' } : {})}
                              >
                                <Star className="h-3.5 w-3.5 mr-1" />
                                Track
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border/50 flex-wrap gap-2">
            <p className="text-sm text-muted-foreground">
              Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{' '}
              {Math.min(currentPage * ITEMS_PER_PAGE, filteredAndSortedLeads.length)} of{' '}
              {filteredAndSortedLeads.length}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => p - 1)}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              {/* Page selector dropdown */}
              <Select
                value={String(currentPage)}
                onValueChange={(v) => setCurrentPage(Number(v))}
              >
                <SelectTrigger className="w-[80px] h-8 text-xs bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[200px] bg-background">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <SelectItem key={page} value={String(page)}>
                      Page {page}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">of {totalPages}</span>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => p + 1)}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>


      {/* CSV Import Dialog */}
      {onImportLeads && (
        <CSVImportDialog
          open={showImportDialog}
          onOpenChange={setShowImportDialog}
          onImport={onImportLeads}
          existingLeads={leads}
        />
      )}

      {/* WhatsApp Template Dialog */}
      <SingleWhatsAppDialog
        open={!!whatsappDialogLead}
        onOpenChange={(open) => {
          if (!open) {
            setWhatsappDialogLead(null);
            window.dispatchEvent(new CustomEvent('demo-checklist-contact-panel-closed'));
          }
        }}
        lead={whatsappDialogLead}
        onSent={handleDialogSent}
      />

      {/* SMS Template Dialog */}
      <SingleSMSDialog
        open={!!smsDialogLead}
        onOpenChange={(open) => {
          if (!open) {
            setSmsDialogLead(null);
            window.dispatchEvent(new CustomEvent('demo-checklist-contact-panel-closed'));
          }
        }}
        lead={smsDialogLead}
        onSent={handleDialogSent}
      />
    </Card>
  );
}
