import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/contexts/CompanyContext';
import { 
  BarChart3, 
  Download, 
  FileText, 
  TrendingUp,
  Package,
  ShoppingCart,
  Receipt,
  BookOpen,
  Calendar,
  Clock,
  RefreshCw
} from 'lucide-react';
import { formatIndianCurrency } from '@/utils/indianBusiness';
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ReportPDF } from '@/components/pdf/ReportPDF';
import { pdf } from '@react-pdf/renderer';
import { downloadReportAsCSV } from '@/utils/pdfGenerator';
import { logger } from '@/lib/logger';
import { ReportChatWidget } from '@/components/reports/ReportChatWidget';
import { GSTSyncService } from '@/services/gstSyncService';

interface ReportRow {
  subcategory: string;
  amount: number;
  category?: string;
  // Additional fields for detailed reports
  invoice_number?: string;
  invoice_date?: string;
  customer?: string;
  supplier?: string;
  subtotal?: number;
  tax_amount?: number;
  payment_status?: string;
  po_number?: string;
  status?: string;
  age_category?: string;
  due_date?: string;
  transaction_type?: string;
  gst_type?: string;
  gst_rate?: number;
  payment_method?: string;
  record_type?: string;
  notes?: string;
}

interface ReportSummary {
  totalSales: number;
  totalPurchases: number;
  grossProfit: number;
  netProfit: number;
  purchaseReturns?: number;
  netPurchase?: number;
  saleReturns?: number;
  netSales?: number;
  openingStock?: number;
  closingStock?: number;
  cogs?: number;
  indirectExpenses?: number;
  indirectIncome?: number;
  salesDiscounts?: number;
}

const REPORT_TYPES = [
  { id: 'profit-loss', name: 'Profit & Loss Statement', icon: <TrendingUp className="h-4 w-4" /> },
  { id: 'trial-balance', name: 'Trial Balance', icon: <FileText className="h-4 w-4" /> },
  { id: 'sales-report', name: 'Sales Report', icon: <BarChart3 className="h-4 w-4" /> },
  { id: 'purchase-report', name: 'Purchase Report', icon: <FileText className="h-4 w-4" /> },
  { id: 'gst-report', name: 'GST Report', icon: <FileText className="h-4 w-4" /> },
  { id: 'payment-report', name: 'Payment Report', icon: <FileText className="h-4 w-4" /> },
  { id: 'ledger-summary', name: 'Ledger Summary', icon: <FileText className="h-4 w-4" /> },
  { id: 'invoice-aging', name: 'Invoice Aging Report', icon: <BarChart3 className="h-4 w-4" /> },
  { id: 'return-void-report', name: 'Return/Void Invoice Report', icon: <FileText className="h-4 w-4" /> },
  { id: 'inventory-report', name: 'Inventory Report', icon: <Package className="h-4 w-4" /> }
];

export const ReportsManager: React.FC = () => {
  const { selectedCompany } = useCompany();
  const [selectedReport, setSelectedReport] = useState<string>('profit-loss');
  
  // Initialize date range to current month
  const getCurrentMonthRange = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      from: firstDay.toISOString().split('T')[0],
      to: lastDay.toISOString().split('T')[0]
    };
  };
  
  const [dateFrom, setDateFrom] = useState(() => getCurrentMonthRange().from);
  const [dateTo, setDateTo] = useState(() => getCurrentMonthRange().to);
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<ReportRow[]>([]);
  const [summary, setSummary] = useState<ReportSummary>({
    totalSales: 0,
    totalPurchases: 0,
    grossProfit: 0,
    netProfit: 0
  });
  const [generatedTime, setGeneratedTime] = useState<string>('');
  const [gstSyncLoading, setGstSyncLoading] = useState(false);
  const { toast } = useToast();

  const handleGSTSync = async () => {
    setGstSyncLoading(true);
    try {
      const results = await GSTSyncService.syncAllInvoicesWithGST();
      const successCount = results.filter((r: any) => r.result?.success).length;
      const errorCount = results.length - successCount;
      toast({
        title: "GST Sync Complete",
        description: `Synced ${successCount} invoices. ${errorCount > 0 ? `${errorCount} skipped (already had entries).` : ''}`,
        variant: errorCount > 0 ? "default" : "default"
      });
      if (selectedReport === 'gst-report') {
        generateReport();
      }
    } catch (error: any) {
      logger.error('GST sync error:', error);
      toast({
        title: "GST Sync Failed",
        description: error?.message || "Failed to sync invoices with GST entries",
        variant: "destructive"
      });
    } finally {
      setGstSyncLoading(false);
    }
  };

  // Build a compact context object that can be passed to the AI assistant.
  const reportContext = selectedCompany
    ? {
        reportId: selectedReport,
        reportName: REPORT_TYPES.find((r) => r.id === selectedReport)?.name,
        company: {
          id: (selectedCompany as any).id,
          name: selectedCompany.company_name,
        },
        period: {
          from: dateFrom,
          to: dateTo,
        },
        summary,
        sampleRows: reportData.slice(0, 100),
      }
    : null;

  // Generate report when dependencies change
  useEffect(() => {
    // Only generate if all required data is available
    if (selectedReport && selectedCompany && dateFrom && dateTo) {
      // Use a small delay to debounce rapid changes and prevent race conditions
      const timeoutId = setTimeout(() => {
        generateReport();
      }, 150);
      return () => clearTimeout(timeoutId);
    } else if (!selectedCompany) {
      // Clear report data if no company is selected
      setReportData([]);
      setSummary({
        totalSales: 0,
        totalPurchases: 0,
        grossProfit: 0,
        netProfit: 0
      });
      setGeneratedTime('');
    }
  }, [selectedReport, dateFrom, dateTo, selectedCompany]);

  const generateReport = async () => {
    if (!dateFrom || !dateTo || !selectedCompany) {
      if (!selectedCompany) {
        toast({
          title: "No Company Selected",
          description: "Please select a company to generate reports",
          variant: "destructive"
        });
      }
      return;
    }

    // Don't clear existing data immediately - keep it visible while loading
    setLoading(true);
    try {
      console.log('=== Generating Report ===');
      console.log('Company:', selectedCompany.company_name);
      console.log('Report Type:', selectedReport);
      console.log('Date Range:', dateFrom, 'to', dateTo);
      
      let sampleData: ReportRow[] = [];
      let newSummary: ReportSummary = {
        totalSales: 0,
        totalPurchases: 0,
        grossProfit: 0,
        netProfit: 0
      };

      switch (selectedReport) {
        case 'profit-loss': {
          // Fetch all sales invoices (for sales account) within the reporting period
          const { data: allSalesInvoices, error: salesError } = await supabase
            .from('invoices')
            .select('id, subtotal, tax_amount, total_amount, invoice_date, discount_amount')
            .eq('company_id', selectedCompany.company_name)
            .eq('invoice_type', 'sales')
            .gte('invoice_date', dateFrom)
            .lte('invoice_date', dateTo);

          if (salesError) {
            logger.error('Error fetching sales invoices:', salesError);
          }

          // Fetch sale return invoices in the reporting period
          const { data: saleReturns } = await supabase
            .from('invoices')
            .select('id, subtotal, tax_amount, total_amount, invoice_date')
            .eq('company_id', selectedCompany.company_name)
            .eq('invoice_type', 'sale_return')
            .gte('invoice_date', dateFrom)
            .lte('invoice_date', dateTo);

          // Fetch purchase invoices in the reporting period
          const { data: purchaseInvoices, error: purchaseError } = await supabase
            .from('invoices')
            .select('id, subtotal, tax_amount, total_amount, invoice_date, discount_amount')
            .eq('company_id', selectedCompany.company_name)
            .eq('invoice_type', 'purchase')
            .gte('invoice_date', dateFrom)
            .lte('invoice_date', dateTo);

          if (purchaseError) {
            logger.error('Error fetching purchase invoices:', purchaseError);
          }

          // Fetch purchase return invoices in the reporting period
          const { data: purchaseReturns } = await supabase
            .from('invoices')
            .select('id, subtotal, tax_amount, total_amount, invoice_date')
            .eq('company_id', selectedCompany.company_name)
            .eq('invoice_type', 'purchase_return')
            .gte('invoice_date', dateFrom)
            .lte('invoice_date', dateTo);

          // Fetch invoices BEFORE the reporting period for opening stock calculation
          const { data: salesBeforePeriod } = await supabase
            .from('invoices')
            .select('id')
            .eq('company_id', selectedCompany.company_name)
            .eq('invoice_type', 'sales')
            .lt('invoice_date', dateFrom);

          const { data: saleReturnsBeforePeriod } = await supabase
            .from('invoices')
            .select('id')
            .eq('company_id', selectedCompany.company_name)
            .eq('invoice_type', 'sale_return')
            .lt('invoice_date', dateFrom);

          const { data: purchaseInvoicesBeforePeriod } = await supabase
            .from('invoices')
            .select('id')
            .eq('company_id', selectedCompany.company_name)
            .eq('invoice_type', 'purchase')
            .lt('invoice_date', dateFrom);

          const { data: purchaseReturnsBeforePeriod } = await supabase
            .from('invoices')
            .select('id')
            .eq('company_id', selectedCompany.company_name)
            .eq('invoice_type', 'purchase_return')
            .lt('invoice_date', dateFrom);

          // Fetch labour invoices (potential direct inventory expenses)
          const { data: labourInvoices } = await supabase
            .from('invoices')
            .select('subtotal, tax_amount, total_amount, invoice_date, entity_type')
            .eq('company_id', selectedCompany.company_name)
            .eq('entity_type', 'labour')
            .gte('invoice_date', dateFrom)
            .lte('invoice_date', dateTo);

          // Fetch transport invoices (potential direct inventory expenses)
          const { data: transportInvoices } = await supabase
            .from('invoices')
            .select('subtotal, tax_amount, total_amount, invoice_date, entity_type')
            .eq('company_id', selectedCompany.company_name)
            .eq('entity_type', 'transport')
            .gte('invoice_date', dateFrom)
            .lte('invoice_date', dateTo);

          // Fetch sales invoice IDs first
          const salesInvoiceIds = (allSalesInvoices || []).map(inv => inv.id);
          
          // Fetch sales invoice items to calculate quantity sold for closing stock (period only)
          let salesInvoiceItems: any[] = [];
          if (salesInvoiceIds.length > 0) {
            const { data: itemsData } = await supabase
              .from('invoice_items')
              .select('quantity, unit_price, product_id, invoice_id')
              .in('invoice_id', salesInvoiceIds);
            salesInvoiceItems = itemsData || [];
          }

          // Fetch purchase invoice items for closing stock calculation (debits, period only)
          let purchaseInvoiceItems: any[] = [];
          const purchaseInvoiceIds = (purchaseInvoices || []).map(inv => inv.id);
          if (purchaseInvoiceIds.length > 0) {
            const { data: purchaseItemsData } = await supabase
              .from('invoice_items')
              .select('quantity, unit_price, product_id, invoice_id')
              .in('invoice_id', purchaseInvoiceIds);
            purchaseInvoiceItems = purchaseItemsData || [];
          }

          // Fetch sale return items (credits - increase stock, period only)
          let saleReturnItems: any[] = [];
          const saleReturnIds = (saleReturns || []).map(inv => inv.id);
          if (saleReturnIds.length > 0) {
            const { data: returnItemsData } = await supabase
              .from('invoice_items')
              .select('quantity, unit_price, product_id, invoice_id')
              .in('invoice_id', saleReturnIds);
            saleReturnItems = returnItemsData || [];
          }

          // Fetch purchase return items (debits - decrease stock, period only)
          let purchaseReturnItems: any[] = [];
          const purchaseReturnIds = (purchaseReturns || []).map(inv => inv.id);
          if (purchaseReturnIds.length > 0) {
            const { data: purchaseReturnItemsData } = await supabase
              .from('invoice_items')
              .select('quantity, unit_price, product_id, invoice_id')
              .in('invoice_id', purchaseReturnIds);
            purchaseReturnItems = purchaseReturnItemsData || [];
          }

          // Fetch items BEFORE the reporting period for opening stock calculation
          let salesInvoiceItemsBeforePeriod: any[] = [];
          const salesBeforeIds = (salesBeforePeriod || []).map(inv => inv.id);
          if (salesBeforeIds.length > 0) {
            const { data: itemsBeforeData } = await supabase
              .from('invoice_items')
              .select('quantity, unit_price, product_id, invoice_id')
              .in('invoice_id', salesBeforeIds);
            salesInvoiceItemsBeforePeriod = itemsBeforeData || [];
          }

          let saleReturnItemsBeforePeriod: any[] = [];
          const saleReturnsBeforeIds = (saleReturnsBeforePeriod || []).map(inv => inv.id);
          if (saleReturnsBeforeIds.length > 0) {
            const { data: returnItemsBeforeData } = await supabase
              .from('invoice_items')
              .select('quantity, unit_price, product_id, invoice_id')
              .in('invoice_id', saleReturnsBeforeIds);
            saleReturnItemsBeforePeriod = returnItemsBeforeData || [];
          }

          let purchaseInvoiceItemsBeforePeriod: any[] = [];
          const purchaseBeforeIds = (purchaseInvoicesBeforePeriod || []).map(inv => inv.id);
          if (purchaseBeforeIds.length > 0) {
            const { data: purchaseItemsBeforeData } = await supabase
              .from('invoice_items')
              .select('quantity, unit_price, product_id, invoice_id')
              .in('invoice_id', purchaseBeforeIds);
            purchaseInvoiceItemsBeforePeriod = purchaseItemsBeforeData || [];
          }

          let purchaseReturnItemsBeforePeriod: any[] = [];
          const purchaseReturnsBeforeIds = (purchaseReturnsBeforePeriod || []).map(inv => inv.id);
          if (purchaseReturnsBeforeIds.length > 0) {
            const { data: purchaseReturnItemsBeforeData } = await supabase
              .from('invoice_items')
              .select('quantity, unit_price, product_id, invoice_id')
              .in('invoice_id', purchaseReturnsBeforeIds);
            purchaseReturnItemsBeforePeriod = purchaseReturnItemsBeforeData || [];
          }

          // Fetch all products (including imported opening stock quantity used for first-period opening stock)
          const { data: products, error: productsError } = await supabase
            .from('products')
            .select('id, current_stock, purchase_price, selling_price, gst_rate, opening_stock_qty, opening_stock_value')
            .eq('company_id', selectedCompany.company_name);

          if (productsError) {
            logger.error('Error fetching products for opening/closing stock:', productsError);
          }

          // Calculate Opening and Closing Stock using Trading Account style ledger logic.
          //
          // For each product:
          //   openingQty = purchases_before - purchase_returns_before - sales_before + sales_returns_before
          //   closingQty = openingQty
          //                + purchases_in_period - purchase_returns_in_period
          //                - sales_in_period + sales_returns_in_period
          //
          // Both opening and closing are valued at purchase_price (base cost, excluding GST).
          let openingStockValue = 0;
          let closingStockValue = 0;

          (products || []).forEach((product: any) => {
            const purchasePrice = product.purchase_price || 0;
            // Imported opening stock from Tally (used ONLY when there is no transaction history before the period)
            const importedOpeningQty = Number(product.opening_stock_qty) || 0;

            // --- Quantities BEFORE the period (for opening stock) ---
            let qtyPurchasedBefore = 0;
            (purchaseInvoiceItemsBeforePeriod || []).forEach((item) => {
              if (item.product_id === product.id) {
                qtyPurchasedBefore += item.quantity || 0;
              }
            });

            let qtyPurchaseReturnBefore = 0;
            (purchaseReturnItemsBeforePeriod || []).forEach((item) => {
              if (item.product_id === product.id) {
                qtyPurchaseReturnBefore += item.quantity || 0;
              }
            });

            let qtySoldBefore = 0;
            (salesInvoiceItemsBeforePeriod || []).forEach((item) => {
              if (item.product_id === product.id) {
                qtySoldBefore += item.quantity || 0;
              }
            });

            let qtySalesReturnBefore = 0;
            (saleReturnItemsBeforePeriod || []).forEach((item) => {
              if (item.product_id === product.id) {
                qtySalesReturnBefore += item.quantity || 0;
              }
            });

            const hasHistoryBefore =
              (qtyPurchasedBefore || 0) > 0 ||
              (qtyPurchaseReturnBefore || 0) > 0 ||
              (qtySoldBefore || 0) > 0 ||
              (qtySalesReturnBefore || 0) > 0;

            // More realistic opening stock:
            // - If there is transaction history BEFORE the period, use pure ledger logic from those movements.
            // - If there is NO history before the period, fall back to imported opening stock quantity from Tally.
            const openingStockQty = hasHistoryBefore
              ? Math.max(
                  0,
                  qtyPurchasedBefore
                    - qtyPurchaseReturnBefore
                    - qtySoldBefore
                    + qtySalesReturnBefore
                )
              : importedOpeningQty;

            // Prefer explicit purchase_price; if it's missing but we have an imported
            // opening_stock_value, derive an effective base cost so Opening Stock
            // reflects the original inventory cost (without tax) from imports.
            let effectivePurchasePrice = purchasePrice;
            if (
              (!effectivePurchasePrice || Number.isNaN(effectivePurchasePrice)) &&
              product.opening_stock_value &&
              importedOpeningQty > 0
            ) {
              effectivePurchasePrice = Number(product.opening_stock_value) / importedOpeningQty;
            }

            openingStockValue += openingStockQty * (effectivePurchasePrice || 0);

            // --- Quantities INSIDE the period (from dateFrom to dateTo) ---
            let quantityPurchasedInPeriod = 0;
            (purchaseInvoiceItems || []).forEach((item) => {
              if (item.product_id === product.id) {
                quantityPurchasedInPeriod += item.quantity || 0;
              }
            });

            let quantitySoldInPeriod = 0;
            (salesInvoiceItems || []).forEach((item) => {
              if (item.product_id === product.id) {
                quantitySoldInPeriod += item.quantity || 0;
              }
            });

            let salesReturnQtyInPeriod = 0;
            (saleReturnItems || []).forEach((item) => {
              if (item.product_id === product.id) {
                salesReturnQtyInPeriod += item.quantity || 0;
              }
            });

            let purchaseReturnQtyInPeriod = 0;
            (purchaseReturnItems || []).forEach((item) => {
              if (item.product_id === product.id) {
                purchaseReturnQtyInPeriod += item.quantity || 0;
              }
            });

            const closingStockQty = Math.max(
              0,
              openingStockQty
                + quantityPurchasedInPeriod
                - purchaseReturnQtyInPeriod
                - quantitySoldInPeriod
                + salesReturnQtyInPeriod
            );

            closingStockValue += closingStockQty * (effectivePurchasePrice || 0);
          });

          const openingStockCost = openingStockValue;
          const closingStock = closingStockValue;

          // Calculate purchases and returns (base values only, excluding GST)
          const totalPurchases =
            purchaseInvoices?.reduce((sum, inv) => sum + (inv.subtotal || 0), 0) || 0;
          const totalPurchaseReturns =
            purchaseReturns?.reduce((sum, inv) => sum + (inv.subtotal || 0), 0) || 0;
          const netPurchases = totalPurchases - totalPurchaseReturns;
          
          const purchaseTax =
            purchaseInvoices?.reduce((sum, inv) => sum + (inv.tax_amount || 0), 0) || 0;
          const purchaseReturnTax =
            purchaseReturns?.reduce((sum, inv) => sum + (inv.tax_amount || 0), 0) || 0;
          const netPurchaseTax = purchaseTax - purchaseReturnTax;
          
          // Total inventory-related tax for reference (not used directly in COGS)
          const totalInventoryCostWithTax = openingStockCost + netPurchaseTax;

          // Calculate sales and returns (revenue side)
          const totalSales =
            allSalesInvoices?.reduce((sum, inv) => sum + (inv.subtotal || 0), 0) || 0;
          const totalSaleReturns =
            saleReturns?.reduce((sum, inv) => sum + (inv.subtotal || 0), 0) || 0;
          const netSales = totalSales - totalSaleReturns;
          
          const salesTax =
            allSalesInvoices?.reduce((sum, inv) => sum + (inv.tax_amount || 0), 0) || 0;
          const saleReturnTax =
            saleReturns?.reduce((sum, inv) => sum + (inv.tax_amount || 0), 0) || 0;
          const netSalesTax = salesTax - saleReturnTax;
          
          // Calculate total inventory selling price with tax (for reference)
          const totalInventorySellingWithTax = (products || []).reduce((sum, product) => {
            const stock = product.current_stock || 0;
            const sellingPrice = product.selling_price || 0;
            const gstRate = product.gst_rate || 18; // Get GST rate from product
            const taxAmount = stock * sellingPrice * (gstRate / 100);
            return sum + stock * sellingPrice + taxAmount;
          }, 0);

          // Calculate direct expenses to be included in COGS (base amounts only, excluding GST).
          // Examples: freight inward, loading/unloading, labour tied directly to inventory.
          const labourDirectBase =
            (labourInvoices || []).reduce(
              (sum, inv) => sum + (inv.subtotal || 0),
              0
            ) || 0;
          const transportDirectBase =
            (transportInvoices || []).reduce(
              (sum, inv) => sum + (inv.subtotal || 0),
              0
            ) || 0;
          const directExpenses = labourDirectBase + transportDirectBase;

          // Still keep the full (with-tax) values for disclosure in the report if needed.
          const labourExpenses =
            (labourInvoices || []).reduce(
              (sum, inv) => sum + (inv.total_amount || 0),
              0
            ) || 0;
          const transportExpenses =
            (transportInvoices || []).reduce(
              (sum, inv) => sum + (inv.total_amount || 0),
              0
            ) || 0;
          
          // Calculate sales discounts (indirect expenses)
          // Include both discount_amount and discount_percentage
          let salesDiscounts = 0;
          (allSalesInvoices || []).forEach(inv => {
            let invoiceDiscount = 0;
            const subtotal = inv.subtotal || 0;
            
            // Add flat discount amount
            if (inv.discount_amount) {
              invoiceDiscount += inv.discount_amount;
            }
            
            // Add percentage discount on remaining amount after flat discount
            if (inv.discount_percentage && inv.discount_percentage > 0) {
              const remainingAfterFlat = Math.max(0, subtotal - invoiceDiscount);
              const percentageDiscount = (remainingAfterFlat * inv.discount_percentage) / 100;
              invoiceDiscount += percentageDiscount;
            }
            
            salesDiscounts += invoiceDiscount;
          });
          
          // Calculate purchase discounts (indirect income)
          // Include both discount_amount and discount_percentage
          let purchaseDiscounts = 0;
          (purchaseInvoices || []).forEach(inv => {
            let invoiceDiscount = 0;
            const subtotal = inv.subtotal || 0;
            
            // Add flat discount amount
            if (inv.discount_amount) {
              invoiceDiscount += inv.discount_amount;
            }
            
            // Add percentage discount on remaining amount after flat discount
            if (inv.discount_percentage && inv.discount_percentage > 0) {
              const remainingAfterFlat = Math.max(0, subtotal - invoiceDiscount);
              const percentageDiscount = (remainingAfterFlat * inv.discount_percentage) / 100;
              invoiceDiscount += percentageDiscount;
            }
            
            purchaseDiscounts += invoiceDiscount;
          });
          
          // Indirect expenses are things that do NOT form part of inventory cost
          // (here we treat only sales discounts and ledger-mapped expenses as indirect).
          const indirectExpenses = salesDiscounts;

          // Fetch ledger entries for indirect income (income and expense ledgers)
          const { data: { user } } = await supabase.auth.getUser();
          
          if (!user?.id) {
            logger.warn('No user ID found for ledger entries query');
          }
          
          // First get ledger IDs for the company
          const { data: companyLedgers, error: ledgersError } = await supabase
            .from('ledgers')
            .select('id, ledger_type')
            .eq('company_id', selectedCompany.company_name);
          
          if (ledgersError) {
            logger.error('Error fetching ledgers for company:', ledgersError);
          }
          
          const ledgerIds = (companyLedgers || []).map(l => l.id);
          const ledgerTypeMap = new Map((companyLedgers || []).map(l => [l.id, l.ledger_type]));
          
          console.log(`Found ${ledgerIds.length} ledgers for company ${selectedCompany.company_name}`);
          
          // Then get ledger entries for those ledgers
          // Use a join query to ensure we only get entries for ledgers that belong to this company
          let ledgerEntries: any[] = [];
          if (ledgerIds.length > 0 && user?.id) {
            const { data: entriesData, error: entriesError } = await supabase
              .from('ledger_entries')
              .select('debit_amount, credit_amount, ledger_id, entry_date')
              .in('ledger_id', ledgerIds)
              .eq('user_id', user.id)
              .gte('entry_date', dateFrom)
              .lte('entry_date', dateTo);
            
            if (entriesError) {
              logger.error('Error fetching ledger entries:', entriesError);
            } else {
              console.log(`Found ${(entriesData || []).length} ledger entries in date range`);
            }
            
            // Add ledger type to each entry
            // Note: The calculation below will handle filtering by ledger_type (income/expense)
            ledgerEntries = (entriesData || []).map(entry => ({
              ...entry,
              ledger_type: ledgerTypeMap.get(entry.ledger_id)
            }));
          } else if (ledgerIds.length === 0) {
            logger.warn('No ledgers found for company, cannot fetch ledger entries');
          } else if (!user?.id) {
            logger.warn('No user ID, cannot fetch ledger entries');
          }

          // Calculate indirect income and expenses from ledgers separately
          // Include all ledger types with appropriate mapping rules:
          // - income: credit = income, debit = expense reduction
          // - expense: debit = expense, credit = expense reduction
          // - cash: credit = income (receipts), debit = expense (payments)
          // - bank: credit = income (deposits), debit = expense (withdrawals)
          // - receivables: credit = income (collections), debit = expense (write-offs)
          // - payables: debit = expense (payments), credit = income (reversals)
          let indirectIncome = (ledgerEntries || []).reduce((sum, entry) => {
            const ledgerType = entry.ledger_type?.toLowerCase();
            const credit = entry.credit_amount || 0;
            const debit = entry.debit_amount || 0;
            
            switch (ledgerType) {
              case 'income':
                // For income: credit is income, debit is reversal/refund
                return sum + (credit - debit);
              case 'cash':
              case 'bank':
                // Credit = income (receipts/deposits)
                return sum + credit;
              case 'receivables':
                // Credit = income (collections)
                return sum + credit;
              case 'payables':
                // Credit = income (reversals)
                return sum + credit;
              default:
                return sum;
            }
          }, 0);
          
          // Add purchase discounts to indirect income
          indirectIncome += purchaseDiscounts;
          
          const indirectExpensesFromLedgers = (ledgerEntries || []).reduce((sum, entry) => {
            const ledgerType = entry.ledger_type?.toLowerCase();
            const credit = entry.credit_amount || 0;
            const debit = entry.debit_amount || 0;
            
            switch (ledgerType) {
              case 'expense':
              case 'expenses': // Support both for backward compatibility
                // For expenses: debit is expense, credit is reversal/refund
                return sum + (debit - credit);
              case 'cash':
              case 'bank':
                // Debit = expense (payments/withdrawals)
                return sum + debit;
              case 'receivables':
                // Debit = expense (write-offs)
                return sum + debit;
              case 'payables':
                // Debit = expense (payments)
                return sum + debit;
              default:
                return sum;
            }
          }, 0);
          
          // Total indirect expenses = sales discounts + ledger expenses
          const totalIndirectExpenses = indirectExpenses + indirectExpensesFromLedgers;

          // Cost of Goods Sold (Trading Account):
          // COGS = Opening Stock + Net Purchases + Direct Expenses − Closing Stock
          const effectiveCOGS = openingStockCost + netPurchases + directExpenses - closingStock;
          
          // Calculate gross profit with net sales
          const grossProfit = netSales - effectiveCOGS;
          
          // Calculate net profit (with indirect income and expenses)
          // Net Profit = Gross Profit - Indirect Expenses + Indirect Income
          // Note: Tax difference (netSalesTax - netPurchaseTax) is already accounted for in the gross profit calculation
          // Sales tax collected increases revenue, purchase tax paid increases expenses
          const netProfit = grossProfit - totalIndirectExpenses + indirectIncome;

          console.log('P&L Report - Net Sales:', netSales, '(Sales:', totalSales, '- Returns:', totalSaleReturns, ') Net Purchases:', netPurchases, '(Purchases:', totalPurchases, '- Returns:', totalPurchaseReturns, ') Opening:', openingStockCost, 'Closing:', closingStock, 'COGS:', effectiveCOGS, 'Indirect Exp (invoices):', indirectExpenses, 'Indirect Exp (ledgers):', indirectExpensesFromLedgers, 'Total Indirect Exp:', totalIndirectExpenses, 'Indirect Income:', indirectIncome, 'Gross Profit:', grossProfit, 'Net Profit:', netProfit);

          sampleData = [
            { subcategory: 'Sales Account (All Sales Invoices)', amount: totalSales, category: 'Revenue' },
            { subcategory: 'Less: Sale Returns', amount: -totalSaleReturns, category: 'Revenue' },
            { subcategory: 'Net Sales', amount: netSales, category: 'Revenue' },
            { subcategory: 'Opening Stock', amount: openingStockCost, category: 'Cost of Goods Sold' },
            { subcategory: 'Purchase Account', amount: totalPurchases, category: 'Cost of Goods Sold' },
            { subcategory: 'Less: Purchase Returns', amount: -totalPurchaseReturns, category: 'Cost of Goods Sold' },
            { subcategory: 'Net Purchases', amount: netPurchases, category: 'Cost of Goods Sold' },
            { subcategory: 'Direct Expenses - Labour (Base, excl. GST)', amount: labourDirectBase, category: 'Cost of Goods Sold' },
            { subcategory: 'Direct Expenses - Transport (Base, excl. GST)', amount: transportDirectBase, category: 'Cost of Goods Sold' },
            { subcategory: 'Total Direct Expenses (Base)', amount: directExpenses, category: 'Cost of Goods Sold' },
            { subcategory: 'Less: Closing Stock', amount: -closingStock, category: 'Cost of Goods Sold' },
            { subcategory: 'Cost of Goods Sold', amount: effectiveCOGS, category: 'Cost of Goods Sold' },
            { subcategory: '', amount: grossProfit, category: 'Gross Profit' },
            { subcategory: 'Sales Discounts', amount: salesDiscounts, category: 'Indirect Expenses' },
            { subcategory: 'Indirect Expenses (Ledger)', amount: indirectExpensesFromLedgers, category: 'Indirect Expenses' },
            { subcategory: 'Total Indirect Expenses', amount: totalIndirectExpenses, category: 'Indirect Expenses' },
            { subcategory: 'Purchase Discounts', amount: purchaseDiscounts, category: 'Indirect Income' },
            { subcategory: 'Indirect Income (Ledger)', amount: indirectIncome - purchaseDiscounts, category: 'Indirect Income' },
            { subcategory: 'Total Indirect Income', amount: indirectIncome, category: 'Indirect Income' },
            { subcategory: 'Net Sales Tax Collected', amount: netSalesTax, category: 'Taxes' },
            { subcategory: 'Net Purchase Tax Paid', amount: netPurchaseTax, category: 'Taxes' },
            { subcategory: 'Total Inventory Selling Price (with Tax)', amount: totalInventorySellingWithTax, category: 'Net Profit' },
            { subcategory: '', amount: netProfit, category: 'Net Profit' }
          ];
          newSummary = {
            totalSales: netSales,
            totalPurchases: netPurchases,
            grossProfit,
            netProfit,
            saleReturns: totalSaleReturns,
            purchaseReturns: totalPurchaseReturns,
            openingStock: openingStockCost,
            closingStock: closingStock,
            cogs: effectiveCOGS,
            directExpenses: directExpenses,
            indirectExpenses: totalIndirectExpenses,
            indirectIncome: indirectIncome,
            salesDiscounts: salesDiscounts
          };
          break;
        }
        
        case 'sales-report': {
          // Fetch sales invoices
          const { data: salesData, error: salesDataError } = await supabase
            .from('invoices')
            .select(`
              invoice_number,
              invoice_date,
              subtotal,
              tax_amount,
              total_amount,
              payment_status,
              invoice_type,
              entity_type,
              business_entities(name),
              suppliers(company_name)
            `)
            .eq('company_id', selectedCompany.company_name)
            .eq('invoice_type', 'sales')
            .gte('invoice_date', dateFrom)
            .lte('invoice_date', dateTo)
            .order('invoice_date', { ascending: false });

          if (salesDataError) {
            logger.error('Error fetching sales report data:', salesDataError);
            toast({
              title: "Error",
              description: "Failed to fetch sales data: " + salesDataError.message,
              variant: "destructive"
            });
          }

          // Fetch sale return invoices
          const { data: saleReturns, error: returnError } = await supabase
            .from('invoices')
            .select(`
              invoice_number,
              invoice_date,
              subtotal,
              tax_amount,
              total_amount,
              payment_status,
              invoice_type,
              entity_type,
              business_entities(name),
              suppliers(company_name)
            `)
            .eq('company_id', selectedCompany.company_name)
            .eq('invoice_type', 'sale_return')
            .gte('invoice_date', dateFrom)
            .lte('invoice_date', dateTo)
            .order('invoice_date', { ascending: false });

          if (returnError) {
            logger.error('Error fetching sale returns:', returnError);
          }

          console.log('Sales report invoices found:', salesData?.length || 0, 'Returns:', saleReturns?.length || 0);

          // Map sales invoices
          const salesRows = (salesData || []).map(inv => ({
            subcategory: inv.invoice_number || '',
            amount: inv.total_amount || 0,
            category: new Date(inv.invoice_date).toLocaleDateString('en-IN'),
            invoice_number: inv.invoice_number,
            invoice_date: inv.invoice_date,
            customer: inv.business_entities?.name || inv.suppliers?.company_name || 'Miscellaneous',
            subtotal: inv.subtotal || 0,
            tax_amount: inv.tax_amount || 0,
            payment_status: inv.payment_status || 'due',
            invoice_type: 'sales',
            record_type: 'Sales Invoice'
          }));

          // Map sale return invoices
          const saleReturnRows = (saleReturns || []).map(inv => ({
            subcategory: inv.invoice_number || '',
            amount: inv.total_amount || 0,
            category: new Date(inv.invoice_date).toLocaleDateString('en-IN'),
            invoice_number: inv.invoice_number,
            invoice_date: inv.invoice_date,
            customer: inv.business_entities?.name || inv.suppliers?.company_name || 'Miscellaneous',
            subtotal: inv.subtotal || 0,
            tax_amount: inv.tax_amount || 0,
            payment_status: inv.payment_status || 'due',
            invoice_type: 'sale_return',
            record_type: 'Sale Return'
          }));

          // Include both sales and returns
          sampleData = [...salesRows, ...saleReturnRows];

          // Calculate totals
          const totalSales = (salesData || []).reduce((sum, inv) => sum + (inv.subtotal || 0), 0);
          const totalSaleReturns = (saleReturns || []).reduce((sum, inv) => sum + (inv.subtotal || 0), 0);
          
          const totalTax = (salesData || []).reduce((sum, inv) => sum + (inv.tax_amount || 0), 0);
          const totalReturnTax = (saleReturns || []).reduce((sum, inv) => sum + (inv.tax_amount || 0), 0);
          
          const totalAmount = (salesData || []).reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
          const totalReturnAmount = (saleReturns || []).reduce((sum, inv) => sum + (inv.total_amount || 0), 0);

          // Net Sales = Sales - Sale Returns
          const netSales = totalSales - totalSaleReturns;
          const netTax = totalTax - totalReturnTax;
          const netAmount = totalAmount - totalReturnAmount;

          newSummary = {
            totalSales,
            totalPurchases: 0,
            grossProfit: netTax, // Use net tax (tax - return tax)
            netProfit: netAmount,
            saleReturns: totalSaleReturns,
            netSales: netSales
          };
          
          console.log(`Sales report: Sales=${totalSales}, Returns=${totalSaleReturns}, Net=${netSales}`);
          break;
        }

        case 'purchase-report': {
          // Fetch purchase orders
          const { data: purchaseOrders, error: poError } = await supabase
            .from('purchase_orders')
            .select(`
              po_number,
              order_date,
              subtotal,
              tax_amount,
              total_amount,
              status,
              suppliers(company_name),
              purchase_order_items(
                description,
                quantity,
                unit_price,
                line_total,
                received_quantity
              )
            `)
            .eq('company_id', selectedCompany.company_name)
            .gte('order_date', dateFrom)
            .lte('order_date', dateTo)
            .order('order_date', { ascending: false });

          if (poError) {
            logger.error('Error fetching purchase orders:', poError);
          }

          // Fetch purchase invoices
          const { data: purchaseInvoices, error: invoiceError } = await supabase
            .from('invoices')
            .select(`
              invoice_number,
              invoice_date,
              subtotal,
              tax_amount,
              total_amount,
              invoice_type,
              entity_type,
              payment_status,
              suppliers(company_name),
              business_entities(name)
            `)
            .eq('company_id', selectedCompany.company_name)
            .eq('invoice_type', 'purchase')
            .gte('invoice_date', dateFrom)
            .lte('invoice_date', dateTo)
            .order('invoice_date', { ascending: false });

          if (invoiceError) {
            logger.error('Error fetching purchase invoices:', invoiceError);
            toast({
              title: "Error",
              description: "Failed to fetch purchase invoices: " + invoiceError.message,
              variant: "destructive"
            });
          }

          // Fetch purchase return invoices
          const { data: purchaseReturns, error: returnError } = await supabase
            .from('invoices')
            .select(`
              invoice_number,
              invoice_date,
              subtotal,
              tax_amount,
              total_amount,
              invoice_type,
              entity_type,
              payment_status,
              suppliers(company_name),
              business_entities(name)
            `)
            .eq('company_id', selectedCompany.company_name)
            .eq('invoice_type', 'purchase_return')
            .gte('invoice_date', dateFrom)
            .lte('invoice_date', dateTo)
            .order('invoice_date', { ascending: false });

          if (returnError) {
            logger.error('Error fetching purchase returns:', returnError);
          }

          // Map purchase orders
          const poRows = (purchaseOrders || []).map(po => {
            const items = po.purchase_order_items || [];
            const totalItems = items.length;
            const totalQuantity = items.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0);
            const receivedQuantity = items.reduce((sum: number, item: any) => sum + (item.received_quantity || 0), 0);
            
            return {
              subcategory: po.po_number || '',
              amount: po.total_amount || 0,
              category: new Date(po.order_date).toLocaleDateString('en-IN'),
              po_number: po.po_number,
              invoice_number: po.po_number,
              invoice_date: po.order_date,
              supplier: po.suppliers?.company_name || 'N/A',
              subtotal: po.subtotal || 0,
              tax_amount: po.tax_amount || 0,
              status: po.status || 'draft',
              payment_status: po.status || 'draft',
              total_items: totalItems,
              total_quantity: totalQuantity,
              received_quantity: receivedQuantity,
              record_type: 'PO'
            };
          });

          // Map purchase invoices
          const purchaseInvoiceRows = (purchaseInvoices || []).map(inv => ({
            subcategory: inv.invoice_number || '',
            amount: inv.total_amount || 0,
            category: new Date(inv.invoice_date).toLocaleDateString('en-IN'),
            invoice_number: inv.invoice_number,
            invoice_date: inv.invoice_date,
            supplier: inv.suppliers?.company_name || inv.business_entities?.name || 'Miscellaneous',
            subtotal: inv.subtotal || 0,
            tax_amount: inv.tax_amount || 0,
            payment_status: inv.payment_status || 'due',
            record_type: 'Purchase Invoice'
          }));

          // Map purchase return invoices
          const purchaseReturnRows = (purchaseReturns || []).map(inv => ({
            subcategory: inv.invoice_number || '',
            amount: inv.total_amount || 0,
            category: new Date(inv.invoice_date).toLocaleDateString('en-IN'),
            invoice_number: inv.invoice_number,
            invoice_date: inv.invoice_date,
            supplier: inv.suppliers?.company_name || inv.business_entities?.name || 'Miscellaneous',
            subtotal: inv.subtotal || 0,
            tax_amount: inv.tax_amount || 0,
            payment_status: inv.payment_status || 'due',
            record_type: 'Purchase Return'
          }));

          // Include all: POs, purchases, and returns
          sampleData = [...poRows, ...purchaseInvoiceRows, ...purchaseReturnRows];

          // Calculate totals
          const totalPO = (purchaseOrders || []).reduce((sum, po) => sum + (po.subtotal || 0), 0);
          const totalPurchases = (purchaseInvoices || []).reduce((sum, inv) => sum + (inv.subtotal || 0), 0);
          const totalPurchaseReturns = (purchaseReturns || []).reduce((sum, inv) => sum + (inv.subtotal || 0), 0);
          
          const totalTax = (purchaseOrders || []).reduce((sum, po) => sum + (po.tax_amount || 0), 0) +
                          (purchaseInvoices || []).reduce((sum, inv) => sum + (inv.tax_amount || 0), 0);
          const totalReturnTax = (purchaseReturns || []).reduce((sum, inv) => sum + (inv.tax_amount || 0), 0);
          
          const totalAmount = (purchaseOrders || []).reduce((sum, po) => sum + (po.total_amount || 0), 0) +
                             (purchaseInvoices || []).reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
          const totalReturnAmount = (purchaseReturns || []).reduce((sum, inv) => sum + (inv.total_amount || 0), 0);

          // Net Purchase = Purchase - Purchase Return
          const netPurchase = (totalPO + totalPurchases) - totalPurchaseReturns;
          const netTax = totalTax - totalReturnTax;
          const netAmount = totalAmount - totalReturnAmount;

          newSummary = {
            totalSales: 0,
            totalPurchases: totalPO + totalPurchases,
            grossProfit: netTax,
            netProfit: netAmount,
            purchaseReturns: totalPurchaseReturns,
            netPurchase: netPurchase,
            totalTax,
            totalReturnTax,
            netPurchaseTax: netTax
          };
          
          console.log(`Purchase report: Purchases=${totalPO + totalPurchases}, Returns=${totalPurchaseReturns}, Net=${netPurchase}`);
          break;
        }

        case 'invoice-aging': {
          // Fetch all sales invoices (including paid ones to check if payments were made)
          const { data: agingInvoices, error: agingError } = await supabase
            .from('invoices')
            .select(`
              id,
              invoice_number,
              invoice_date,
              due_date,
              total_amount,
              payment_status,
              business_entities(name),
              suppliers(company_name)
            `)
            .eq('company_id', selectedCompany.company_name)
            .eq('invoice_type', 'sales') // Exclude sale_return (treated as void)
            .order('invoice_date', { ascending: false });

          if (agingError) {
            logger.error('Error fetching aging invoices:', agingError);
            toast({
              title: "Error",
              description: "Failed to fetch aging invoices: " + agingError.message,
              variant: "destructive"
            });
          }

          // Fetch all payments for these invoices (including recent payments)
          const invoiceIds = (agingInvoices || []).map(inv => inv.id);
          let paymentsMap = new Map<string, number>();
          
          if (invoiceIds.length > 0) {
            const { data: { user } } = await supabase.auth.getUser();
            if (user?.id) {
              const { data: paymentsData, error: paymentsError } = await supabase
                .from('invoice_payments')
                .select('invoice_id, amount, payment_date')
                .in('invoice_id', invoiceIds)
                .eq('user_id', user.id)
                .order('payment_date', { ascending: false });

              if (paymentsError) {
                logger.error('Error fetching invoice payments:', paymentsError);
              } else {
                (paymentsData || []).forEach(payment => {
                  const current = paymentsMap.get(payment.invoice_id) || 0;
                  paymentsMap.set(payment.invoice_id, current + (payment.amount || 0));
                });
              }
            }
          }

          const now = new Date();
          const agingData = (agingInvoices || []).map(inv => {
            const dueDate = inv.due_date ? new Date(inv.due_date) : null;
            const totalPaid = paymentsMap.get(inv.id) || 0;
            const totalAmount = inv.total_amount || 0;
            const amountDue = totalAmount - totalPaid;
            
            // Calculate days overdue (negative if not yet due)
            let daysDiff = 0;
            if (dueDate) {
              daysDiff = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
            } else {
              // If no due date, calculate from invoice date (assume 30 days credit)
              const invoiceDate = new Date(inv.invoice_date);
              const assumedDueDate = new Date(invoiceDate);
              assumedDueDate.setDate(assumedDueDate.getDate() + 30);
              daysDiff = Math.floor((now.getTime() - assumedDueDate.getTime()) / (1000 * 60 * 60 * 24));
            }
            
            let category = '0-30 days';
            let isOverdue = false;
            if (daysDiff > 90) {
              category = '90+ days';
              isOverdue = true;
            } else if (daysDiff > 60) {
              category = '61-90 days';
              isOverdue = true;
            } else if (daysDiff > 30) {
              category = '31-60 days';
              isOverdue = true;
            } else if (daysDiff > 0) {
              category = '0-30 days';
              isOverdue = true;
            } else {
              category = 'Not Due Yet';
            }

            return {
              subcategory: inv.invoice_number || '',
              amount: amountDue, // Show pending amount, not total amount
              category,
              invoice_number: inv.invoice_number,
              invoice_date: inv.invoice_date,
              due_date: inv.due_date || '',
              expiration_date: inv.due_date || '', // Use due_date as expiration date
              customer: inv.business_entities?.name || inv.suppliers?.company_name || 'N/A',
              total_amount: totalAmount,
              total_paid: totalPaid,
              amount_due: amountDue,
              payment_status: inv.payment_status || 'due',
              age_category: category,
              days_overdue: isOverdue ? daysDiff : 0,
              days_until_due: !isOverdue ? Math.abs(daysDiff) : 0
            };
          });

          // Filter to only show invoices with pending amounts
          const pendingInvoices = agingData.filter(inv => inv.amount_due > 0);

          sampleData = pendingInvoices;
          
          // Calculate totals
          const totalPending = pendingInvoices.reduce((sum, item) => sum + (item.amount_due || 0), 0);
          const totalOverdue = pendingInvoices
            .filter(item => item.days_overdue > 0)
            .reduce((sum, item) => sum + (item.amount_due || 0), 0);
          const totalPaidAmount = pendingInvoices.reduce((sum, item) => sum + (item.total_paid || 0), 0);
          const totalInvoiceAmount = pendingInvoices.reduce((sum, item) => sum + (item.total_amount || 0), 0);

          newSummary = {
            totalSales: totalPending,
            totalPurchases: totalOverdue,
            grossProfit: pendingInvoices.length,
            netProfit: totalPaidAmount
          };
          break;
        }

        case 'trial-balance': {
          try {
            // Fetch ledgers for the selected company with ledger entries for period transactions
            const { data: { user } } = await supabase.auth.getUser();
            if (!user?.id) {
              toast({
                title: "Error",
                description: "User not authenticated",
                variant: "destructive"
              });
              throw new Error('User not authenticated');
            }

            const { data: ledgersData, error: ledgersError } = await supabase
              .from('ledgers')
              .select('id, name, ledger_type, current_balance, opening_balance')
              .eq('company_id', selectedCompany.company_name)
              .eq('user_id', user.id);

            if (ledgersError) {
              logger.error('Error fetching ledgers:', ledgersError);
              throw ledgersError;
            }

            // Initialize with empty array if no ledgers found
            const ledgers = ledgersData || [];
            const ledgerIds = ledgers.map(l => l.id);
            let ledgerEntriesMap = new Map<string, { debits: number; credits: number }>();
            
            // Fetch ledger entries for the period to calculate debits and credits
            if (ledgerIds.length > 0) {
              const { data: entriesData, error: entriesError } = await supabase
                .from('ledger_entries')
                .select('ledger_id, debit_amount, credit_amount')
                .in('ledger_id', ledgerIds)
                .eq('user_id', user.id)
                .gte('entry_date', dateFrom)
                .lte('entry_date', dateTo);

              if (entriesError) {
                logger.error('Error fetching ledger entries:', entriesError);
                // Continue with empty entries if fetch fails
              } else {
                (entriesData || []).forEach(entry => {
                  const ledgerId = entry.ledger_id;
                  const current = ledgerEntriesMap.get(ledgerId) || { debits: 0, credits: 0 };
                  ledgerEntriesMap.set(ledgerId, {
                    debits: current.debits + (Number(entry.debit_amount) || 0),
                    credits: current.credits + (Number(entry.credit_amount) || 0)
                  });
                });
              }
            }

            // Calculate all ledgers with opening, debits, credits, and closing balance
            sampleData = ledgers.map((l: any) => {
              const entries = ledgerEntriesMap.get(l.id) || { debits: 0, credits: 0 };
              const openingBalance = Number(l.opening_balance) || 0;
              const debits = Number(entries.debits) || 0;
              const credits = Number(entries.credits) || 0;
              
              // Determine account type for proper balance calculation based on accounting rules
              // Credit balance accounts: Capital, Equity, Loan, Payables, Liability, Income, Revenue, Sundry Creditor
              // Debit balance accounts: Assets, Expenses, Cash, Bank, Receivables, Fixed Assets, Sundry Debtor
              const ledgerTypeLower = (l.ledger_type || '').toLowerCase();
              const isCreditBalanceAccount = [
                'capital', 'equity', 'loan', 'payables', 'liability', 'income',
                'sundry creditor', 'creditor', 'revenue', 'secondary loan', 'unsecured loan'
              ].includes(ledgerTypeLower);
              
              // Calculate closing balance based on account type
              // Credit balance: Opening + Credits - Debits (for Capital, Liabilities, Income)
              // Debit balance: Opening + Debits - Credits (for Assets, Expenses)
              const closingBalance = isCreditBalanceAccount
                ? openingBalance + credits - debits
                : openingBalance + debits - credits;
              
              return {
                subcategory: l.name || 'Unknown',
                amount: closingBalance,
                category: l.ledger_type || 'other',
                opening_balance: openingBalance,
                debits: debits,
                credits: credits,
                closing_balance: closingBalance,
                difference: closingBalance - openingBalance
              };
            });

            // Calculate totals - handle empty arrays safely
            const totalDebits = ledgerEntriesMap.size > 0 
              ? Array.from(ledgerEntriesMap.values()).reduce((sum, e) => sum + (Number(e.debits) || 0), 0)
              : 0;
            const totalCredits = ledgerEntriesMap.size > 0
              ? Array.from(ledgerEntriesMap.values()).reduce((sum, e) => sum + (Number(e.credits) || 0), 0)
              : 0;
            const totalOpening = ledgers.length > 0
              ? ledgers.reduce((sum, l: any) => sum + (Number(l.opening_balance) || 0), 0)
              : 0;
            const totalClosing = sampleData.length > 0
              ? sampleData.reduce((sum, item: any) => sum + (Number(item.closing_balance) || 0), 0)
              : 0;
            const difference = totalDebits - totalCredits;

            newSummary = {
              totalSales: totalCredits,
              totalPurchases: totalDebits,
              grossProfit: totalClosing - totalOpening,
              netProfit: difference // Store difference for display
            };
            
            // Show message if no ledgers found
            if (ledgers.length === 0) {
              toast({
                title: "No Ledgers Found",
                description: "No ledgers found for this company. Please create ledgers first.",
                variant: "default"
              });
            }
          } catch (error: any) {
            logger.error('Trial balance error:', error);
            toast({
              title: "Error",
              description: error.message || "Failed to generate trial balance report",
              variant: "destructive"
            });
            sampleData = [];
            newSummary = {
              totalSales: 0,
              totalPurchases: 0,
              grossProfit: 0,
              netProfit: 0
            };
          }
          break;
        }
        
        case 'gst-report': {
          try {
            const { data: { user } } = await supabase.auth.getUser();
            
            if (!user?.id) {
              toast({
                title: "Error",
                description: "User not authenticated",
                variant: "destructive"
              });
              throw new Error('User not authenticated');
            }
            
            // Fetch all GST entries for the company (all invoice types: sale/purchase/return/refund)
            let gstData: any[] = [];
            
            const { data, error } = await supabase
              .from('gst_entries')
              .select(`
                transaction_type,
                invoice_number,
                invoice_date,
                taxable_amount,
                gst_rate,
                cgst,
                sgst,
                igst,
                total_gst,
                invoices!inner(
                  company_id,
                  invoice_type
                )
              `)
              .eq('invoices.company_id', selectedCompany.company_name)
              .eq('user_id', user.id)
              .gte('invoice_date', dateFrom)
              .lte('invoice_date', dateTo)
              .order('invoice_date', { ascending: false });
            
            if (error) {
              logger.error('Error fetching GST data:', error);
              throw error;
            } else {
              gstData = data || [];
              console.log(`Found ${gstData.length} GST entries for company ${selectedCompany.company_name}`);
            }

          // Include sale + sale_return for output tax (sale_return has negative amounts, so net = Sales GST - Return GST)
          const salesTransactions = (gstData || []).filter((g: any) => g.transaction_type === 'sale' || g.transaction_type === 'sale_return');
          const purchaseTransactions = (gstData || []).filter((g: any) => g.transaction_type === 'purchase' || g.transaction_type === 'purchase_return');

          // Output Tax = Sales GST − Sale Return GST (sale_return entries have negative cgst/sgst/igst)
          const outputCGST = salesTransactions.reduce((sum, g) => sum + (g.cgst || 0), 0);
          const outputSGST = salesTransactions.reduce((sum, g) => sum + (g.sgst || 0), 0);
          const outputIGST = salesTransactions.reduce((sum, g) => sum + (g.igst || 0), 0);
          const totalOutputTax = outputCGST + outputSGST + outputIGST;

          // Input Tax = Purchase GST − Purchase Return GST (purchase_return entries have negative amounts)
          const inputCGST = purchaseTransactions.reduce((sum, g) => sum + (g.cgst || 0), 0);
          const inputSGST = purchaseTransactions.reduce((sum, g) => sum + (g.sgst || 0), 0);
          const inputIGST = purchaseTransactions.reduce((sum, g) => sum + (g.igst || 0), 0);
          const totalInputTax = inputCGST + inputSGST + inputIGST;

          // Calculate Net GST Liability (Output Tax - Input Tax)
          const netCGST = outputCGST - inputCGST;
          const netSGST = outputSGST - inputSGST;
          const netIGST = outputIGST - inputIGST;
          const netGSTLiability = totalOutputTax - totalInputTax;

          // Include sale, purchase, sale_return, and purchase_return for detailed view (returns show negative amounts)
          const regularGSTData = (gstData || []).filter((g: any) => 
            g.transaction_type === 'sale' || g.transaction_type === 'purchase' ||
            g.transaction_type === 'sale_return' || g.transaction_type === 'purchase_return'
          );
          
          // Create detailed GST breakdown rows (include return/refund entries with negative amounts)
          const gstBreakdownRows: any[] = [];
          regularGSTData.forEach((g: any) => {
            // Add CGST row if CGST is non-zero (positive = sale/purchase, negative = return/refund deduction)
            if (g.cgst != null && g.cgst !== 0) {
              gstBreakdownRows.push({
                subcategory: g.invoice_number || '',
                amount: g.cgst || 0,
                category: 'CGST',
                invoice_number: g.invoice_number,
                invoice_date: g.invoice_date,
                transaction_type: g.transaction_type,
                taxable_amount: g.taxable_amount || 0,
                gst_type: 'CGST',
                gst_rate: g.gst_rate || 0
              });
            }
            // Add SGST row if SGST is non-zero
            if (g.sgst != null && g.sgst !== 0) {
              gstBreakdownRows.push({
                subcategory: g.invoice_number || '',
                amount: g.sgst || 0,
                category: 'SGST',
                invoice_number: g.invoice_number,
                invoice_date: g.invoice_date,
                transaction_type: g.transaction_type,
                taxable_amount: g.taxable_amount || 0,
                gst_type: 'SGST',
                gst_rate: g.gst_rate || 0
              });
            }
            // Add IGST row if IGST is non-zero
            if (g.igst != null && g.igst !== 0) {
              gstBreakdownRows.push({
                subcategory: g.invoice_number || '',
                amount: g.igst || 0,
                category: 'IGST',
                invoice_number: g.invoice_number,
                invoice_date: g.invoice_date,
                transaction_type: g.transaction_type,
                taxable_amount: g.taxable_amount || 0,
                gst_type: 'IGST',
                gst_rate: g.gst_rate || 0
              });
            }
          });
          
          sampleData = gstBreakdownRows;

            newSummary = {
              totalSales: outputCGST, // Output CGST
              totalPurchases: outputSGST, // Output SGST
              grossProfit: outputIGST, // Output IGST
              netProfit: netGSTLiability, // Net GST Liability
              // Store additional breakdown for summary display
              inputCGST,
              inputSGST,
              inputIGST,
              outputCGST,
              outputSGST,
              outputIGST,
              netCGST,
              netSGST,
              netIGST
            };
          } catch (error: any) {
            logger.error('GST report error:', error);
            toast({
              title: "Error",
              description: error?.message || "Failed to generate GST report",
              variant: "destructive"
            });
            sampleData = [];
            newSummary = {
              totalSales: 0,
              totalPurchases: 0,
              grossProfit: 0,
              netProfit: 0
            };
          }
          break;
        }
        
        case 'payment-report': {
          try {
            const { data: { user } } = await supabase.auth.getUser();
            
            if (!user?.id) {
              toast({
                title: "Error",
                description: "User not authenticated",
                variant: "destructive"
              });
              throw new Error('User not authenticated');
            }
            
            // Fetch payable ledgers (accounts payable)
            const { data: payableLedgers, error: payableError } = await supabase
              .from('ledgers')
              .select('id, name, current_balance, opening_balance')
              .eq('company_id', selectedCompany.company_name)
              .eq('ledger_type', 'payables');

            if (payableError) {
              logger.error('Error fetching payable ledgers:', payableError);
            }

            // Fetch receivable ledgers (accounts receivable)
            const { data: receivableLedgers, error: receivableError } = await supabase
              .from('ledgers')
              .select('id, name, current_balance, opening_balance')
              .eq('company_id', selectedCompany.company_name)
              .eq('ledger_type', 'receivables');

            if (receivableError) {
              logger.error('Error fetching receivable ledgers:', receivableError);
            }

          // Fetch ledger entries for payable and receivable ledgers
          const payableLedgerIds = (payableLedgers || []).map(l => l.id);
          const receivableLedgerIds = (receivableLedgers || []).map(l => l.id);
          const allLedgerIds = [...payableLedgerIds, ...receivableLedgerIds];

          let ledgerEntries: any[] = [];
          if (allLedgerIds.length > 0 && user?.id) {
            const { data: entriesData } = await supabase
              .from('ledger_entries')
              .select('ledger_id, debit_amount, credit_amount, description, entry_date')
              .in('ledger_id', allLedgerIds)
              .eq('user_id', user.id)
              .gte('entry_date', dateFrom)
              .lte('entry_date', dateTo)
              .order('entry_date', { ascending: false });
            ledgerEntries = entriesData || [];
          }

          // Fetch sales invoices
          const { data: salesInvoices } = await supabase
            .from('invoices')
            .select('invoice_number, invoice_date, total_amount, invoice_type, payment_status, business_entities(name), suppliers(company_name)')
            .eq('company_id', selectedCompany.company_name)
            .eq('invoice_type', 'sales')
            .gte('invoice_date', dateFrom)
            .lte('invoice_date', dateTo)
            .order('invoice_date', { ascending: false });

          // Fetch purchase invoices
          const { data: purchaseInvoices } = await supabase
            .from('invoices')
            .select('invoice_number, invoice_date, total_amount, invoice_type, payment_status, suppliers(company_name), business_entities(name)')
            .eq('company_id', selectedCompany.company_name)
            .eq('invoice_type', 'purchase')
            .gte('invoice_date', dateFrom)
            .lte('invoice_date', dateTo)
            .order('invoice_date', { ascending: false });

          // Map payable ledger entries
          const payableEntries = ledgerEntries
            .filter(e => payableLedgerIds.includes(e.ledger_id))
            .map(e => {
              const ledger = payableLedgers?.find(l => l.id === e.ledger_id);
              return {
                subcategory: ledger?.name || 'Payable',
                amount: e.debit_amount || 0,
                category: new Date(e.entry_date).toLocaleDateString('en-IN'),
                description: e.description,
                entry_date: e.entry_date,
                record_type: 'Payable Ledger',
                payment_status: 'due'
              };
            });

          // Map receivable ledger entries
          const receivableEntries = ledgerEntries
            .filter(e => receivableLedgerIds.includes(e.ledger_id))
            .map(e => {
              const ledger = receivableLedgers?.find(l => l.id === e.ledger_id);
              return {
                subcategory: ledger?.name || 'Receivable',
                amount: e.credit_amount || 0,
                category: new Date(e.entry_date).toLocaleDateString('en-IN'),
                description: e.description,
                entry_date: e.entry_date,
                record_type: 'Receivable Ledger',
                payment_status: 'due'
              };
            });

          // Map sales invoices
          const salesInvoiceRows = (salesInvoices || []).map(inv => ({
            subcategory: inv.invoice_number || '',
            amount: inv.total_amount || 0,
            category: new Date(inv.invoice_date).toLocaleDateString('en-IN'),
            invoice_number: inv.invoice_number,
            invoice_date: inv.invoice_date,
            customer: inv.business_entities?.name || inv.suppliers?.company_name || 'N/A',
            record_type: 'Sales Invoice',
            payment_status: inv.payment_status || 'due'
          }));

          // Map purchase invoices
          const purchaseInvoiceRows = (purchaseInvoices || []).map(inv => ({
            subcategory: inv.invoice_number || '',
            amount: inv.total_amount || 0,
            category: new Date(inv.invoice_date).toLocaleDateString('en-IN'),
            invoice_number: inv.invoice_number,
            invoice_date: inv.invoice_date,
            supplier: inv.suppliers?.company_name || inv.business_entities?.name || 'N/A',
            record_type: 'Purchase Invoice',
            payment_status: inv.payment_status || 'due'
          }));

          // Combine all entries
          sampleData = [...payableEntries, ...receivableEntries, ...salesInvoiceRows, ...purchaseInvoiceRows];

          // Calculate totals
          const totalPayables = payableEntries.reduce((sum, e) => sum + (e.amount || 0), 0);
          const totalReceivables = receivableEntries.reduce((sum, e) => sum + (e.amount || 0), 0);
          const totalSales = (salesInvoices || []).reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
          const totalPurchases = (purchaseInvoices || []).reduce((sum, inv) => sum + (inv.total_amount || 0), 0);

          newSummary = {
            totalSales: totalReceivables + totalSales,
            totalPurchases: totalPayables + totalPurchases,
            grossProfit: sampleData.length,
            netProfit: (totalReceivables + totalSales) - (totalPayables + totalPurchases)
          };
          console.log(`Payment report: ${sampleData.length} entries found`);
          } catch (error: any) {
            logger.error('Payment report error:', error);
            toast({
              title: "Error",
              description: error?.message || "Failed to generate payment report",
              variant: "destructive"
            });
            sampleData = [];
            newSummary = {
              totalSales: 0,
              totalPurchases: 0,
              grossProfit: 0,
              netProfit: 0
            };
          }
          break;
        }
        
        case 'ledger-summary': {
          try {
            // Fetch ledgers for the selected company
            const { data: { user } } = await supabase.auth.getUser();
            if (!user?.id) {
              toast({
                title: "Error",
                description: "User not authenticated",
                variant: "destructive"
              });
              throw new Error('User not authenticated');
            }

            const { data: ledgersData, error: ledgersError } = await supabase
              .from('ledgers')
              .select('id, name, ledger_type, current_balance, opening_balance')
              .eq('company_id', selectedCompany.company_name)
              .eq('user_id', user.id);

            if (ledgersError) {
              logger.error('Error fetching ledgers:', ledgersError);
              throw ledgersError;
            }

            const ledgers = ledgersData || [];
            const ledgerIds = ledgers.map(l => l.id);
            let ledgerEntriesMap = new Map<string, { debits: number; credits: number }>();
            
            // Fetch all ledger entries (not just period) for summary
            if (ledgerIds.length > 0) {
              const { data: entriesData, error: entriesError } = await supabase
                .from('ledger_entries')
                .select('ledger_id, debit_amount, credit_amount')
                .in('ledger_id', ledgerIds)
                .eq('user_id', user.id);

              if (entriesError) {
                logger.error('Error fetching ledger entries:', entriesError);
              } else {
                (entriesData || []).forEach(entry => {
                  const ledgerId = entry.ledger_id;
                  const current = ledgerEntriesMap.get(ledgerId) || { debits: 0, credits: 0 };
                  ledgerEntriesMap.set(ledgerId, {
                    debits: current.debits + (Number(entry.debit_amount) || 0),
                    credits: current.credits + (Number(entry.credit_amount) || 0)
                  });
                });
              }
            }

            // Calculate all ledgers with opening, debits, credits, and closing balance
            sampleData = ledgers.map((l: any) => {
              const entries = ledgerEntriesMap.get(l.id) || { debits: 0, credits: 0 };
              const openingBalance = Number(l.opening_balance) || 0;
              const debits = Number(entries.debits) || 0;
              const credits = Number(entries.credits) || 0;
              
              // Determine account type for proper balance calculation based on accounting rules
              // Credit balance accounts: Capital, Equity, Loan, Payables, Liability, Income, Revenue, Sundry Creditor
              // Debit balance accounts: Assets, Expenses, Cash, Bank, Receivables, Fixed Assets, Sundry Debtor
              const ledgerTypeLower = (l.ledger_type || '').toLowerCase();
              const isCreditBalanceAccount = [
                'capital', 'equity', 'loan', 'payables', 'liability', 'income',
                'sundry creditor', 'creditor', 'revenue', 'secondary loan', 'unsecured loan'
              ].includes(ledgerTypeLower);
              
              // Calculate closing balance based on account type
              // Credit balance: Opening + Credits - Debits (for Capital, Liabilities, Income)
              // Debit balance: Opening + Debits - Credits (for Assets, Expenses)
              const closingBalance = isCreditBalanceAccount
                ? openingBalance + credits - debits
                : openingBalance + debits - credits;
              
              return {
                subcategory: l.name || 'Unknown',
                amount: closingBalance,
                category: l.ledger_type || 'other',
                opening_balance: openingBalance,
                debits: debits,
                credits: credits,
                closing_balance: closingBalance
              };
            });

            // Calculate totals - handle empty arrays safely
            const totalDebits = ledgerEntriesMap.size > 0 
              ? Array.from(ledgerEntriesMap.values()).reduce((sum, e) => sum + (Number(e.debits) || 0), 0)
              : 0;
            const totalCredits = ledgerEntriesMap.size > 0
              ? Array.from(ledgerEntriesMap.values()).reduce((sum, e) => sum + (Number(e.credits) || 0), 0)
              : 0;
            const totalOpening = ledgers.length > 0
              ? ledgers.reduce((sum, l: any) => sum + (Number(l.opening_balance) || 0), 0)
              : 0;
            const totalClosing = sampleData.length > 0
              ? sampleData.reduce((sum, item: any) => sum + (Number(item.closing_balance) || 0), 0)
              : 0;

            newSummary = {
              totalSales: totalCredits,
              totalPurchases: totalDebits,
              grossProfit: totalClosing - totalOpening,
              netProfit: totalClosing
            };
            
            // Show message if no ledgers found
            if (ledgers.length === 0) {
              toast({
                title: "No Ledgers Found",
                description: "No ledgers found for this company. Please create ledgers first.",
                variant: "default"
              });
            }
          } catch (error: any) {
            logger.error('Ledger summary error:', error);
            toast({
              title: "Error",
              description: error.message || "Failed to generate ledger summary report",
              variant: "destructive"
            });
            sampleData = [];
            newSummary = {
              totalSales: 0,
              totalPurchases: 0,
              grossProfit: 0,
              netProfit: 0
            };
          }
          break;
        }

        case 'return-void-report': {
          // Fetch all return/refund invoices (treated as void but kept for record-keeping)
          try {
            const { data: saleReturns, error: saleReturnsError } = await supabase
              .from('invoices')
              .select(`
                id,
                invoice_number,
                invoice_date,
                total_amount,
                subtotal,
                tax_amount,
                payment_status,
                notes,
                entity_type,
                business_entities(name, entity_type),
                suppliers(company_name)
              `)
              .eq('company_id', selectedCompany.company_name)
              .eq('invoice_type', 'sale_return')
              .gte('invoice_date', dateFrom)
              .lte('invoice_date', dateTo)
              .order('invoice_date', { ascending: false });

            if (saleReturnsError) {
              logger.error('Error fetching sale returns:', saleReturnsError);
              throw saleReturnsError;
            }

            const { data: purchaseReturns, error: purchaseReturnsError } = await supabase
              .from('invoices')
              .select(`
                id,
                invoice_number,
                invoice_date,
                total_amount,
                subtotal,
                tax_amount,
                payment_status,
                notes,
                entity_type,
                business_entities(name, entity_type),
                suppliers(company_name)
              `)
              .eq('company_id', selectedCompany.company_name)
              .eq('invoice_type', 'purchase_return')
              .gte('invoice_date', dateFrom)
              .lte('invoice_date', dateTo)
              .order('invoice_date', { ascending: false });

            if (purchaseReturnsError) {
              logger.error('Error fetching purchase returns:', purchaseReturnsError);
              throw purchaseReturnsError;
            }

            // Map sale returns - customers are in business_entities with entity_type='customer'
            const saleReturnRows = (saleReturns || []).map(inv => {
              // Determine customer name from business_entities (for customers) or suppliers
              let customerName = 'Miscellaneous';
              if (inv.business_entities) {
                // Check if it's a customer entity
                if (inv.business_entities.entity_type === 'customer' || inv.entity_type === 'customer') {
                  customerName = inv.business_entities.name || 'Miscellaneous';
                } else {
                  customerName = inv.business_entities.name || 'Miscellaneous';
                }
              } else if (inv.suppliers) {
                customerName = inv.suppliers.company_name || 'Miscellaneous';
              }

              return {
                subcategory: inv.invoice_number || '',
                amount: inv.total_amount || 0,
                category: new Date(inv.invoice_date).toLocaleDateString('en-IN'),
                invoice_number: inv.invoice_number,
                invoice_date: inv.invoice_date,
                customer: customerName,
                subtotal: inv.subtotal || 0,
                tax_amount: inv.tax_amount || 0,
                payment_status: inv.payment_status || 'due',
                record_type: 'Sale Return',
                notes: inv.notes || ''
              };
            });

            // Map purchase returns - suppliers can be in suppliers table or business_entities
            const purchaseReturnRows = (purchaseReturns || []).map(inv => {
              // Determine supplier name from suppliers table or business_entities
              let supplierName = 'Miscellaneous';
              if (inv.suppliers) {
                supplierName = inv.suppliers.company_name || 'Miscellaneous';
              } else if (inv.business_entities) {
                // Check if it's a supplier entity
                if (inv.business_entities.entity_type === 'supplier' || inv.entity_type === 'supplier') {
                  supplierName = inv.business_entities.name || 'Miscellaneous';
                } else {
                  supplierName = inv.business_entities.name || 'Miscellaneous';
                }
              }

              return {
                subcategory: inv.invoice_number || '',
                amount: inv.total_amount || 0,
                category: new Date(inv.invoice_date).toLocaleDateString('en-IN'),
                invoice_number: inv.invoice_number,
                invoice_date: inv.invoice_date,
                supplier: supplierName,
                subtotal: inv.subtotal || 0,
                tax_amount: inv.tax_amount || 0,
                payment_status: inv.payment_status || 'due',
                record_type: 'Purchase Return',
                notes: inv.notes || ''
              };
            });

            sampleData = [...saleReturnRows, ...purchaseReturnRows];

            // Calculate totals for summary
            const totalSaleReturns = saleReturnRows.reduce((sum, inv) => sum + (inv.amount || 0), 0);
            const totalPurchaseReturns = purchaseReturnRows.reduce((sum, inv) => sum + (inv.amount || 0), 0);
            const totalReturnAmount = totalSaleReturns + totalPurchaseReturns;

            newSummary = {
              totalSales: totalSaleReturns,
              totalPurchases: totalPurchaseReturns,
              grossProfit: 0, // Returns are void, no profit impact
              netProfit: totalReturnAmount
            };

            console.log(`Return report: Found ${saleReturnRows.length} sale returns and ${purchaseReturnRows.length} purchase returns`);
          } catch (error: any) {
            logger.error('Error in return-void-report:', error);
            toast({
              title: "Error",
              description: error.message || "Failed to fetch return invoices. Please try again.",
              variant: "destructive"
            });
            // Don't throw - allow empty data to be set
            sampleData = [];
            newSummary = {
              totalSales: 0,
              totalPurchases: 0,
              grossProfit: 0,
              netProfit: 0
            };
          }
          break;
        }

        case 'inventory-report': {
          try {
            // Fetch all products for the company
            const { data: products, error: productsError } = await supabase
              .from('products')
              .select('id, name, description, hsn_code, current_stock, purchase_price, selling_price, gst_rate, min_stock_level')
              .eq('company_id', selectedCompany.company_name)
              .order('name', { ascending: true });

            if (productsError) {
              logger.error('Error fetching products:', productsError);
              throw productsError;
            }

            // Map products to report rows
            sampleData = (products || []).map((product: any) => {
              const purchasePrice = product.purchase_price || 0;
              const sellingPrice = product.selling_price || 0;
              const stockValue = (product.current_stock || 0) * purchasePrice;
              const isLowStock = product.min_stock_level && (product.current_stock || 0) < product.min_stock_level;
              const profit = sellingPrice - purchasePrice;
              const profitMargin = purchasePrice > 0 ? ((profit / purchasePrice) * 100) : 0;
              
              return {
                subcategory: product.name || 'Unknown',
                amount: stockValue,
                category: product.description || '',
                product_name: product.name || '',
                description: product.description || '',
                hsn_code: product.hsn_code || '',
                current_stock: product.current_stock || 0,
                purchase_price: purchasePrice,
                selling_price: sellingPrice,
                gst_rate: product.gst_rate || 0,
                min_stock_level: product.min_stock_level || 0,
                stock_value: stockValue,
                is_low_stock: isLowStock,
                profit,
                profit_margin: profitMargin
              };
            });

            // Calculate totals
            const totalProducts = products?.length || 0;
            const totalStockValue = sampleData.reduce((sum, item: any) => sum + (item.stock_value || 0), 0);
            const lowStockCount = sampleData.filter((item: any) => item.is_low_stock).length;

            newSummary = {
              totalSales: totalProducts,
              totalPurchases: totalStockValue,
              grossProfit: lowStockCount,
              netProfit: totalStockValue
            };

            console.log(`Inventory report: Found ${totalProducts} products, Total stock value: ${totalStockValue}`);
          } catch (error: any) {
            logger.error('Error in inventory-report:', error);
            toast({
              title: "Error",
              description: error.message || "Failed to fetch inventory data. Please try again.",
              variant: "destructive"
            });
            sampleData = [];
            newSummary = {
              totalSales: 0,
              totalPurchases: 0,
              grossProfit: 0,
              netProfit: 0
            };
          }
          break;
        }
        
        default: {
          sampleData = [];
          break;
        }
      }

      // Set data atomically - update all state together to prevent flashing
      setReportData(sampleData || []);
      setSummary(newSummary);
      setGeneratedTime(new Date().toLocaleString('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      }));
      
      // Only then clear loading state to show the data
      setLoading(false);
      
      const itemCount = sampleData.length;
      console.log(`Report generated successfully. Found ${itemCount} items for company ${selectedCompany.company_name} in date range ${dateFrom} to ${dateTo}`);
      
      if (itemCount === 0 && selectedReport !== 'profit-loss') {
        toast({
          title: "No Data Found",
          description: `No data found for ${REPORT_TYPES.find(r => r.id === selectedReport)?.name || selectedReport} in the selected date range.`,
          variant: "default"
        });
      } else if (itemCount > 0) {
        toast({
          title: "Success",
          description: `Report generated for ${selectedCompany.company_name} - ${itemCount} ${itemCount === 1 ? 'item' : 'items'} found`,
          duration: 3000
        });
      }
      
    } catch (error: any) {
      logger.error('Error generating report:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to generate report. Please try again.",
        variant: "destructive"
      });
      // Don't clear existing data on error - keep what was there before
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const exportReport = async (format: 'pdf' | 'excel') => {
    if (reportData.length === 0) {
      toast({
        title: "No Data",
        description: "Please generate a report first",
        variant: "destructive"
      });
      return;
    }

    try {
      const reportType = REPORT_TYPES.find(r => r.id === selectedReport);
      const reportTitle = reportType?.name || 'Report';
      const subtitle = `${selectedCompany?.company_name || 'Company'} - ${dateFrom} to ${dateTo}`;

      if (format === 'pdf') {
        // Define columns based on report type
        let columns: { key: string; label: string; width: string; align?: 'left' | 'center' | 'right'; format?: 'currency' | 'number' | 'date' | 'text' }[] = [];
        let formattedData: any[] = [];

        switch (selectedReport) {
          case 'profit-loss':
            columns = [
              { key: 'category', label: 'Category', width: '30%', align: 'left' },
              { key: 'subcategory', label: 'Subcategory', width: '40%', align: 'left' },
              { key: 'amount', label: 'Amount', width: '30%', align: 'right', format: 'currency' }
            ];
            formattedData = reportData.map(row => ({
              category: row.category || '',
              subcategory: row.subcategory || '',
              amount: row.amount || 0
            }));
            break;

          case 'return-void-report':
            columns = [
              { key: 'record_type', label: 'Type', width: '15%', align: 'left' },
              { key: 'invoice_number', label: 'Invoice #', width: '15%', align: 'left' },
              { key: 'invoice_date', label: 'Date', width: '12%', align: 'left', format: 'date' },
              { key: 'customer_supplier', label: 'Customer/Supplier', width: '18%', align: 'left' },
              { key: 'subtotal', label: 'Subtotal', width: '12%', align: 'right', format: 'currency' },
              { key: 'tax_amount', label: 'Tax', width: '10%', align: 'right', format: 'currency' },
              { key: 'amount', label: 'Total', width: '12%', align: 'right', format: 'currency' },
              { key: 'payment_status', label: 'Status', width: '6%', align: 'left' }
            ];
            formattedData = reportData.map(row => ({
              record_type: (row as any).record_type || 'Void',
              invoice_number: row.invoice_number || row.subcategory || '',
              invoice_date: row.invoice_date || row.category || '',
              customer_supplier: row.customer || row.supplier || 'N/A',
              subtotal: row.subtotal || 0,
              tax_amount: row.tax_amount || 0,
              amount: row.amount || 0,
              payment_status: row.payment_status || 'due'
            }));
            break;

          case 'inventory-report':
            columns = [
              { key: 'product_name', label: 'Product Name', width: '20%', align: 'left' },
              { key: 'hsn_code', label: 'HSN Code', width: '10%', align: 'left' },
              { key: 'current_stock', label: 'Stock', width: '8%', align: 'right' },
              { key: 'purchase_price', label: 'Purchase Price', width: '10%', align: 'right', format: 'currency' },
              { key: 'selling_price', label: 'Selling Price', width: '10%', align: 'right', format: 'currency' },
              { key: 'profit', label: 'Profit', width: '10%', align: 'right', format: 'currency' },
              { key: 'profit_margin', label: 'Profit Margin %', width: '10%', align: 'right' },
              { key: 'gst_rate', label: 'GST %', width: '6%', align: 'right' },
              { key: 'stock_value', label: 'Stock Value', width: '12%', align: 'right', format: 'currency' },
              { key: 'status', label: 'Status', width: '4%', align: 'left' }
            ];
            formattedData = reportData.map(row => ({
              product_name: (row as any).product_name || row.subcategory || '',
              hsn_code: (row as any).hsn_code || '',
              current_stock: (row as any).current_stock || 0,
              purchase_price: (row as any).purchase_price || 0,
              selling_price: (row as any).selling_price || 0,
              profit: (row as any).profit ?? ((row as any).selling_price || 0) - ((row as any).purchase_price || 0),
              profit_margin: (row as any).profit_margin ?? (((row as any).purchase_price || 0) > 0
                ? ((((row as any).selling_price || 0) - ((row as any).purchase_price || 0)) / ((row as any).purchase_price || 0)) * 100
                : 0),
              gst_rate: (row as any).gst_rate || 0,
              stock_value: (row as any).stock_value || row.amount || 0,
              status: (row as any).is_low_stock ? 'Low Stock' : 'In Stock'
            }));
            break;

          case 'sales-report':
            columns = [
              { key: 'invoice_number', label: 'Invoice #', width: '15%', align: 'left' },
              { key: 'invoice_date', label: 'Date', width: '12%', align: 'left', format: 'date' },
              { key: 'customer', label: 'Customer', width: '20%', align: 'left' },
              { key: 'subtotal', label: 'Subtotal', width: '15%', align: 'right', format: 'currency' },
              { key: 'tax_amount', label: 'Tax', width: '12%', align: 'right', format: 'currency' },
              { key: 'amount', label: 'Total', width: '15%', align: 'right', format: 'currency' },
              { key: 'payment_status', label: 'Status', width: '11%', align: 'left' }
            ];
            formattedData = reportData.map(row => ({
              invoice_number: row.invoice_number || row.subcategory || '',
              invoice_date: row.invoice_date || row.category || '',
              customer: row.customer || 'N/A',
              subtotal: row.subtotal || 0,
              tax_amount: row.tax_amount || 0,
              amount: row.amount || 0,
              payment_status: row.payment_status || 'due'
            }));
            break;

          case 'purchase-report':
            columns = [
              { key: 'po_number', label: 'PO #', width: '15%', align: 'left' },
              { key: 'invoice_date', label: 'Date', width: '12%', align: 'left', format: 'date' },
              { key: 'supplier', label: 'Supplier', width: '20%', align: 'left' },
              { key: 'subtotal', label: 'Subtotal', width: '15%', align: 'right', format: 'currency' },
              { key: 'tax_amount', label: 'Tax', width: '12%', align: 'right', format: 'currency' },
              { key: 'amount', label: 'Total', width: '15%', align: 'right', format: 'currency' },
              { key: 'status', label: 'Status', width: '11%', align: 'left' }
            ];
            formattedData = reportData.map(row => ({
              po_number: row.po_number || row.subcategory || '',
              invoice_date: row.invoice_date || row.category || '',
              supplier: row.supplier || 'N/A',
              subtotal: row.subtotal || 0,
              tax_amount: row.tax_amount || 0,
              amount: row.amount || 0,
              status: row.status || 'draft'
            }));
            break;

          case 'trial-balance':
            columns = [
              { key: 'subcategory', label: 'Account', width: '30%', align: 'left' },
              { key: 'category', label: 'Type', width: '20%', align: 'left' },
              { key: 'opening_balance', label: 'Opening', width: '15%', align: 'right', format: 'currency' },
              { key: 'debits', label: 'Debits', width: '12%', align: 'right', format: 'currency' },
              { key: 'credits', label: 'Credits', width: '12%', align: 'right', format: 'currency' },
              { key: 'closing_balance', label: 'Closing', width: '11%', align: 'right', format: 'currency' }
            ];
            formattedData = reportData.map((row: any) => ({
              subcategory: row.subcategory || '',
              category: row.category || '',
              opening_balance: Number(row.opening_balance) || 0,
              debits: Number(row.debits) || 0,
              credits: Number(row.credits) || 0,
              closing_balance: Number(row.closing_balance) || 0
            }));
            break;

          case 'invoice-aging':
            columns = [
              { key: 'invoice_number', label: 'Invoice #', width: '15%', align: 'left' },
              { key: 'customer', label: 'Customer', width: '20%', align: 'left' },
              { key: 'age_category', label: 'Age Category', width: '15%', align: 'left' },
              { key: 'total_amount', label: 'Total', width: '12%', align: 'right', format: 'currency' },
              { key: 'total_paid', label: 'Paid', width: '12%', align: 'right', format: 'currency' },
              { key: 'amount_due', label: 'Pending', width: '12%', align: 'right', format: 'currency' },
              { key: 'due_date', label: 'Due Date', width: '14%', align: 'left', format: 'date' }
            ];
            formattedData = reportData.map(row => ({
              invoice_number: row.invoice_number || row.subcategory || '',
              customer: row.customer || 'N/A',
              age_category: row.age_category || row.category || '0-30 days',
              total_amount: row.total_amount || row.amount || 0,
              total_paid: (row as any).total_paid || 0,
              amount_due: (row as any).amount_due || row.amount || 0,
              due_date: row.due_date || row.expiration_date || ''
            }));
            break;

          case 'ledger-summary':
            columns = [
              { key: 'subcategory', label: 'Account Name', width: '30%', align: 'left' },
              { key: 'category', label: 'Type', width: '20%', align: 'left' },
              { key: 'opening_balance', label: 'Opening Balance', width: '15%', align: 'right', format: 'currency' },
              { key: 'debits', label: 'Debits', width: '12%', align: 'right', format: 'currency' },
              { key: 'credits', label: 'Credits', width: '12%', align: 'right', format: 'currency' },
              { key: 'closing_balance', label: 'Closing Balance', width: '11%', align: 'right', format: 'currency' }
            ];
            formattedData = reportData.map((row: any) => ({
              subcategory: row.subcategory || '',
              category: row.category || '',
              opening_balance: Number(row.opening_balance) || 0,
              debits: Number(row.debits) || 0,
              credits: Number(row.credits) || 0,
              closing_balance: Number(row.closing_balance) || 0
            }));
            break;

          default:
            // Generic report format
            columns = [
              { key: 'subcategory', label: 'Item', width: '40%', align: 'left' },
              { key: 'category', label: 'Category', width: '30%', align: 'left' },
              { key: 'amount', label: 'Amount', width: '30%', align: 'right', format: 'currency' }
            ];
            formattedData = reportData.map(row => ({
              subcategory: row.subcategory || '',
              category: row.category || '',
              amount: row.amount || 0
            }));
        }

        // Create summary array with proper labels based on report type
        const summaryItems = [];
        if (selectedReport === 'ledger-summary') {
          // Ledger summary specific labels
          if (summary.totalSales !== 0) {
            summaryItems.push({ label: 'Total Credits', value: summary.totalSales, format: 'currency' as const });
          }
          if (summary.totalPurchases !== 0) {
            summaryItems.push({ label: 'Total Debits', value: summary.totalPurchases, format: 'currency' as const });
          }
          if (summary.grossProfit !== 0) {
            summaryItems.push({ label: 'Net Change', value: summary.grossProfit, format: 'currency' as const });
          }
          if (summary.netProfit !== 0) {
            summaryItems.push({ label: 'Total Closing Balance', value: summary.netProfit, format: 'currency' as const });
          }
        } else {
          // Standard summary labels for other reports
          if (summary.totalSales !== 0) {
            summaryItems.push({ label: 'Total Sales', value: summary.totalSales, format: 'currency' as const });
          }
          if (summary.totalPurchases !== 0) {
            summaryItems.push({ label: 'Total Purchases', value: summary.totalPurchases, format: 'currency' as const });
          }
          if (summary.grossProfit !== 0) {
            summaryItems.push({ label: 'Gross Profit', value: summary.grossProfit, format: 'currency' as const });
          }
          if (summary.netProfit !== 0) {
            summaryItems.push({ label: 'Net Profit', value: summary.netProfit, format: 'currency' as const });
          }
        }

        const reportDataForPDF = {
          title: reportTitle,
          subtitle: subtitle,
          generatedDate: new Date(),
          data: formattedData,
          columns: columns,
          summary: summaryItems.length > 0 ? summaryItems : undefined
        };

        const pdfDoc = <ReportPDF reportData={reportDataForPDF} />;
        const blob = await pdf(pdfDoc).toBlob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${reportTitle.replace(/\s+/g, '-').toLowerCase()}-${dateFrom}-to-${dateTo}.pdf`;
        link.click();
        URL.revokeObjectURL(url);

        toast({
          title: "Success",
          description: "Report exported as PDF"
        });
      } else {
        // CSV export
        const columns = reportData.length > 0 ? Object.keys(reportData[0]) : [];
        downloadReportAsCSV(reportTitle, reportData, columns);
        toast({
          title: "Success",
          description: "Report exported as CSV"
        });
      }
    } catch (error) {
      logger.error('Error exporting report:', error);
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
          <h2 className="text-2xl font-bold text-foreground">Reports</h2>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleGSTSync} variant="outline" disabled={gstSyncLoading} title="Sync existing invoices with GST entries (backfill return invoices)">
            {gstSyncLoading ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Sync GST
          </Button>
          <Button onClick={() => exportReport('pdf')} variant="outline">
            <FileText className="h-4 w-4 mr-2" />
            Export PDF
          </Button>
          <Button onClick={() => exportReport('excel')} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export Excel
          </Button>
        </div>
      </div>

      {/* Generate Report Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Generate Report
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Report Type</label>
              <Select value={selectedReport} onValueChange={setSelectedReport}>
                <SelectTrigger>
                  <SelectValue placeholder="Select report type" />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_TYPES.map(report => (
                    <SelectItem key={report.id} value={report.id}>
                      <div className="flex items-center gap-2">
                        {report.icon}
                        {report.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">From Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">To Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex items-end gap-2 flex-nowrap">
              <Button
                type="button"
                onClick={() => {
                  const range = getCurrentMonthRange();
                  setDateFrom(range.from);
                  setDateTo(range.to);
                }}
                variant="outline"
                size="sm"
                className="whitespace-nowrap text-xs px-3 flex-shrink-0"
              >
                Current Month
              </Button>
              <Button
                type="button"
                onClick={() => generateReport()}
                size="sm"
                className="whitespace-nowrap text-xs px-3 flex-shrink-0"
              >
                Refresh Report
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Report Display */}
      {reportData.length > 0 && (
        <div className="space-y-4">
          {/* Report Title */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>
                    {selectedReport === 'profit-loss' && 'Profit & Loss Statement'}
                    {selectedReport === 'trial-balance' && 'Trial Balance'}
                    {selectedReport === 'sales-report' && 'Sales Report'}
                    {selectedReport === 'purchase-report' && 'Purchase Report'}
                    {selectedReport === 'gst-report' && 'GST Report'}
                    {selectedReport === 'payment-report' && 'Payment Report'}
                    {selectedReport === 'ledger-summary' && 'Ledger Summary'}
                    {selectedReport === 'invoice-aging' && 'Invoice Aging Report'}
                    {selectedReport === 'return-void-report' && 'Return/Void Invoice Report'}
                    {selectedReport === 'inventory-report' && 'Inventory Report'}
                    {selectedCompany && (
                      <span className="text-muted-foreground font-normal text-base ml-2">
                        ({selectedCompany.company_name})
                      </span>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {formatDate(dateFrom)} to {formatDate(dateTo)}
                    {!selectedCompany && (
                      <span className="text-destructive ml-2">⚠️ Please select a company</span>
                    )}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>Generated: {generatedTime}</span>
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Report Table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    {selectedReport === 'profit-loss' && (
                      <>
                        <TableHead>Category</TableHead>
                        <TableHead>Subcategory</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </>
                    )}
                    {selectedReport === 'trial-balance' && (
                      <>
                        <TableHead>Ledger Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Opening Balance</TableHead>
                        <TableHead className="text-right">Debits</TableHead>
                        <TableHead className="text-right">Credits</TableHead>
                        <TableHead className="text-right">Closing Balance</TableHead>
                      </>
                    )}
                    {selectedReport === 'sales-report' && (
                      <>
                        <TableHead>Type</TableHead>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead className="text-right">Subtotal</TableHead>
                        <TableHead className="text-right">Tax</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Status</TableHead>
                      </>
                    )}
                    {selectedReport === 'purchase-report' && (
                      <>
                        <TableHead>Type</TableHead>
                        <TableHead>PO/Invoice #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead className="text-right">Subtotal</TableHead>
                        <TableHead className="text-right">Tax</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Status</TableHead>
                      </>
                    )}
                    {selectedReport === 'gst-report' && (
                      <>
                        <TableHead>Transaction Type</TableHead>
                        <TableHead>GST Type</TableHead>
                        <TableHead className="text-right">Taxable Amount</TableHead>
                        <TableHead className="text-right">GST Rate</TableHead>
                        <TableHead className="text-right">GST Amount</TableHead>
                      </>
                    )}
                    {selectedReport === 'payment-report' && (
                      <>
                        <TableHead>Payment Type</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Status</TableHead>
                      </>
                    )}
                    {selectedReport === 'ledger-summary' && (
                      <>
                        <TableHead>Account Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Opening Balance</TableHead>
                        <TableHead className="text-right">Debits</TableHead>
                        <TableHead className="text-right">Credits</TableHead>
                        <TableHead className="text-right">Closing Balance</TableHead>
                      </>
                    )}
                    {selectedReport === 'return-void-report' && (
                      <>
                        <TableHead>Type</TableHead>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Customer/Supplier</TableHead>
                        <TableHead className="text-right">Subtotal</TableHead>
                        <TableHead className="text-right">Tax</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Notes</TableHead>
                      </>
                    )}
                    {selectedReport === 'inventory-report' && (
                      <>
                        <TableHead>Product Name</TableHead>
                        <TableHead>HSN Code</TableHead>
                        <TableHead className="text-right">Stock</TableHead>
                        <TableHead className="text-right">Purchase Price</TableHead>
                        <TableHead className="text-right">Selling Price</TableHead>
                        <TableHead className="text-right">Profit</TableHead>
                        <TableHead className="text-right">Profit Margin %</TableHead>
                        <TableHead className="text-right">GST %</TableHead>
                        <TableHead className="text-right">Stock Value</TableHead>
                        <TableHead>Status</TableHead>
                      </>
                    )}
                    {selectedReport === 'invoice-aging' && (
                      <>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Age Category</TableHead>
                        <TableHead className="text-right">Total Amount</TableHead>
                        <TableHead className="text-right">Paid</TableHead>
                        <TableHead className="text-right">Pending</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Days Overdue</TableHead>
                        <TableHead>Status</TableHead>
                      </>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData.map((row, index) => (
                    <TableRow key={index}>
                      {selectedReport === 'profit-loss' && (
                        <>
                          <TableCell className="font-medium">
                            <span className="text-muted-foreground italic">
                              {row.category}
                            </span>
                          </TableCell>
                          <TableCell className="font-medium">
                            {row.subcategory || '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={row.amount < 0 ? 'text-red-500' : 'text-green-500'}>
                              {formatIndianCurrency(Math.abs(row.amount))}
                              {row.amount < 0 && ' -'}
                            </span>
                          </TableCell>
                        </>
                      )}
                      {selectedReport === 'trial-balance' && (
                        <>
                          <TableCell className="font-medium">{row.subcategory}</TableCell>
                          <TableCell>{row.category}</TableCell>
                          <TableCell className="text-right">{formatIndianCurrency(Number(row.opening_balance) || 0)}</TableCell>
                          <TableCell className="text-right">{formatIndianCurrency(Number(row.debits) || 0)}</TableCell>
                          <TableCell className="text-right">{formatIndianCurrency(Number(row.credits) || 0)}</TableCell>
                          <TableCell className="text-right">{formatIndianCurrency(Number(row.closing_balance) || 0)}</TableCell>
                        </>
                      )}
                      {selectedReport === 'sales-report' && (
                        <>
                          <TableCell>
                            <Badge variant={
                              row.record_type === 'Sale Return' ? 'destructive' : 'default'
                            }>
                              {row.record_type || 'Sales'}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">{row.invoice_number || row.subcategory}</TableCell>
                          <TableCell>{row.invoice_date ? formatDate(row.invoice_date) : row.category}</TableCell>
                          <TableCell>{row.customer || 'N/A'}</TableCell>
                          <TableCell className="text-right">{formatIndianCurrency(row.subtotal || 0)}</TableCell>
                          <TableCell className="text-right">{formatIndianCurrency(row.tax_amount || 0)}</TableCell>
                          <TableCell className="text-right">{formatIndianCurrency(row.amount)}</TableCell>
                          <TableCell>
                            <Badge variant={row.payment_status === 'paid' ? 'default' : 'outline'}>
                              {row.payment_status || 'due'}
                            </Badge>
                          </TableCell>
                        </>
                      )}
                      {selectedReport === 'purchase-report' && (
                        <>
                          <TableCell>
                            <Badge variant={
                              row.record_type === 'Purchase Return' ? 'destructive' :
                              row.record_type === 'PO' ? 'secondary' : 'default'
                            }>
                              {row.record_type || 'Purchase'}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">{row.po_number || row.invoice_number || row.subcategory}</TableCell>
                          <TableCell>{row.invoice_date ? formatDate(row.invoice_date) : row.category}</TableCell>
                          <TableCell>{row.supplier || 'N/A'}</TableCell>
                          <TableCell className="text-right">{formatIndianCurrency(row.subtotal || 0)}</TableCell>
                          <TableCell className="text-right">{formatIndianCurrency(row.tax_amount || 0)}</TableCell>
                          <TableCell className="text-right">{formatIndianCurrency(row.amount)}</TableCell>
                          <TableCell>
                            <Badge variant={row.payment_status === 'paid' ? 'default' : 'outline'}>
                              {row.payment_status || row.status || 'due'}
                            </Badge>
                          </TableCell>
                        </>
                      )}
                      {selectedReport === 'gst-report' && (
                        <>
                          <TableCell className="font-medium">
                            <Badge variant={
                              row.transaction_type === 'sale' ? 'default' :
                              row.transaction_type === 'sale_return' ? 'destructive' :
                              row.transaction_type === 'purchase_return' ? 'destructive' : 'secondary'
                            }>
                              {row.transaction_type === 'sale' ? 'Sale' :
                               row.transaction_type === 'sale_return' ? 'Sale Return' :
                               row.transaction_type === 'purchase_return' ? 'Purchase Return' : 'Purchase'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={
                              row.category === 'CGST' ? 'default' :
                              row.category === 'SGST' ? 'secondary' : 'outline'
                            }>
                              {row.category || row.gst_type || 'GST'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{formatIndianCurrency(row.taxable_amount || 0)}</TableCell>
                          <TableCell className="text-right">{row.gst_rate || 0}%</TableCell>
                          <TableCell className={`text-right ${(row.amount || 0) < 0 ? 'text-red-600' : ''}`}>
                            {(row.amount || 0) < 0 ? '-' : ''}{formatIndianCurrency(Math.abs(row.amount || 0))}
                          </TableCell>
                        </>
                      )}
                      {selectedReport === 'payment-report' && (
                        <>
                          <TableCell className="font-medium">{row.payment_method === 'cash' ? 'Cash Payment' : row.payment_method === 'bank_transfer' ? 'Bank Transfer' : row.payment_method || 'Cash'}</TableCell>
                          <TableCell>{row.invoice_date ? formatDate(row.invoice_date) : row.category}</TableCell>
                          <TableCell>{row.invoice_number || `REF-${index + 1}`}</TableCell>
                          <TableCell className="text-right">{formatIndianCurrency(row.amount)}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {row.payment_method === 'bank_transfer' ? 'Bank Transfer' : 
                               row.payment_method === 'upi' ? 'UPI' :
                               row.payment_method === 'cheque' ? 'Cheque' :
                               row.payment_method === 'credit_card' ? 'Credit Card' : 'Cash'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="default">Completed</Badge>
                          </TableCell>
                        </>
                      )}
                      {selectedReport === 'ledger-summary' && (
                        <>
                          <TableCell className="font-medium">{row.subcategory}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={
                              row.category === 'asset' ? 'text-green-500' :
                              row.category === 'liability' ? 'text-red-500' :
                              row.category === 'income' ? 'text-blue-500' : 'text-orange-500'
                            }>
                              {row.category}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{formatIndianCurrency(Number(row.opening_balance) || 0)}</TableCell>
                          <TableCell className="text-right">{formatIndianCurrency(Number(row.debits) || 0)}</TableCell>
                          <TableCell className="text-right">{formatIndianCurrency(Number(row.credits) || 0)}</TableCell>
                          <TableCell className="text-right">{formatIndianCurrency(Number(row.closing_balance) || 0)}</TableCell>
                        </>
                      )}
                      {selectedReport === 'return-void-report' && (
                        <>
                          <TableCell>
                            <Badge variant="destructive" className="text-xs">
                              {(row as any).record_type || 'Return'}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">{row.invoice_number || row.subcategory}</TableCell>
                          <TableCell>{row.invoice_date ? formatDate(row.invoice_date) : row.category}</TableCell>
                          <TableCell>{row.customer || row.supplier || 'N/A'}</TableCell>
                          <TableCell className="text-right">{formatIndianCurrency(row.subtotal || 0)}</TableCell>
                          <TableCell className="text-right">{formatIndianCurrency(row.tax_amount || 0)}</TableCell>
                          <TableCell className="text-right text-red-500 font-semibold">
                            {formatIndianCurrency(row.amount || 0)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-destructive">
                              {row.payment_status || 'due'}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-xs truncate" title={(row as any).notes || ''}>
                            {(row as any).notes || '-'}
                          </TableCell>
                        </>
                      )}
                      {selectedReport === 'inventory-report' && (
                        <>
                          <TableCell className="font-medium">{(row as any).product_name || row.subcategory}</TableCell>
                          <TableCell>{(row as any).hsn_code || 'N/A'}</TableCell>
                          <TableCell className="text-right">{(row as any).current_stock || 0}</TableCell>
                          <TableCell className="text-right">{formatIndianCurrency((row as any).purchase_price || 0)}</TableCell>
                          <TableCell className="text-right">{formatIndianCurrency((row as any).selling_price || 0)}</TableCell>
                          <TableCell className={`text-right ${((row as any).profit ?? 0) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {formatIndianCurrency((row as any).profit ?? ((row as any).selling_price || 0) - ((row as any).purchase_price || 0))}
                          </TableCell>
                          <TableCell className="text-right">
                            {Number((row as any).profit_margin ?? 0).toFixed(1)}%
                          </TableCell>
                          <TableCell className="text-right">{(row as any).gst_rate || 0}%</TableCell>
                          <TableCell className="text-right font-medium">{formatIndianCurrency((row as any).stock_value || row.amount || 0)}</TableCell>
                          <TableCell>
                            {(row as any).is_low_stock ? (
                              <Badge variant="destructive">Low Stock</Badge>
                            ) : (
                              <Badge variant="default">In Stock</Badge>
                            )}
                          </TableCell>
                        </>
                      )}
                      {selectedReport === 'invoice-aging' && (
                        <>
                          <TableCell className="font-medium">{row.invoice_number || row.subcategory}</TableCell>
                          <TableCell>{row.customer || 'N/A'}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={
                              row.age_category === 'Not Due Yet' ? 'text-blue-500' :
                              row.age_category === '0-30 days' ? 'text-green-500' :
                              row.age_category === '31-60 days' ? 'text-yellow-500' :
                              row.age_category === '61-90 days' ? 'text-orange-500' : 'text-red-500'
                            }>
                              {row.age_category || row.category || '0-30 days'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{formatIndianCurrency(row.total_amount || row.amount || 0)}</TableCell>
                          <TableCell className="text-right text-green-600">{formatIndianCurrency(row.total_paid || 0)}</TableCell>
                          <TableCell className="text-right font-semibold text-red-600">{formatIndianCurrency(row.amount_due || row.amount || 0)}</TableCell>
                          <TableCell>{row.due_date || row.expiration_date ? formatDate(row.due_date || row.expiration_date) : 'N/A'}</TableCell>
                          <TableCell>
                            {row.days_overdue > 0 ? (
                              <span className="text-red-600 font-medium">{row.days_overdue} days</span>
                            ) : row.days_until_due > 0 ? (
                              <span className="text-blue-600">{row.days_until_due} days</span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={
                              row.payment_status === 'paid' ? 'default' :
                              row.payment_status === 'partial' ? 'secondary' : 'destructive'
                            }>
                              {row.payment_status === 'paid' ? 'Paid' :
                               row.payment_status === 'partial' ? 'Partial' : 'Due'}
                            </Badge>
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Summary Section */}
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {selectedReport === 'profit-loss' && (
                  <>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Total Sales</p>
                      <p className="text-lg font-semibold text-green-500">
                        {formatIndianCurrency(summary.totalSales)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Total Purchases</p>
                      <p className="text-lg font-semibold text-red-500">
                        {formatIndianCurrency(summary.totalPurchases)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Gross Profit</p>
                      <p className={`text-lg font-semibold ${summary.grossProfit < 0 ? 'text-red-500' : 'text-green-500'}`}>
                        {formatIndianCurrency(Math.abs(summary.grossProfit))}
                        {summary.grossProfit < 0 && ' -'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Net Sales - COGS
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Net Profit</p>
                      <p className={`text-lg font-semibold ${summary.netProfit < 0 ? 'text-red-500' : 'text-green-500'}`}>
                        {formatIndianCurrency(Math.abs(summary.netProfit))}
                        {summary.netProfit < 0 && ' -'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Gross Profit - Indirect Exp + Indirect Income
                      </p>
                    </div>
                    
                    {/* Demo Calculation Breakdown */}
                    <div className="col-span-2 md:col-span-4 mt-4 p-4 bg-muted/50 rounded-lg">
                      <p className="text-sm font-semibold mb-3">Calculation Breakdown:</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                        <div className="space-y-1">
                          <p className="font-semibold text-sm mb-2">Cost of Goods Sold (COGS):</p>
                          <p className="text-muted-foreground">
                            Opening Stock: {formatIndianCurrency((summary as any).openingStock || 0)}
                          </p>
                          <p className="text-muted-foreground">
                            + Net Purchases: {formatIndianCurrency(summary.totalPurchases || 0)}
                          </p>
                          <p className="text-muted-foreground">
                            + Direct Expenses: {formatIndianCurrency((summary as any).directExpenses || 0)}
                          </p>
                          <p className="text-muted-foreground">
                            − Closing Stock: {formatIndianCurrency((summary as any).closingStock || 0)}
                          </p>
                          <p className="font-semibold mt-2 text-green-600">
                            = COGS: {formatIndianCurrency((summary as any).cogs || 0)}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="font-semibold text-sm mb-2">Gross Profit:</p>
                          <p className="text-muted-foreground">Net Sales: {formatIndianCurrency(summary.totalSales || 0)}</p>
                          <p className="text-muted-foreground">- COGS: {formatIndianCurrency((summary as any).cogs || 0)}</p>
                          <p className="font-semibold mt-2 text-green-600">= Gross Profit: {formatIndianCurrency(summary.grossProfit || 0)}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="font-semibold text-sm mb-2">Net Profit:</p>
                          <p className="text-muted-foreground">Gross Profit: {formatIndianCurrency(summary.grossProfit || 0)}</p>
                          <p className="text-muted-foreground">- Indirect Expenses: {formatIndianCurrency((summary as any).indirectExpenses || 0)}</p>
                          <p className="text-muted-foreground">  (Sales Discounts: {formatIndianCurrency((summary as any).salesDiscounts || 0)})</p>
                          <p className="text-muted-foreground">+ Indirect Income: {formatIndianCurrency((summary as any).indirectIncome || 0)}</p>
                          <p className="font-semibold mt-2 text-green-600">= Net Profit: {formatIndianCurrency(summary.netProfit || 0)}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="font-semibold text-sm mb-2">Closing Stock Formula (per product):</p>
                          <p className="text-muted-foreground text-xs">
                            Opening Qty = Purchases(before) − Purchase Returns(before) − Sales(before) + Sales Returns(before)
                          </p>
                          <p className="text-muted-foreground text-xs mt-1">
                            Closing Qty = Opening Qty + Purchases(period) − Purchase Returns(period) − Sales(period) + Sales Returns(period)
                          </p>
                          <p className="text-muted-foreground text-xs mt-2">
                            Closing Stock = Σ(Closing Qty × Unit Cost)
                          </p>
                          <p className="text-muted-foreground text-xs mt-2">
                            Closing Stock Value: {formatIndianCurrency((summary as any).closingStock || 0)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </>
                )}
                
                {selectedReport === 'trial-balance' && (
                  <>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Total Debits</p>
                      <p className="text-lg font-semibold text-red-500">
                        {formatIndianCurrency(summary.totalPurchases)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Total Credits</p>
                      <p className="text-lg font-semibold text-green-500">
                        {formatIndianCurrency(summary.totalSales)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Difference</p>
                      <p className={`text-lg font-semibold ${summary.netProfit < 0 ? 'text-red-500' : summary.netProfit > 0 ? 'text-blue-500' : 'text-green-500'}`}>
                        {formatIndianCurrency(Math.abs(summary.netProfit))}
                        {summary.netProfit !== 0 && (summary.netProfit < 0 ? ' (Dr)' : ' (Cr)')}
                      </p>
                    </div>
                  </>
                )}
                
                {selectedReport === 'return-void-report' && (
                  <>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Sale Returns</p>
                      <p className="text-lg font-semibold text-red-500">
                        {formatIndianCurrency(summary.totalSales)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Purchase Returns</p>
                      <p className="text-lg font-semibold text-red-500">
                        {formatIndianCurrency(summary.totalPurchases)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Total Returns</p>
                      <p className="text-lg font-semibold text-red-500">
                        {formatIndianCurrency(summary.netProfit)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Total Records</p>
                      <p className="text-lg font-semibold">
                        {reportData.length}
                      </p>
                    </div>
                  </>
                )}
                
                {selectedReport === 'inventory-report' && (
                  <>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Total Products</p>
                      <p className="text-lg font-semibold">
                        {summary.totalSales}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Total Stock Value</p>
                      <p className="text-lg font-semibold text-green-500">
                        {formatIndianCurrency(summary.totalPurchases)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Low Stock Items</p>
                      <p className="text-lg font-semibold text-destructive">
                        {summary.grossProfit}
                      </p>
                    </div>
                  </>
                )}
                
                {selectedReport === 'sales-report' && (
                  <>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Total Sales</p>
                      <p className="text-lg font-semibold text-blue-500">
                        {formatIndianCurrency(summary.totalSales)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Sale Returns</p>
                      <p className="text-lg font-semibold text-red-500">
                        {formatIndianCurrency(summary.saleReturns || 0)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Net Sales</p>
                      <p className="text-lg font-semibold text-green-500">
                        {formatIndianCurrency(summary.netSales || summary.totalSales)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Total Tax</p>
                      <p className="text-lg font-semibold text-blue-500">
                        {formatIndianCurrency(summary.grossProfit)}
                      </p>
                    </div>
                  </>
                )}
                
                {selectedReport === 'purchase-report' && (
                  <>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Total Purchases</p>
                      <p className="text-lg font-semibold text-blue-500">
                        {formatIndianCurrency(summary.totalPurchases)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Purchase Returns</p>
                      <p className="text-lg font-semibold text-red-500">
                        {formatIndianCurrency(summary.purchaseReturns || 0)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Net Purchase</p>
                      <p className="text-lg font-semibold text-green-500">
                        {formatIndianCurrency(summary.netPurchase || summary.totalPurchases)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Total Tax</p>
                      <p className="text-lg font-semibold text-blue-500">
                        {formatIndianCurrency(summary.grossProfit)}
                      </p>
                    </div>
                  </>
                )}
                
                {selectedReport === 'gst-report' && (
                  <>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Output CGST</p>
                      <p className="text-lg font-semibold text-blue-500">
                        {formatIndianCurrency((summary as any).outputCGST || 0)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Output SGST</p>
                      <p className="text-lg font-semibold text-green-500">
                        {formatIndianCurrency((summary as any).outputSGST || 0)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Output IGST</p>
                      <p className="text-lg font-semibold text-orange-500">
                        {formatIndianCurrency((summary as any).outputIGST || 0)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Input CGST</p>
                      <p className="text-lg font-semibold text-blue-400">
                        {formatIndianCurrency((summary as any).inputCGST || 0)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Input SGST</p>
                      <p className="text-lg font-semibold text-green-400">
                        {formatIndianCurrency((summary as any).inputSGST || 0)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Input IGST</p>
                      <p className="text-lg font-semibold text-orange-400">
                        {formatIndianCurrency((summary as any).inputIGST || 0)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Net GST Liability</p>
                      <p className={`text-lg font-semibold ${summary.netProfit >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                        {formatIndianCurrency(summary.netProfit || 0)}
                      </p>
                    </div>
                  </>
                )}
                
                {selectedReport === 'payment-report' && (
                  <>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Total Payments</p>
                      <p className="text-lg font-semibold text-green-500">
                        {formatIndianCurrency(summary.grossProfit)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Cash Payments</p>
                      <p className="text-lg font-semibold text-blue-500">
                        {formatIndianCurrency(5000)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Bank Transfers</p>
                      <p className="text-lg font-semibold text-purple-500">
                        {formatIndianCurrency(50000)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Other Payments</p>
                      <p className="text-lg font-semibold text-orange-500">
                        {formatIndianCurrency(40000)}
                      </p>
                    </div>
                  </>
                )}
                
                {selectedReport === 'ledger-summary' && (
                  <>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Total Assets</p>
                      <p className="text-lg font-semibold text-green-500">
                        {formatIndianCurrency(225000)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Total Liabilities</p>
                      <p className="text-lg font-semibold text-red-500">
                        {formatIndianCurrency(75000)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Total Income</p>
                      <p className="text-lg font-semibold text-blue-500">
                        {formatIndianCurrency(100000)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Total Expenses</p>
                      <p className="text-lg font-semibold text-orange-500">
                        {formatIndianCurrency(60000)}
                      </p>
                    </div>
                  </>
                )}
                
                {selectedReport === 'invoice-aging' && (
                  <>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Total Pending</p>
                      <p className="text-lg font-semibold text-red-500">
                        {formatIndianCurrency(summary.totalSales)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Total Overdue</p>
                      <p className="text-lg font-semibold text-orange-500">
                        {formatIndianCurrency(summary.totalPurchases)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Total Paid</p>
                      <p className="text-lg font-semibold text-green-500">
                        {formatIndianCurrency(summary.netProfit)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Invoices Count</p>
                      <p className="text-lg font-semibold text-blue-500">
                        {summary.grossProfit}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

        </div>
      )}

      {loading && (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Generating report...</p>
          </CardContent>
        </Card>
      )}

      {/* Floating AI Report Assistant widget (bottom-right) */}
      <ReportChatWidget reportContext={reportContext} />
    </div>
  );
};
