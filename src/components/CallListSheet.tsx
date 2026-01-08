import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from './StatusBadge';
import { 
  Phone, 
  PhoneCall, 
  MapPin, 
  X, 
  Download, 
  Trash2,
  ExternalLink,
  Upload
} from 'lucide-react';
import type { Lead } from '@/types/lead';

interface CallListSheetProps {
  callList: Lead[];
  onRemove: (leadId: string) => void;
  onClear: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
}

export function CallListSheet({ callList, onRemove, onClear, onExport, onImport }: CallListSheetProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImport(file);
      e.target.value = '';
    }
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" className="border-border relative">
          <PhoneCall className="mr-2 h-4 w-4" />
          Call List
          {callList.length > 0 && (
            <Badge 
              variant="hot" 
              className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-xs"
            >
              {callList.length}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[400px] sm:w-[540px] bg-card border-border">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <PhoneCall className="h-5 w-5 text-primary" />
            Call List
            {callList.length > 0 && (
              <Badge variant="outline" className="ml-2">
                {callList.length} businesses
              </Badge>
            )}
          </SheetTitle>
          <SheetDescription>
            Businesses you want to call. Export to CSV when ready.
          </SheetDescription>
        </SheetHeader>
        
        <div className="mt-6 space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="hidden"
          />
          
          <div className="flex gap-2">
            <Button 
              onClick={handleImportClick} 
              variant="outline"
              className="flex-1"
            >
              <Upload className="mr-2 h-4 w-4" />
              Import CSV
            </Button>
            {callList.length > 0 && (
              <>
                <Button 
                  onClick={onExport} 
                  className="flex-1 bg-primary hover:bg-primary/90"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Export CSV
                </Button>
                <Button 
                  onClick={onClear} 
                  variant="outline" 
                  className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Clear All
                </Button>
              </>
            )}
          </div>
          
          {callList.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Phone className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>No businesses in your call list yet.</p>
              <p className="text-sm mt-1">Click the phone icon on any lead to add it.</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[calc(100vh-250px)] overflow-y-auto pr-2">
              {callList.map((lead) => (
                <div 
                  key={lead.id}
                  className="p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium truncate">{lead.name}</h4>
                        <StatusBadge status={lead.websiteStatus} />
                      </div>
                      
                      {lead.phone && (
                        <div className="flex items-center gap-1 text-sm text-primary font-mono mb-1">
                          <Phone className="h-3.5 w-3.5" />
                          {lead.phone}
                        </div>
                      )}
                      
                      <div className="flex items-start gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
                        <span className="truncate">{lead.address}</span>
                      </div>
                    </div>
                    
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
                          <ExternalLink className="h-4 w-4 text-muted-foreground" />
                        </a>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 hover:bg-destructive/20 hover:text-destructive"
                        onClick={() => onRemove(lead.id)}
                        title="Remove from call list"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
