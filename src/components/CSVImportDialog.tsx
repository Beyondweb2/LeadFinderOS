import { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { parseCSV, mapCSVToLead } from '@/lib/leadUtils';
import type { OutreachLead } from '@/types/outreach';

interface CSVImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (leads: Array<Partial<OutreachLead>>) => Promise<void>;
  existingLeads: OutreachLead[];
}

export function CSVImportDialog({ open, onOpenChange, onImport, existingLeads }: CSVImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedLeads, setParsedLeads] = useState<Array<Partial<OutreachLead>>>([]);
  const [duplicates, setDuplicates] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importComplete, setImportComplete] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setError(null);
    setParsedLeads([]);
    setDuplicates([]);
    setImportComplete(false);

    try {
      const content = await selectedFile.text();
      const rows = parseCSV(content);
      
      if (rows.length === 0) {
        setError('No data found in CSV file.');
        return;
      }

      const leads: Array<Partial<OutreachLead>> = [];
      const dupes: string[] = [];
      const existingNames = new Set(existingLeads.map(l => l.business_name.toLowerCase().trim()));

      for (const row of rows) {
        const lead = mapCSVToLead(row);
        if (lead && lead.business_name) {
          const normalizedName = lead.business_name.toLowerCase().trim();
          if (existingNames.has(normalizedName)) {
            dupes.push(lead.business_name);
          } else {
            leads.push(lead);
            existingNames.add(normalizedName);
          }
        }
      }

      setParsedLeads(leads);
      setDuplicates(dupes);
    } catch (err) {
      console.error('CSV parse error:', err);
      setError('Failed to parse CSV file. Please ensure it\'s a valid CSV format.');
    }
  };

  const handleImport = async () => {
    if (parsedLeads.length === 0) return;

    setIsImporting(true);
    try {
      await onImport(parsedLeads);
      setImportComplete(true);
    } catch (err) {
      console.error('Import error:', err);
      setError('Failed to import leads. Please try again.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setParsedLeads([]);
    setDuplicates([]);
    setError(null);
    setImportComplete(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Import Leads from CSV
          </DialogTitle>
          <DialogDescription>
            Upload a CSV file to import leads into your Outreach.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!importComplete ? (
            <>
              <div>
                <Label htmlFor="csv-file">CSV File</Label>
                <div className="mt-2">
                  <Input
                    ref={fileInputRef}
                    id="csv-file"
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {file ? file.name : 'Choose CSV file...'}
                  </Button>
                </div>
              </div>

              <div className="text-xs text-muted-foreground space-y-1">
                <p><strong>Supported columns:</strong></p>
                <ul className="list-disc list-inside">
                  <li>business_name / name / company (required)</li>
                  <li>phone / telephone / mobile</li>
                  <li>email</li>
                  <li>address / location</li>
                  <li>google_maps_url</li>
                  <li>category / type</li>
                  <li>notes</li>
                </ul>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {parsedLeads.length > 0 && (
                <Alert>
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <AlertDescription>
                    Found {parsedLeads.length} leads to import.
                    {duplicates.length > 0 && (
                      <span className="block text-muted-foreground">
                        {duplicates.length} duplicate(s) skipped.
                      </span>
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </>
          ) : (
            <Alert>
              <CheckCircle className="h-4 w-4 text-green-500" />
              <AlertDescription>
                Successfully imported {parsedLeads.length} leads!
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {importComplete ? 'Close' : 'Cancel'}
          </Button>
          {!importComplete && (
            <Button 
              onClick={handleImport} 
              disabled={parsedLeads.length === 0 || isImporting}
            >
              {isImporting ? 'Importing...' : `Import ${parsedLeads.length} Leads`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
