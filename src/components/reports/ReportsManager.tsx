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
import {
  fetchPurchaseOrdersForReport,
  mapPurchaseOrdersToReportRows,
  sumPurchaseOrderSubtotals,
  sumPurchaseOrderTax,
  sumPurchaseOrderTotals,
} from '@/lib/purchaseOrderReports';
import {
  generateBalanceSheetFromLedger,
  generateLedgerSummaryFromLedger,
  generateProfitAndLossFromLedger,
  generateTrialBalanceFromLedger,
} from '@/services/ledgerReportService';
import { generatePaymentReport, paymentMethodLabel } from '@/services/paymentReportService';
import { ReportChatWidget } from '@/components/reports/ReportChatWidget';
import { GSTSyncService } from '@/services/gstSyncService';
import { getCurrentFinancialYear } from '@/utils/indianBusiness';
import { getInventoryAsOf } from '@/services/inventoryValuationService';
import { getFinancialYearForDate } from '@/utils/indianBusiness';

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
  
  // Added from TS fix
  total_amount?: number;
  expiration_date?: string;
  opening_balance?: number;
  debits?: number;
  credits?: number;
  closing_balance?: number;
  closing_debit?: number;
  closing_credit?: number;
  taxable_amount?: number;
  total_paid?: number;
  amount_due?: number;
  days_overdue?: number;
  days_until_due?: number;
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
  // Added from TS fix
  directExpenses?: number;
  totalTax?: number;
  totalReturnTax?: number;
  netPurchaseTax?: number;
  legacyEntries?: number;
  inputCGST?: number;
  inputSGST?: number;
  inputIGST?: number;
  outputCGST?: number;
  outputSGST?: number;
  outputIGST?: number;
  netCGST?: number;
  netSGST?: number;
  netIGST?: number;
  valuationMode?: string;
  periodCredits?: number;
  totalAssets?: number;
  totalLiabilities?: number;
  totalEquity?: number;
  retainedEarnings?: number;
}

const REPORT_TYPES = [
  { id: 'profit-loss', name: 'Profit & Loss Statement', icon: <TrendingUp className="h-4 w-4" /> },
  { id: 'balance-sheet', name: 'Balance Sheet', icon: <TrendingUp className="h-4 w-4" /> },
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
  const [inventoryAsOfMode, setInventoryAsOfMode] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
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
          try {
            const { data: { user: plUser } } = await supabase.auth.getUser();
            if (!plUser?.id) throw new Error('User not authenticated');
            const pl = await generateProfitAndLossFromLedger({
              companyName: selectedCompany.company_name,
              userId: plUser.id,
              dateFrom,
              dateTo,
            });
            sampleData = pl.rows;
            newSummary = {
              ...pl.summary,
              saleReturns: 0,
              purchaseReturns: 0,
            };
          } catch (error: any) {
            logger.error('P&L from ledger error:', error);
            toast({
              title: 'Error',
              description: error.message || 'Failed to generate P&L from ledger',
              variant: 'destructive',
            });
          }
          break;
        }

        case 'sales-report': {
          // Fetch sales invoices
          const { data: salesData, error: salesDataError } = await (supabase as any).from('invoices')
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
          const { data: saleReturns, error: returnError } = await (supabase as any).from('invoices')
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
          const { data: { user: reportUser } } = await supabase.auth.getUser();
          const purchaseOrders = await fetchPurchaseOrdersForReport({
            companyName: selectedCompany.company_name,
            dateFrom,
            dateTo,
            userId: reportUser?.id,
          });

          // Fetch purchase invoices
          const { data: purchaseInvoices, error: invoiceError } = await (supabase as any).from('invoices')
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
          const { data: purchaseReturns, error: returnError } = await (supabase as any).from('invoices')
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
          const poRows = mapPurchaseOrdersToReportRows(purchaseOrders);

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
          const totalPO = sumPurchaseOrderSubtotals(purchaseOrders);
          const totalPurchases = (purchaseInvoices || []).reduce((sum, inv) => sum + (inv.subtotal || 0), 0);
          const totalPurchaseReturns = (purchaseReturns || []).reduce((sum, inv) => sum + (inv.subtotal || 0), 0);
          
          const totalTax = sumPurchaseOrderTax(purchaseOrders) +
                          (purchaseInvoices || []).reduce((sum, inv) => sum + (inv.tax_amount || 0), 0);
          const totalReturnTax = (purchaseReturns || []).reduce((sum, inv) => sum + (inv.tax_amount || 0), 0);
          
          const totalAmount = sumPurchaseOrderTotals(purchaseOrders) +
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
          const { data: agingInvoices, error: agingError } = await (supabase as any).from('invoices')
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
              const { data: paymentsData, error: paymentsError } = await (supabase as any)
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
            const { data: { user: tbUser } } = await supabase.auth.getUser();
            if (!tbUser?.id) throw new Error('User not authenticated');
            const tb = await generateTrialBalanceFromLedger({
              companyName: selectedCompany.company_name,
              userId: tbUser.id,
              dateFrom,
              dateTo,
            });
            sampleData = tb.rows;
            newSummary = tb.summary;
            if (tb.rows.length === 0) {
              toast({
                title: 'No Ledgers Found',
                description: 'Create ledgers and post invoice vouchers first.',
                variant: 'default',
              });
            }
          } catch (error: any) {
            logger.error('Trial balance error:', error);
            toast({
              title: 'Error',
              description: error.message || 'Failed to generate trial balance',
              variant: 'destructive',
            });
          }
          break;
        }
        case 'balance-sheet': {
          try {
            const { data: { user: bsUser } } = await supabase.auth.getUser();
            if (!bsUser?.id) throw new Error('User not authenticated');
            const bs = await generateBalanceSheetFromLedger({
              companyName: selectedCompany.company_name,
              userId: bsUser.id,
              dateFrom,
              dateTo,
            });
            sampleData = bs.rows;
            newSummary = bs.summary;
          } catch (error: any) {
            logger.error('Balance Sheet Error:', error);
            toast({
              title: 'Error',
              description: error.message || 'Failed to generate balance sheet',
              variant: 'destructive',
            });
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
            
            const { data, error } = await (supabase as any).from('gst_entries')
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
            if (!user?.id) throw new Error('User not authenticated');

            const pr = await generatePaymentReport({
              companyName: selectedCompany.company_name,
              userId: user.id,
              dateFrom,
              dateTo,
            });
            sampleData = pr.rows;
            newSummary = pr.summary;
          } catch (error: any) {
            logger.error('Payment report error:', error);
            toast({
              title: 'Error',
              description: error?.message || 'Failed to generate payment report',
              variant: 'destructive',
            });
            sampleData = [];
            newSummary = {
              totalSales: 0,
              totalPurchases: 0,
              grossProfit: 0,
              netProfit: 0,
              cashTotal: 0,
              bankTotal: 0,
              otherTotal: 0,
              totalPayments: 0,
            };
          }
          break;
        }
        
        case 'ledger-summary': {
          try {
            const { data: { user: lsUser } } = await supabase.auth.getUser();
            if (!lsUser?.id) throw new Error('User not authenticated');
            const ls = await generateLedgerSummaryFromLedger({
              companyName: selectedCompany.company_name,
              userId: lsUser.id,
              dateFrom,
              dateTo,
            });
            sampleData = ls.rows;
            newSummary = ls.summary;
          } catch (error: any) {
            logger.error('Ledger summary error:', error);
            toast({
              title: 'Error',
              description: error.message || 'Failed to generate ledger summary',
              variant: 'destructive',
            });
          }
          break;
        }

        case 'return-void-report': {
          // Fetch all return/refund invoices (treated as void but kept for record-keeping)
          try {
            const { data: saleReturns, error: saleReturnsError } = await (supabase as any).from('invoices')
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

            const { data: purchaseReturns, error: purchaseReturnsError } = await (supabase as any).from('invoices')
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
            if (inventoryAsOfMode) {
              // Movement-based inventory snapshot as-of dateTo (period-correct)
              const asOf = await getInventoryAsOf({
                companyId: selectedCompany.company_name,
                asOfDate: dateTo,
              });

              const { data: productsExtra, error: productsExtraError } = await (supabase as any)
                .from("products")
                .select("id, selling_price, min_stock_level, description")
                .eq("company_id", selectedCompany.company_name);

              if (productsExtraError) {
                logger.error("Error fetching product extras:", productsExtraError);
              }

              const extraMap = new Map<string, any>(
                (productsExtra || []).map((p: any) => [String(p.id), p])
              );

              sampleData = asOf.map((row) => {
                const extra = extraMap.get(String(row.product_id)) || {};
                const sellingPrice = Number(extra.selling_price) || 0;
                const minStock = Number(extra.min_stock_level) || 0;
                const profit = sellingPrice - (row.unit_cost || 0);
                const profitMargin =
                  (row.unit_cost || 0) > 0 ? (profit / (row.unit_cost || 0)) * 100 : 0;

                return {
                  subcategory: row.product_name || "Unknown",
                  amount: row.stock_value,
                  category: extra.description || "",
                  product_name: row.product_name,
                  hsn_code: row.hsn_code || "",
                  current_stock: row.quantity_as_of,
                  purchase_price: row.unit_cost,
                  selling_price: sellingPrice,
                  gst_rate: row.gst_rate || 0,
                  min_stock_level: minStock,
                  stock_value: row.stock_value,
                  is_low_stock: minStock > 0 && (row.quantity_as_of || 0) < minStock,
                  profit,
                  profit_margin: profitMargin,
                  valuation_mode: "as_of",
                };
              });
            } else {
              // Live snapshot using product master current_stock
              const { data: products, error: productsError } = await (supabase as any).from('products')
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
            }

            // Calculate totals
            const totalProducts = sampleData.length || 0;
            const totalStockValue = sampleData.reduce((sum, item: any) => sum + (item.stock_value || 0), 0);
            const lowStockCount = sampleData.filter((item: any) => item.is_low_stock).length;

            newSummary = {
              totalSales: totalProducts,
              totalPurchases: totalStockValue,
              grossProfit: lowStockCount,
              netProfit: totalStockValue,
              valuationMode: inventoryAsOfMode ? `as-of ${dateTo}` : "live",
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
          if ((summary as any).totalAssets) {
            summaryItems.push({
              label: 'Total Assets',
              value: (summary as any).totalAssets,
              format: 'currency' as const,
            });
          }
          if ((summary as any).totalLiabilities) {
            summaryItems.push({
              label: 'Total Liabilities',
              value: (summary as any).totalLiabilities,
              format: 'currency' as const,
            });
          }
          if ((summary as any).totalIncome) {
            summaryItems.push({
              label: 'Total Income',
              value: (summary as any).totalIncome,
              format: 'currency' as const,
            });
          }
          if ((summary as any).totalExpenses) {
            summaryItems.push({
              label: 'Total Expenses',
              value: (summary as any).totalExpenses,
              format: 'currency' as const,
            });
          }
        } else if (selectedReport === 'payment-report') {
          if (summary.totalSales) {
            summaryItems.push({ label: 'Total Receipts', value: summary.totalSales, format: 'currency' as const });
          }
          if (summary.totalPurchases) {
            summaryItems.push({ label: 'Total Payments Out', value: summary.totalPurchases, format: 'currency' as const });
          }
          if ((summary as any).cashTotal) {
            summaryItems.push({ label: 'Cash', value: (summary as any).cashTotal, format: 'currency' as const });
          }
          if ((summary as any).bankTotal) {
            summaryItems.push({ label: 'Bank / UPI', value: (summary as any).bankTotal, format: 'currency' as const });
          }
        } else {
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

          {selectedReport === "inventory-report" && (
            <div className="mt-4 flex items-center justify-between rounded-md border p-3 bg-muted/30">
              <div>
                <p className="text-sm font-medium">Valuation Mode</p>
                <p className="text-xs text-muted-foreground">
                  Live uses product current stock. As-of uses invoice movements + opening stock up to the selected To Date.
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm select-none">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={inventoryAsOfMode}
                  onChange={(e) => setInventoryAsOfMode(e.target.checked)}
                />
                Use as-of date
              </label>
            </div>
          )}
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
                    {selectedReport === 'balance-sheet' && 'Balance Sheet'}
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
                <div className="flex items-center gap-2">
                  {(selectedReport === "profit-loss" ||
                    selectedReport === "trial-balance" ||
                    selectedReport === "inventory-report") && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowValidation((v) => !v)}
                      title="Show reconciliation/validation details"
                    >
                      {showValidation ? "Hide Validation" : "Show Validation"}
                    </Button>
                  )}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>Generated: {generatedTime}</span>
                  </div>
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
                    {selectedReport === 'balance-sheet' && (
                      <>
                        <TableHead>Account Name</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </>
                    )}
                    {selectedReport === 'trial-balance' && (
                      <>
                        <TableHead>Ledger Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Opening</TableHead>
                        <TableHead className="text-right">Dr (Pd)</TableHead>
                        <TableHead className="text-right">Cr (Pd)</TableHead>
                        <TableHead className="text-right">Closing Dr</TableHead>
                        <TableHead className="text-right">Closing Cr</TableHead>
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
                            {(() => {
                              const isDeduction = String(row.subcategory || '').startsWith('Less:');
                              const isProfitLine =
                                row.category === 'Gross Profit' ||
                                row.category === 'Gross Loss' ||
                                row.category === 'Net Profit' ||
                                row.category === 'Net Loss';
                              const amount = Number(row.amount) || 0;
                              const displayAmount = Math.abs(amount);
                              const isLoss = isProfitLine ? amount < 0 : false;
                              return (
                                <span
                                  className={
                                    isLoss
                                      ? 'text-red-500'
                                      : isDeduction
                                        ? 'text-orange-500'
                                        : amount < 0
                                          ? 'text-red-500'
                                          : 'text-green-500'
                                  }
                                >
                                  {isDeduction || isLoss ? '−' : ''}
                                  {formatIndianCurrency(displayAmount)}
                                </span>
                              );
                            })()}
                          </TableCell>
                        </>
                      )}
                      {selectedReport === 'trial-balance' && (
                        <>
                          <TableCell className="font-medium">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate">{row.subcategory}</span>
                              {(Number((row as any).legacy_entries) || 0) > 0 && (
                                <Badge variant="outline" className="text-xs">
                                  Legacy {(row as any).legacy_entries}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{row.category}</TableCell>
                          <TableCell className="text-right text-muted-foreground text-xs">{formatIndianCurrency(Number(row.opening_balance) || 0)}</TableCell>
                          <TableCell className="text-right text-muted-foreground text-xs">{formatIndianCurrency(Number(row.debits) || 0)}</TableCell>
                          <TableCell className="text-right text-muted-foreground text-xs">{formatIndianCurrency(Number(row.credits) || 0)}</TableCell>
                          <TableCell className="text-right font-semibold text-green-600">
                            {Number((row as any).closing_debit) > 0 ? formatIndianCurrency(Number((row as any).closing_debit)) : '-'}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-red-600">
                            {Number((row as any).closing_credit) > 0 ? formatIndianCurrency(Number((row as any).closing_credit)) : '-'}
                          </TableCell>
                        </>
                      )}
                      {selectedReport === 'balance-sheet' && (
                        <>
                          <TableCell className="font-medium">{row.subcategory}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={
                              row.category === 'Asset' ? 'text-green-500' :
                              row.category === 'Liability' ? 'text-red-500' : 'text-blue-500'
                            }>
                              {row.category}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">{formatIndianCurrency(row.amount)}</TableCell>
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
                          <TableCell className="font-medium">{row.record_type || 'Payment'}</TableCell>
                          <TableCell>
                            {row.payment_date
                              ? formatDate(row.payment_date)
                              : row.invoice_date
                                ? formatDate(row.invoice_date)
                                : row.category}
                          </TableCell>
                          <TableCell>{row.invoice_number || row.subcategory || '—'}</TableCell>
                          <TableCell className="text-right">{formatIndianCurrency(row.amount)}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {paymentMethodLabel(row.payment_method || 'cash')}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="default">
                              {row.payment_status === 'completed' ? 'Completed' : row.payment_status || 'Completed'}
                            </Badge>
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
                      <p className="text-sm text-muted-foreground">
                        {summary.grossProfit < 0 ? 'Gross Loss' : 'Gross Profit'}
                      </p>
                      <p className={`text-lg font-semibold ${summary.grossProfit < 0 ? 'text-red-500' : 'text-green-500'}`}>
                        {summary.grossProfit < 0 ? '−' : ''}
                        {formatIndianCurrency(Math.abs(summary.grossProfit))}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Net Sales − COGS
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">
                        {summary.netProfit < 0 ? 'Net Loss' : 'Net Profit'}
                      </p>
                      <p className={`text-lg font-semibold ${summary.netProfit < 0 ? 'text-red-500' : 'text-green-500'}`}>
                        {summary.netProfit < 0 ? '−' : ''}
                        {formatIndianCurrency(Math.abs(summary.netProfit))}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Gross Profit - Indirect Exp + Indirect Income
                      </p>
                    </div>
                    
                    {showValidation && (
                      <div className="col-span-2 md:col-span-4 mt-4 p-4 bg-muted/50 rounded-lg">
                        <p className="text-sm font-semibold mb-3">Validation (P&amp;L reconciliation)</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                          <div className="space-y-1">
                            <p className="font-semibold text-sm mb-2">Cost of Goods Sold (COGS)</p>
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
                            <p className="font-semibold text-sm mb-2">Profit</p>
                            <p className="text-muted-foreground">
                              Net Sales: {formatIndianCurrency(summary.totalSales || 0)}
                            </p>
                            <p className="text-muted-foreground">
                              Gross Profit: {formatIndianCurrency(summary.grossProfit || 0)}
                            </p>
                            <p className="text-muted-foreground">
                              Indirect Expenses: {formatIndianCurrency((summary as any).indirectExpenses || 0)}
                            </p>
                            <p className="text-muted-foreground">
                              Indirect Income: {formatIndianCurrency((summary as any).indirectIncome || 0)}
                            </p>
                            <p className="font-semibold mt-2 text-green-600">
                              Net Profit: {formatIndianCurrency(summary.netProfit || 0)}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
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
                      <p className="text-sm text-muted-foreground">Difference (Dr - Cr)</p>
                      <p className={`text-lg font-semibold ${summary.netProfit !== 0 ? 'text-red-500' : 'text-green-500'}`}>
                        {formatIndianCurrency(Math.abs(summary.netProfit))}
                        {summary.netProfit !== 0 && (summary.netProfit < 0 ? ' (Dr)' : ' (Cr)')}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Legacy Lines</p>
                      <p className={`text-lg font-semibold ${(summary as any).legacyEntries > 0 ? 'text-warning' : ''}`}>
                        {Number((summary as any).legacyEntries || 0)}
                      </p>
                    </div>
                    {showValidation && (
                      <div className="col-span-2 md:col-span-4 mt-4 p-4 bg-muted/50 rounded-lg">
                        <p className="text-sm font-semibold mb-3">Validation (Trial Balance)</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                          <div className="space-y-1">
                            <p className="text-muted-foreground">
                              Total Debits: {formatIndianCurrency(summary.totalPurchases || 0)}
                            </p>
                            <p className="text-muted-foreground">
                              Total Credits: {formatIndianCurrency(summary.totalSales || 0)}
                            </p>
                            <p className="font-semibold mt-2">
                              Difference: {formatIndianCurrency(Math.abs(summary.netProfit || 0))}{summary.netProfit ? (summary.netProfit < 0 ? " (Dr)" : " (Cr)") : ""}
                            </p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-muted-foreground">
                              Legacy Lines (no transaction id): {Number((summary as any).legacyEntries || 0)}
                            </p>
                            <p className="text-muted-foreground">
                              New postings are linked + balanced via ledger transactions.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
                
                {selectedReport === 'balance-sheet' && (
                  <>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Total Assets</p>
                      <p className="text-lg font-semibold text-green-500">
                        {formatIndianCurrency(summary.totalAssets || 0)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Total Liabilities</p>
                      <p className="text-lg font-semibold text-red-500">
                        {formatIndianCurrency(summary.totalLiabilities || 0)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Total Equity</p>
                      <p className="text-lg font-semibold text-blue-500">
                        {formatIndianCurrency(summary.totalEquity || 0)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Status</p>
                      <p className="text-lg font-semibold text-green-600">
                        Balanced
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
                    {showValidation && (
                      <div className="col-span-2 md:col-span-4 mt-4 p-4 bg-muted/50 rounded-lg">
                        <p className="text-sm font-semibold mb-3">Validation (Inventory valuation)</p>
                        <p className="text-xs text-muted-foreground">
                          Mode: {(summary as any).valuationMode || (inventoryAsOfMode ? `as-of ${dateTo}` : "live")}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          As-of mode values stock using opening stock + invoice movements up to the To Date, at unit cost (purchase price or derived opening cost).
                        </p>
                      </div>
                    )}
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
                      <p className="text-sm text-muted-foreground">Total Receipts</p>
                      <p className="text-lg font-semibold text-green-500">
                        {formatIndianCurrency(summary.totalSales || 0)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Total Payments Out</p>
                      <p className="text-lg font-semibold text-red-500">
                        {formatIndianCurrency(summary.totalPurchases || 0)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Cash</p>
                      <p className="text-lg font-semibold text-blue-500">
                        {formatIndianCurrency((summary as any).cashTotal || 0)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Bank / UPI / Cheque</p>
                      <p className="text-lg font-semibold text-purple-500">
                        {formatIndianCurrency((summary as any).bankTotal || 0)}
                      </p>
                    </div>
                  </>
                )}
                
                {selectedReport === 'ledger-summary' && (
                  <>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Total Assets</p>
                      <p className="text-lg font-semibold text-green-500">
                        {formatIndianCurrency((summary as any).totalAssets || 0)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Total Liabilities</p>
                      <p className="text-lg font-semibold text-red-500">
                        {formatIndianCurrency((summary as any).totalLiabilities || 0)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Total Income</p>
                      <p className="text-lg font-semibold text-blue-500">
                        {formatIndianCurrency((summary as any).totalIncome || 0)}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground">Total Expenses</p>
                      <p className="text-lg font-semibold text-orange-500">
                        {formatIndianCurrency((summary as any).totalExpenses || 0)}
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
