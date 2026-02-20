import { useState, useMemo, useCallback } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from './StatusBadge';
import {
  MapPin,
  Download,
  Filter,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Check,
  Eye,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { Lead, WebsiteStatus } from '@/types/lead';

const ITEMS_PER_PAGE = 25;

interface LeadsTableProps {
  leads: Lead[];
  onExport: () => void;
  onAddToOutreach?: (lead: Lead) => Promise<any>;
  isInOutreach?: (leadName: string, googleMapsUrl?: string) => boolean;
  onMapLinkClick?: (businessName: string, googleMapsUrl?: string) => void;
  isChecked?: (businessName: string, googleMapsUrl?: string) => boolean;
}

export function LeadsTable({ leads, onExport, onAddToOutreach, isInOutreach, onMapLinkClick, isChecked }: LeadsTableProps) {
  const handleAddToOutreach = useCallback((lead: Lead) => {
    return onAddToOutreach?.(lead);
  }, [onAddToOutreach]);

  const checkIsInOutreach = useCallback((name: string, url?: string) => {
    return isInOutreach?.(name, url) ?? false;
  }, [isInOutreach]);

  const [statusFilters, setStatusFilters] = useState<WebsiteStatus[]>([
    'NO_WEBSITE', 'DIRECTORY_ONLY', 'HAS_OWN_WEBSITE', 'UNCERTAIN',
  ]);
  const [currentPage, setCurrentPage] = useState(1);

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => statusFilters.includes(lead.websiteStatus));
  }, [leads, statusFilters]);

  // Reset page on filter/data change
  useMemo(() => { setCurrentPage(1); }, [statusFilters, leads]);

  const totalPages = Math.ceil(filteredLeads.length / ITEMS_PER_PAGE);
  const paginatedLeads = filteredLeads.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  const noWebsiteCount = leads.filter((l) => l.websiteStatus === 'NO_WEBSITE').length;

  const toggleFilter = useCallback((status: WebsiteStatus, checked: boolean) => {
    setStatusFilters(prev => checked ? [...prev, status] : prev.filter(s => s !== status));
  }, []);

  const StatusFilterMenu = ({ align = 'start' as 'start' | 'end' }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="border-border">
          <Filter className="h-3.5 w-3.5 mr-1.5" />Filter
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="bg-popover border-border">
        {(['NO_WEBSITE', 'DIRECTORY_ONLY', 'HAS_OWN_WEBSITE', 'UNCERTAIN'] as WebsiteStatus[]).map((status) => (
          <DropdownMenuCheckboxItem
            key={status}
            checked={statusFilters.includes(status)}
            onCheckedChange={(checked) => toggleFilter(status, !!checked)}
          >
            <StatusBadge status={status} />
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const MapsButton = ({ lead }: { lead: Lead }) => {
    const checked = isChecked?.(lead.name, lead.googleMapsUrl);
    return (
      <Button
        variant="ghost"
        size="icon"
        className={`h-8 w-8 ${checked ? 'text-muted-foreground/50 bg-muted/30' : 'hover:bg-muted'}`}
        asChild
      >
        <a
          href={lead.googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onMapLinkClick?.(lead.name, lead.googleMapsUrl)}
        >
          {checked ? <Eye className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5 text-primary" />}
        </a>
      </Button>
    );
  };

  const CrmButton = ({ lead }: { lead: Lead }) => {
    if (!onAddToOutreach) return null;
    const inOutreach = checkIsInOutreach(lead.name, lead.googleMapsUrl);
    return inOutreach ? (
      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground/50 bg-muted/30" disabled>
        <Check className="h-3.5 w-3.5" />
      </Button>
    ) : (
      <Button
        variant="default"
        size="icon"
        className="h-8 w-8 bg-primary hover:bg-primary/90"
        onClick={() => handleAddToOutreach(lead)}
      >
        <ClipboardList className="h-3.5 w-3.5" />
      </Button>
    );
  };

  return (
    <Card className="border-border/50 bg-card shadow-sm">
      <CardHeader className="pb-3 md:pb-4">
        {/* Mobile Header */}
        <div className="md:hidden space-y-3">
          <div>
            <CardTitle className="text-lg font-semibold">Search Results</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {leads.length} found • <span className="text-status-hot font-medium">{noWebsiteCount} hot leads</span>
              <span className="text-muted-foreground/70 ml-1">— Tap 📋 to add to CRM</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusFilterMenu />
            <Button onClick={onExport} size="sm" className="h-8 px-2.5 text-xs bg-primary hover:bg-primary/90 text-primary-foreground">
              <Download className="h-3.5 w-3.5 mr-1.5" />Export
            </Button>
          </div>
        </div>

        {/* Desktop Header */}
        <div className="hidden md:flex md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-xl font-semibold">Search Results</CardTitle>
            <p className="text-sm text-muted-foreground">
              Found {leads.length} businesses •
              <span className="text-status-hot font-semibold ml-1">{noWebsiteCount} without websites</span>
              <span className="text-muted-foreground/70 ml-2">— Click 📋 to add to CRM</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusFilterMenu align="end" />
            <Button onClick={onExport} className="bg-primary hover:bg-primary/90 text-primary-foreground">
              <Download className="mr-2 h-4 w-4" />Export CSV
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-3 md:p-6">
        {/* Mobile View */}
        <div className="md:hidden space-y-1.5">
          {paginatedLeads.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">No leads match your current filters.</div>
          ) : paginatedLeads.map((lead, i) => (
            <div
              key={lead.id}
              className="flex items-center justify-between py-2.5 px-3 rounded-md border border-border bg-background/80 animate-fade-in"
              style={{ animationDelay: `${i * 15}ms` }}
            >
              <div className="flex-1 min-w-0 mr-2">
                <p className="font-medium text-sm truncate leading-tight">{lead.name}</p>
                <div className="mt-1"><StatusBadge status={lead.websiteStatus} compact /></div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <MapsButton lead={lead} />
                <CrmButton lead={lead} />
              </div>
            </div>
          ))}
        </div>

        {/* Desktop View */}
        <div className="hidden md:block rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="w-[40%]">Business Name</TableHead>
                <TableHead className="w-[25%]">Website Status</TableHead>
                <TableHead className="w-[20%]">Google Maps</TableHead>
                <TableHead className="w-[15%]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedLeads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                    No leads match your current filters.
                  </TableCell>
                </TableRow>
              ) : paginatedLeads.map((lead, i) => (
                <TableRow
                  key={lead.id}
                  className="border-border hover:bg-muted/30 animate-fade-in"
                  style={{ animationDelay: `${i * 20}ms` }}
                >
                  <TableCell className="font-medium">
                    <span className="truncate block">{lead.name}</span>
                  </TableCell>
                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div><StatusBadge status={lead.websiteStatus} /></div>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-[300px] bg-popover border-border">
                        <p className="text-sm">{lead.reason}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={isChecked?.(lead.name, lead.googleMapsUrl) ? 'text-muted-foreground/50 bg-muted/30' : 'hover:bg-muted'}
                          asChild
                        >
                          <a
                            href={lead.googleMapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => onMapLinkClick?.(lead.name, lead.googleMapsUrl)}
                          >
                            {isChecked?.(lead.name, lead.googleMapsUrl)
                              ? <><Eye className="h-4 w-4 mr-1.5" />Checked</>
                              : <><MapPin className="h-4 w-4 mr-1.5 text-primary" />Open Maps</>}
                          </a>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {isChecked?.(lead.name, lead.googleMapsUrl) ? 'Already checked' : 'View on Google Maps'}
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    {onAddToOutreach && (
                      checkIsInOutreach(lead.name, lead.googleMapsUrl) ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground/50 bg-muted/30" disabled>
                              <Check className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Already in CRM</TooltipContent>
                        </Tooltip>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-green-500 hover:bg-muted hover:text-green-400"
                              onClick={() => handleAddToOutreach(lead)}
                            >
                              <ClipboardList className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Add to CRM</TooltipContent>
                        </Tooltip>
                      )
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredLeads.length)} of {filteredLeads.length}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="border-border">
                <ChevronLeft className="h-4 w-4 mr-1" />Previous
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) pageNum = i + 1;
                  else if (currentPage <= 3) pageNum = i + 1;
                  else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                  else pageNum = currentPage - 2 + i;
                  return (
                    <Button
                      key={pageNum}
                      variant={currentPage === pageNum ? 'default' : 'outline'}
                      size="sm"
                      className={`w-8 h-8 p-0 ${currentPage === pageNum ? 'bg-primary' : 'border-border'}`}
                      onClick={() => setCurrentPage(pageNum)}
                    >
                      {pageNum}
                    </Button>
                  );
                })}
              </div>
              <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="border-border">
                Next<ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
