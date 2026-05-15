import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { GSTSyncService } from '@/services/gstSyncService';
import { Sync, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';

interface SyncResult {
  invoice_id: string;
  result: {
    success: boolean;
    gst_entry_id?: string;
    error?: string;
  };
}

export const InvoiceGSTSyncManager: React.FC = () => {
  const [syncing, setSyncing] = useState(false);
  const [syncResults, setSyncResults] = useState<SyncResult[]>([]);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();

  const handleSyncAllInvoices = async () => {
    setSyncing(true);
    setProgress(0);
    setSyncResults([]);

    try {
      const results = await GSTSyncService.syncAllInvoicesWithGST();
      setSyncResults(results);

      const successCount = results.filter(r => r.result.success).length;
      const errorCount = results.length - successCount;

      toast({
        title: "Sync Complete",
        description: `Successfully synced ${successCount} invoices. ${errorCount} errors.`,
        variant: errorCount > 0 ? "destructive" : "default"
      });

      setProgress(100);
    } catch (error) {
      toast({
        title: "Sync Failed",
        description: "Failed to sync invoices with GST entries",
        variant: "destructive"
      });
    } finally {
      setSyncing(false);
    }
  };

  const getSyncStatusIcon = (result: SyncResult) => {
    if (result.result.success) {
      return <CheckCircle className="w-4 h-4 text-green-600" />;
    }
    return <AlertCircle className="w-4 h-4 text-red-600" />;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sync className="h-5 w-5" />
            Invoice-GST Sync Manager
          </CardTitle>
          <CardDescription>
            Sync existing invoices with GST entries to maintain tax records
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Button 
              onClick={handleSyncAllInvoices}
              disabled={syncing}
              className="flex items-center gap-2"
            >
              {syncing ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Sync className="w-4 h-4" />
              )}
              {syncing ? 'Syncing...' : 'Sync All Invoices'}
            </Button>
            
            {syncing && (
              <div className="flex-1">
                <Progress value={progress} className="w-full" />
                <p className="text-sm text-muted-foreground mt-1">
                  Syncing invoices with GST entries...
                </p>
              </div>
            )}
          </div>

          {syncResults.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium">Sync Results ({syncResults.length} invoices)</h4>
              <div className="max-h-60 overflow-y-auto space-y-1">
                {syncResults.map((result, index) => (
                  <div 
                    key={result.invoice_id} 
                    className="flex items-center gap-2 p-2 rounded border text-sm"
                  >
                    {getSyncStatusIcon(result)}
                    <span className="font-mono text-xs">{result.invoice_id}</span>
                    <span className="flex-1">
                      {result.result.success ? 'Synced successfully' : result.result.error}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How Invoice-GST Sync Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <h4 className="font-medium">Automatic Sync (New Invoices)</h4>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>When you create a new invoice, a GST entry is automatically created</li>
              <li>GST breakdown (CGST/SGST/IGST) is calculated based on invoice line items</li>
              <li>State-wise GST calculation (interstate vs intrastate)</li>
              <li>Invoice status changes automatically update GST entry status</li>
            </ul>
          </div>
          
          <div className="space-y-2">
            <h4 className="font-medium">Manual Sync (Existing Invoices)</h4>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Use the sync button above to process existing invoices</li>
              <li>Creates GST entries for invoices that don't have them</li>
              <li>Skips invoices that already have GST entries</li>
              <li>Shows detailed results for each invoice processed</li>
            </ul>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium">GST Entry Features</h4>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Automatic CGST/SGST/IGST calculation</li>
              <li>State-wise tax determination</li>
              <li>Status tracking (due, paid, overdue, cancelled)</li>
              <li>Payment date tracking</li>
              <li>Invoice reference linking</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

