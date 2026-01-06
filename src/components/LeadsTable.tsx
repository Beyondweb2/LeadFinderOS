import { useState, useMemo } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from './StatusBadge';
import { 
  ExternalLink, 
  MapPin, 
  Phone, 
  Star, 
  Download, 
  ArrowUpDown,
  Filter,
  ChevronDown,
  ChevronUp
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

interface LeadsTableProps {
  leads: Lead[];
  onExport: () => void;
}

type SortField = 'name' | 'rating' | 'reviewCount' | 'websiteStatus' | 'confidence';
type SortDirection = 'asc' | 'desc';

const statusOrder: Record<WebsiteStatus, number> = {
  NO_WEBSITE: 0,
  DIRECTORY_ONLY: 1,
  UNCERTAIN: 2,
  HAS_OWN_WEBSITE: 3,
};

export function LeadsTable({ leads, onExport }: LeadsTableProps) {
  const [sortField, setSortField] = useState<SortField>('websiteStatus');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [statusFilters, setStatusFilters] = useState<WebsiteStatus[]>([
    'NO_WEBSITE',
    'DIRECTORY_ONLY',
    'HAS_OWN_WEBSITE',
    'UNCERTAIN',
  ]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const filteredAndSortedLeads = useMemo(() => {
    let result = leads.filter((lead) => statusFilters.includes(lead.websiteStatus));

    result.sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'rating':
          comparison = (a.rating ?? 0) - (b.rating ?? 0);
          break;
        case 'reviewCount':
          comparison = (a.reviewCount ?? 0) - (b.reviewCount ?? 0);
          break;
        case 'websiteStatus':
          comparison = statusOrder[a.websiteStatus] - statusOrder[b.websiteStatus];
          break;
        case 'confidence':
          comparison = a.confidence - b.confidence;
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [leads, sortField, sortDirection, statusFilters]);

  const noWebsiteCount = leads.filter((l) => l.websiteStatus === 'NO_WEBSITE').length;

  const SortButton = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <Button
      variant="ghost"
      onClick={() => handleSort(field)}
      className="h-auto p-0 hover:bg-transparent data-table-header"
    >
      {children}
      {sortField === field && (
        sortDirection === 'asc' ? (
          <ChevronUp className="ml-1 h-3 w-3" />
        ) : (
          <ChevronDown className="ml-1 h-3 w-3" />
        )
      )}
    </Button>
  );

  return (
    <Card className="glass-panel border-border/50">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div className="space-y-1">
          <CardTitle className="text-xl font-semibold">
            Search Results
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Found {leads.length} businesses • 
            <span className="text-status-hot font-semibold ml-1">
              {noWebsiteCount} hot leads without websites
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="border-border">
                <Filter className="mr-2 h-4 w-4" />
                Filter Status
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-popover border-border">
              {(['NO_WEBSITE', 'DIRECTORY_ONLY', 'HAS_OWN_WEBSITE', 'UNCERTAIN'] as WebsiteStatus[]).map((status) => (
                <DropdownMenuCheckboxItem
                  key={status}
                  checked={statusFilters.includes(status)}
                  onCheckedChange={(checked) => {
                    setStatusFilters(
                      checked
                        ? [...statusFilters, status]
                        : statusFilters.filter((s) => s !== status)
                    );
                  }}
                >
                  <StatusBadge status={status} />
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          
          <Button 
            onClick={onExport} 
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="w-[250px]">
                  <SortButton field="name">Business Name</SortButton>
                </TableHead>
                <TableHead className="w-[200px]">Address</TableHead>
                <TableHead className="w-[130px]">Phone</TableHead>
                <TableHead className="w-[100px]">
                  <SortButton field="rating">Rating</SortButton>
                </TableHead>
                <TableHead className="w-[140px]">
                  <SortButton field="websiteStatus">Status</SortButton>
                </TableHead>
                <TableHead className="w-[90px]">
                  <SortButton field="confidence">Conf.</SortButton>
                </TableHead>
                <TableHead className="w-[100px]">Links</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedLeads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    No leads match your current filters.
                  </TableCell>
                </TableRow>
              ) : (
                filteredAndSortedLeads.map((lead, index) => (
                  <TableRow 
                    key={lead.id}
                    className="border-border hover:bg-muted/30 animate-fade-in"
                    style={{ animationDelay: `${index * 20}ms` }}
                  >
                    <TableCell className="font-medium data-table-cell">
                      <div className="flex flex-col">
                        <span className="truncate max-w-[230px]">{lead.name}</span>
                        {lead.category && (
                          <span className="text-xs text-muted-foreground truncate max-w-[230px]">
                            {lead.category}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="data-table-cell">
                      <div className="flex items-start gap-1">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <span className="truncate max-w-[180px] text-muted-foreground">
                          {lead.address}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="data-table-cell">
                      {lead.phone ? (
                        <div className="flex items-center gap-1">
                          <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-mono text-xs">{lead.phone}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </TableCell>
                    <TableCell className="data-table-cell">
                      {lead.rating ? (
                        <div className="flex items-center gap-1">
                          <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />
                          <span>{lead.rating.toFixed(1)}</span>
                          <span className="text-muted-foreground text-xs">
                            ({lead.reviewCount ?? 0})
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div>
                            <StatusBadge status={lead.websiteStatus} />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-[300px] bg-popover border-border">
                          <p className="text-sm">{lead.reason}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className="data-table-cell">
                      <Badge variant="outline" className="font-mono text-xs border-border">
                        {Math.round(lead.confidence * 100)}%
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 hover:bg-muted"
                          asChild
                        >
                          <a
                            href={lead.googleMapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="View on Google Maps"
                          >
                            <MapPin className="h-4 w-4 text-primary" />
                          </a>
                        </Button>
                        {lead.websiteUrl && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:bg-muted"
                            asChild
                          >
                            <a
                              href={lead.websiteUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Visit website"
                            >
                              <ExternalLink className="h-4 w-4 text-muted-foreground" />
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
  );
}
