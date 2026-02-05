import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { 
  BarChart3, 
  Download, 
  Filter, 
  Calendar,
  FileText,
  IndianRupee,
  TrendingUp,
  AlertCircle
} from "lucide-react";
import { formatIndianCurrency, getCurrentFinancialYear } from "@/utils/indianBusiness";
import { StatCard } from "@/components/inventory/StatCard";
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { pdf } from "@react-pdf/renderer";
import { ReportPDF } from "@/components/pdf/ReportPDF";
import { useCompany } from "@/contexts/CompanyContext";
import { logger } from "@/lib/logger";

interface GSTData {
  id: string;
  invoice_number: string;
  invoice_date: string;
  entity_type: string;
  invoice_type: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  gst_rate?: number; // GST rate from gst_entries table
  transaction_type?: string; // Transaction type to identify returns
  business_entities?: {
    name: string;
    gstin: string;
  };
  suppliers?: {
    company_name: string;
    gstin: string;
  };
  invoice_items: {
    gst_rate: number;
    line_total: number;
  }[];
}

interface GSTBreakdown {
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  taxableAmount: number;
}

export const GSTTracker = () => {
  const { selectedCompany } = useCompany();
  const [gstData, setGstData] = useState<GSTData[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [entityType, setEntityType] = useState<string>("all");
  const [invoiceType, setInvoiceType] = useState<string>("all");
  const [gstBreakdown, setGstBreakdown] = useState<GSTBreakdown>({
    cgst: 0,
    sgst: 0,
    igst: 0,
    total: 0,
    taxableAmount: 0
  });
  const { toast } = useToast();

  useEffect(() => {
    const fy = getCurrentFinancialYear();
    setDateFrom(fy.start.toISOString().split('T')[0]);
    setDateTo(fy.end.toISOString().split('T')[0]);
  }, []);

  useEffect(() => {
    if (dateFrom && dateTo && selectedCompany) {
      fetchGSTData();
    }
  }, [dateFrom, dateTo, entityType, invoiceType, selectedCompany]);

  const fetchGSTData = async () => {
    try {
      setLoading(true);
      
      // Check if company is selected
      if (!selectedCompany?.company_name) {
        setGstData([]);
        setGstBreakdown({
          cgst: 0,
          sgst: 0,
          igst: 0,
          total: 0,
          taxableAmount: 0
        });
        setLoading(false);
        return;
      }
      
      // Get user ID for filtering
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Error",
          description: "User not authenticated",
          variant: "destructive"
        });
        return;
      }

      // Fetch from gst_entries table which has proper CGST/SGST/IGST breakdown
      let query = supabase
        .from('gst_entries')
        .select(`
          id,
          transaction_type,
          entity_name,
          invoice_number,
          invoice_date,
          taxable_amount,
          gst_rate,
          cgst,
          sgst,
          igst,
          total_gst,
          total_amount,
          from_state,
          to_state,
          is_interstate,
          invoices!inner (
            entity_type,
            invoice_type,
            company_id
          )
        `)
        .eq('user_id', user.id)
        .gte('invoice_date', dateFrom)
        .lte('invoice_date', dateTo);
      
      // Filter by company_id to prevent showing old data from deleted companies
      if (selectedCompany?.company_name) {
        query = query.eq('invoices.company_id', selectedCompany.company_name);
      }
      
      query = query.order('invoice_date', { ascending: false });

      if (invoiceType !== 'all') {
        // Map UI invoice type to gst_entries transaction_type
        const transactionTypeMap: Record<string, string> = {
          'sales': 'sale',
          'purchase': 'purchase',
          'sale_return': 'sale_return',
          'purchase_return': 'purchase_return'
        };
        const mappedType = transactionTypeMap[invoiceType] || invoiceType;
        query = query.eq('transaction_type', mappedType);
      }

      const { data, error } = await query;

      if (error) {
        logger.error('Error fetching GST data:', error);
        throw error;
      }
      
      // Filter by entity type after fetching (since it's in the invoices table)
      let filteredData = data || [];
      if (entityType !== 'all') {
        filteredData = filteredData.filter((entry: any) => {
          const invoiceEntityType = entry.invoices?.entity_type;
          const transactionType = entry.transaction_type;
          
          // For supplier filter, ensure transaction_type is purchase/purchase_return
          // For customer filter, ensure transaction_type is sale/sale_return
          if (entityType === 'supplier') {
            const isSupplier = invoiceEntityType === 'supplier' && 
                   (transactionType === 'purchase' || transactionType === 'purchase_return');
            if (!isSupplier && invoiceEntityType === 'supplier') {
              logger.warn(`Supplier invoice ${entry.invoice_number} has incorrect transaction_type: ${transactionType} (expected purchase/purchase_return)`);
            }
            return isSupplier;
          } else if (entityType === 'customer') {
            const isCustomer = invoiceEntityType === 'customer' && 
                   (transactionType === 'sale' || transactionType === 'sale_return');
            if (!isCustomer && invoiceEntityType === 'customer') {
              logger.warn(`Customer invoice ${entry.invoice_number} has incorrect transaction_type: ${transactionType} (expected sale/sale_return)`);
            }
            return isCustomer;
          }
          // For other entity types (wholesaler, etc.), just match entity_type
          return invoiceEntityType === entityType;
        });
      }
      
      console.log(`GST Tracker: Found ${filteredData.length} entries after filtering (entityType: ${entityType}, invoiceType: ${invoiceType})`);

      // Store entry map for accessing CGST/SGST/IGST per entry
      const entryMap: Record<string, any> = {};
      filteredData.forEach((entry: any) => {
        entryMap[entry.id] = entry;
      });
      (window as any).gstEntryMap = entryMap;

      // Transform gst_entries data to match GSTData interface
      const transformedData: GSTData[] = filteredData.map((entry: any) => {
        // Determine invoice_type from transaction_type (more accurate than using invoices.invoice_type)
        // transaction_type from gst_entries is the source of truth
        let displayInvoiceType = entry.invoices?.invoice_type || '';
        
        // Override with transaction_type-based logic for correct categorization
        // For supplier invoices, transaction_type should be 'purchase' or 'purchase_return'
        // For customer invoices, transaction_type should be 'sale' or 'sale_return'
        if (entry.transaction_type === 'purchase' || entry.transaction_type === 'purchase_return') {
          displayInvoiceType = entry.transaction_type === 'purchase_return' ? 'purchase_return' : 'purchase';
        } else if (entry.transaction_type === 'sale' || entry.transaction_type === 'sale_return') {
          displayInvoiceType = entry.transaction_type === 'sale_return' ? 'sale_return' : 'sales';
        }
        
        // Use entity_name from gst_entries (it's already populated correctly)
        // If entity_name is empty or null, try to get it from the invoice's related entity
        let entityName = entry.entity_name;
        if (!entityName || entityName.trim() === '' || entityName === 'Unknown' || entityName === 'N/A') {
          // Try to get entity name from related tables if available
          // For now, use the stored entity_name or fallback to 'Unknown'
          entityName = entry.entity_name || 'Unknown';
        }
        
        return {
          id: entry.id,
          invoice_number: entry.invoice_number,
          invoice_date: entry.invoice_date,
          entity_type: entry.invoices?.entity_type || '',
          invoice_type: displayInvoiceType, // Use corrected invoice type
          subtotal: entry.taxable_amount || 0,
          tax_amount: entry.total_gst || 0,
          total_amount: entry.total_amount || 0,
          business_entities: entry.invoices?.entity_type && entry.invoices.entity_type !== 'supplier' ? {
            name: entityName,
            gstin: '' // GSTIN not stored in gst_entries, would need to join if required
          } : undefined,
          suppliers: entry.invoices?.entity_type === 'supplier' ? {
            company_name: entityName,
            gstin: '' // GSTIN not stored in gst_entries, would need to join if required
          } : undefined,
          invoice_items: [], // Not populated from gst_entries, use gst_rate directly
          gst_rate: entry.gst_rate || 0, // Store GST rate from gst_entries for rate analysis
          transaction_type: entry.transaction_type || '', // Store transaction type to identify returns
          cgst: entry.cgst || 0,
          sgst: entry.sgst || 0,
          igst: entry.igst || 0
        };
      });

      setGstData(transformedData);
      
      // Calculate breakdown from gst_entries (more accurate)
      // Note: When IGST is selected, CGST and SGST should be 0 (and vice versa)
      // The calculation logic ensures mutual exclusivity: IGST entries have CGST=SGST=0
      let totalCGST = 0;
      let totalSGST = 0;
      let totalIGST = 0;
      let totalTaxableAmount = 0;

      filteredData.forEach((entry: any) => {
        // Treat return/refund transactions as void - exclude them completely from calculations
        const isReturn = entry.transaction_type === 'sale_return' || entry.transaction_type === 'purchase_return';
        
        // Skip return/refund transactions entirely (treat as void)
        if (isReturn) {
          return; // Don't include in any calculations
        }
        
        // Only process regular transactions (sales/purchases)
        totalTaxableAmount += (entry.taxable_amount || 0);
        
        // Only sum CGST and SGST if IGST is 0 (intra-state transactions)
        // If IGST > 0, then CGST and SGST should be 0 (inter-state transactions)
        if ((entry.igst || 0) === 0) {
          totalCGST += (entry.cgst || 0);
          totalSGST += (entry.sgst || 0);
        }
        totalIGST += (entry.igst || 0);
      });

      setGstBreakdown({
        cgst: Math.max(0, totalCGST), // Ensure non-negative (though negative is valid for net calculations)
        sgst: Math.max(0, totalSGST),
        igst: Math.max(0, totalIGST),
        total: Math.max(0, totalCGST + totalSGST + totalIGST),
        taxableAmount: Math.max(0, totalTaxableAmount)
      });
    } catch (error: any) {
      logger.error('Error in fetchGSTData:', error);
      toast({
        title: "Error",
        description: error?.message || "Failed to load GST data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // This function is no longer used as we calculate directly from gst_entries
  // Keeping for backwards compatibility but logic moved to fetchGSTData
  const calculateGSTBreakdown = (data: GSTData[]) => {
    // Calculation now done directly in fetchGSTData from gst_entries table
  };

  const exportGSTReport = async (format: 'pdf' | 'excel') => {
    try {
      if (format === 'pdf') {
        const reportData = {
          title: "GST Tax Report",
          subtitle: `Period: ${dateFrom} to ${dateTo}`,
          generatedDate: new Date(),
          columns: [
            { key: 'invoice_date', label: 'Date', width: '15%' },
            { key: 'invoice_number', label: 'Invoice No.', width: '15%' },
            { key: 'entity_name', label: 'Entity', width: '20%' },
            { key: 'invoice_type', label: 'Type', width: '10%' },
            { key: 'subtotal', label: 'Taxable Amount', width: '15%', format: 'currency' as const },
            { key: 'tax_amount', label: 'GST Amount', width: '15%', format: 'currency' as const },
            { key: 'total_amount', label: 'Total', width: '10%', format: 'currency' as const }
          ],
          data: gstData.map(item => ({
            invoice_date: new Date(item.invoice_date).toLocaleDateString('en-IN'),
            invoice_number: item.invoice_number,
            entity_name: item.business_entities?.name || item.suppliers?.company_name || 'N/A',
            invoice_type: item.invoice_type.toUpperCase(),
            subtotal: item.subtotal,
            tax_amount: item.tax_amount,
            total_amount: item.total_amount
          })),
          summary: [
            { label: 'Total Taxable Amount', value: formatIndianCurrency(gstBreakdown.taxableAmount) },
            { label: 'CGST', value: formatIndianCurrency(gstBreakdown.cgst) },
            { label: 'SGST', value: formatIndianCurrency(gstBreakdown.sgst) },
            { label: 'IGST', value: formatIndianCurrency(gstBreakdown.igst) },
            { label: 'Total GST', value: formatIndianCurrency(gstBreakdown.total) }
          ]
        };

        const pdfDoc = <ReportPDF reportData={reportData} />;
        const blob = await pdf(pdfDoc).toBlob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `gst-report-${dateFrom}-to-${dateTo}.pdf`;
        link.click();
        URL.revokeObjectURL(url);

        toast({ title: "Success", description: "GST report exported as PDF" });
      } else {
        // Excel export
        const csvContent = [
          ['Date', 'Invoice No.', 'Entity', 'Type', 'Taxable Amount', 'GST Amount', 'Total'],
          ...gstData.map(item => [
            new Date(item.invoice_date).toLocaleDateString('en-IN'),
            item.invoice_number,
            item.business_entities?.name || item.suppliers?.company_name || 'N/A',
            item.invoice_type.toUpperCase(),
            item.subtotal,
            item.tax_amount,
            item.total_amount
          ]),
          [],
          ['Summary'],
          ['Total Taxable Amount', gstBreakdown.taxableAmount],
          ['CGST', gstBreakdown.cgst],
          ['SGST', gstBreakdown.sgst],
          ['IGST', gstBreakdown.igst],
          ['Total GST', gstBreakdown.total]
        ].map(row => row.join(',')).join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `gst-report-${dateFrom}-to-${dateTo}.csv`;
        link.click();
        URL.revokeObjectURL(url);

        toast({ title: "Success", description: "GST report exported as Excel" });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to export report",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-bold text-foreground">GST Tracker</h2>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => exportGSTReport('pdf')} variant="outline">
            <FileText className="h-4 w-4 mr-2" />
            Export PDF
          </Button>
          <Button onClick={() => exportGSTReport('excel')} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export Excel
          </Button>
          <Button 
            onClick={() => window.open('https://www.gst.gov.in/newsandupdates/read/424', '_blank')}
            variant="outline"
          >
            <TrendingUp className="h-4 w-4 mr-2" />
            Latest GST Updates
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">From Date</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">To Date</label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Entity Type</label>
              <Select value={entityType} onValueChange={setEntityType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="customer">Customer</SelectItem>
                  <SelectItem value="supplier">Supplier</SelectItem>
                  <SelectItem value="wholesaler">Wholesaler</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Invoice Type</label>
              <Select value={invoiceType} onValueChange={setInvoiceType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="sales">Sales</SelectItem>
                  <SelectItem value="purchase">Purchase</SelectItem>
                  <SelectItem value="sale_return">Sale Return (Refund)</SelectItem>
                  <SelectItem value="purchase_return">Purchase Return (Refund)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* GST Summary Cards - Enhanced */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        <StatCard
          title="Total Transactions"
          value={gstData.length.toString()}
          icon={<FileText className="h-5 w-5" />}
          variant="info"
        />
        <StatCard
          title="Taxable Amount"
          value={formatIndianCurrency(gstBreakdown.taxableAmount)}
          icon={<IndianRupee className="h-5 w-5" />}
          variant="info"
        />
        <StatCard
          title="CGST"
          value={formatIndianCurrency(gstBreakdown.cgst)}
          icon={<TrendingUp className="h-5 w-5" />}
          variant="success"
        />
        <StatCard
          title="SGST"
          value={formatIndianCurrency(gstBreakdown.sgst)}
          icon={<TrendingUp className="h-5 w-5" />}
          variant="success"
        />
        <StatCard
          title="IGST"
          value={formatIndianCurrency(gstBreakdown.igst)}
          icon={<TrendingUp className="h-5 w-5" />}
          variant="warning"
        />
        <StatCard
          title="Total GST"
          value={formatIndianCurrency(gstBreakdown.total)}
          icon={<BarChart3 className="h-5 w-5" />}
          variant="primary"
        />
      </div>

      {/* GST Rate Breakdown */}
      {gstData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>GST Rate Analysis</CardTitle>
            <CardDescription>Breakdown by tax slabs for the selected period</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[5, 12, 18, 28].map(rate => {
                // Filter by GST rate directly from gst_entries (stored in gst_rate field)
                const rateData = gstData.filter(invoice => {
                  // Check if gst_rate property exists, otherwise try to get from invoice_items (backward compatibility)
                  const invoiceRate = (invoice as any).gst_rate;
                  if (invoiceRate !== undefined && invoiceRate !== null) {
                    return Math.round(invoiceRate) === rate;
                  }
                  // Fallback: check invoice_items if available (should not happen with new data)
                  return invoice.invoice_items && invoice.invoice_items.some((item: any) => Math.round(item.gst_rate) === rate);
                });
                
                // Filter out return/refund transactions (treat as void)
                const regularTransactions = rateData.filter(inv => {
                  const transType = (inv as any).transaction_type || inv.invoice_type;
                  return transType !== 'sale_return' && transType !== 'purchase_return';
                });
                
                // Calculate totals: only include regular transactions (returns excluded as void)
                const rateTotal = regularTransactions.reduce((sum, inv) => sum + inv.total_amount, 0);
                const rateTaxable = regularTransactions.reduce((sum, inv) => sum + inv.subtotal, 0);
                const rateTax = regularTransactions.reduce((sum, inv) => sum + inv.tax_amount, 0);
                
                return (
                  <div key={rate} className="bg-muted/30 rounded-lg p-4 text-center border">
                    <div className="text-2xl font-bold text-primary mb-2">{rate}%</div>
                    <div className="text-sm text-muted-foreground mb-1">
                      {regularTransactions.length} transaction{regularTransactions.length !== 1 ? 's' : ''}
                    </div>
                    <div className="text-xs text-muted-foreground mb-2">Taxable: {formatIndianCurrency(Math.max(0, rateTaxable))}</div>
                    <div className="font-medium text-lg mb-1">GST: {formatIndianCurrency(Math.max(0, rateTax))}</div>
                    <div className={`font-semibold ${rateTotal < 0 ? 'text-red-600' : ''}`}>
                      Total: {formatIndianCurrency(Math.max(0, rateTotal))}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* GST Data Table */}
      <Card>
        <CardHeader>
          <CardTitle>GST Transaction Details</CardTitle>
          <CardDescription>
            Detailed breakdown of all GST transactions for the selected period
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!selectedCompany?.company_name ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="h-12 w-12 mx-auto mb-4" />
              <p>Please select a company to view GST data</p>
            </div>
          ) : loading ? (
            <div className="text-center py-8">Loading GST data...</div>
          ) : gstData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="h-12 w-12 mx-auto mb-4" />
              <p>No GST data found for the selected period</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Invoice No.</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Taxable Amount</TableHead>
                    <TableHead className="text-right">CGST</TableHead>
                    <TableHead className="text-right">SGST</TableHead>
                    <TableHead className="text-right">IGST</TableHead>
                    <TableHead className="text-right">Total GST</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gstData.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        {new Date(item.invoice_date).toLocaleDateString('en-IN')}
                      </TableCell>
                      <TableCell className="font-medium">
                        {item.invoice_number}
                      </TableCell>
                      <TableCell>
                        {item.business_entities?.name || item.suppliers?.company_name || item.entity_type ? 'Unknown' : 'N/A'}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={
                            item.invoice_type === 'sales' ? 'default' :
                            item.invoice_type === 'purchase' ? 'secondary' :
                            item.invoice_type === 'sale_return' || item.invoice_type === 'purchase_return' ? 'destructive' :
                            'outline'
                          }
                        >
                          {item.invoice_type === 'sale_return' ? 'SALE RETURN' :
                           item.invoice_type === 'purchase_return' ? 'PURCHASE RETURN' :
                           item.invoice_type.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className={`text-right ${(item.invoice_type === 'sale_return' || item.invoice_type === 'purchase_return') ? 'text-red-600' : ''}`}>
                        {(item.invoice_type === 'sale_return' || item.invoice_type === 'purchase_return') ? '-' : ''}
                        {formatIndianCurrency(item.subtotal)}
                      </TableCell>
                      <TableCell className={`text-right ${(item.invoice_type === 'sale_return' || item.invoice_type === 'purchase_return') ? 'text-red-600' : ''}`}>
                        {(item.invoice_type === 'sale_return' || item.invoice_type === 'purchase_return') ? '-' : ''}
                        {formatIndianCurrency(item.cgst || 0)}
                      </TableCell>
                      <TableCell className={`text-right ${(item.invoice_type === 'sale_return' || item.invoice_type === 'purchase_return') ? 'text-red-600' : ''}`}>
                        {(item.invoice_type === 'sale_return' || item.invoice_type === 'purchase_return') ? '-' : ''}
                        {formatIndianCurrency(item.sgst || 0)}
                      </TableCell>
                      <TableCell className={`text-right ${(item.invoice_type === 'sale_return' || item.invoice_type === 'purchase_return') ? 'text-red-600' : ''}`}>
                        {(item.invoice_type === 'sale_return' || item.invoice_type === 'purchase_return') ? '-' : ''}
                        {formatIndianCurrency(item.igst || 0)}
                      </TableCell>
                      <TableCell className={`text-right ${(item.invoice_type === 'sale_return' || item.invoice_type === 'purchase_return') ? 'text-red-600' : ''}`}>
                        {(item.invoice_type === 'sale_return' || item.invoice_type === 'purchase_return') ? '-' : ''}
                        {formatIndianCurrency(item.tax_amount)}
                      </TableCell>
                      <TableCell className={`text-right font-medium ${(item.invoice_type === 'sale_return' || item.invoice_type === 'purchase_return') ? 'text-red-600' : ''}`}>
                        {(item.invoice_type === 'sale_return' || item.invoice_type === 'purchase_return') ? '-' : ''}
                        {formatIndianCurrency(item.total_amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};