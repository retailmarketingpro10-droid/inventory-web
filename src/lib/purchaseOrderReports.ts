import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

export interface PurchaseOrderReportItem {
  description?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  line_total?: number | null;
  received_quantity?: number | null;
  product_id?: string | null;
}

export interface PurchaseOrderReportRow {
  id: string;
  po_number: string;
  order_date: string;
  subtotal?: number | null;
  tax_amount?: number | null;
  total_amount?: number | null;
  status?: string | null;
  supplier_id?: string | null;
  company_id?: string | null;
  user_id?: string | null;
  suppliers?: { company_name?: string | null } | null;
  purchase_order_items?: PurchaseOrderReportItem[] | null;
}

export interface PurchaseInvoiceReportRow {
  id?: string;
  invoice_number?: string | null;
  invoice_date?: string | null;
  subtotal?: number | null;
  tax_amount?: number | null;
  total_amount?: number | null;
  payment_status?: string | null;
  supplier_id?: string | null;
  purchase_order_id?: string | null;
  suppliers?: { company_name?: string | null } | null;
  business_entities?: { name?: string | null } | null;
}

export const PURCHASE_ORDER_REPORT_SELECT = `
  id,
  po_number,
  order_date,
  subtotal,
  tax_amount,
  total_amount,
  status,
  supplier_id,
  company_id,
  user_id,
  suppliers(company_name),
  purchase_order_items(
    description,
    quantity,
    unit_price,
    line_total,
    received_quantity,
    product_id
  )
`;

export async function fetchPurchaseOrdersForReport(params: {
  companyName: string;
  dateFrom: string;
  dateTo: string;
  userId?: string | null;
}): Promise<PurchaseOrderReportRow[]> {
  const { companyName, dateFrom, dateTo, userId } = params;

  let query = (supabase as any)
    .from('purchase_orders')
    .select(PURCHASE_ORDER_REPORT_SELECT)
    .gte('order_date', dateFrom)
    .lte('order_date', dateTo)
    .order('order_date', { ascending: false });

  // Include legacy PO rows saved before company_id was populated
  if (companyName && userId) {
    query = query.or(
      `company_id.eq.${companyName},and(company_id.is.null,user_id.eq.${userId})`
    );
  } else if (companyName) {
    query = query.eq('company_id', companyName);
  } else if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('Error fetching purchase orders for report:', error);
    return [];
  }

  return (data || []) as PurchaseOrderReportRow[];
}

export function sumPurchaseOrderSubtotals(orders: PurchaseOrderReportRow[]): number {
  return orders.reduce((sum, po) => sum + (Number(po.subtotal) || 0), 0);
}

export function sumPurchaseOrderTax(orders: PurchaseOrderReportRow[]): number {
  return orders.reduce((sum, po) => sum + (Number(po.tax_amount) || 0), 0);
}

export function sumPurchaseOrderTotals(orders: PurchaseOrderReportRow[]): number {
  return orders.reduce((sum, po) => sum + (Number(po.total_amount) || 0), 0);
}

/** PO ids already covered by a purchase invoice — explicit link or amount/supplier match. */
export function getInvoicedPurchaseOrderIds(
  orders: PurchaseOrderReportRow[],
  invoices: PurchaseInvoiceReportRow[]
): Set<string> {
  const invoiced = new Set<string>();

  for (const inv of invoices) {
    if (inv.purchase_order_id) {
      invoiced.add(inv.purchase_order_id);
    }
  }

  for (const po of orders) {
    if (invoiced.has(po.id)) continue;

    const poTotal = Number(po.total_amount) || 0;
    if (poTotal <= 0) continue;

    const matched = invoices.some((inv) => {
      if (inv.purchase_order_id) return false;
      if (Math.abs((Number(inv.total_amount) || 0) - poTotal) > 0.02) return false;
      if (po.supplier_id && inv.supplier_id && po.supplier_id !== inv.supplier_id) {
        return false;
      }
      if (po.order_date && inv.invoice_date) {
        return String(inv.invoice_date) >= String(po.order_date);
      }
      return true;
    });

    if (matched) invoiced.add(po.id);
  }

  return invoiced;
}

export function filterUninvoicedPurchaseOrders(
  orders: PurchaseOrderReportRow[],
  invoices: PurchaseInvoiceReportRow[]
): PurchaseOrderReportRow[] {
  const invoicedPoIds = getInvoicedPurchaseOrderIds(orders, invoices);
  return orders.filter((po) => !invoicedPoIds.has(po.id));
}

export function mapPurchaseInvoicesToReportRows(invoices: PurchaseInvoiceReportRow[]) {
  return invoices.map((inv) => ({
    subcategory: inv.invoice_number || '',
    amount: inv.total_amount || 0,
    category: inv.invoice_date
      ? new Date(inv.invoice_date).toLocaleDateString('en-IN')
      : '',
    invoice_number: inv.invoice_number,
    invoice_date: inv.invoice_date,
    supplier: inv.suppliers?.company_name || inv.business_entities?.name || 'Miscellaneous',
    subtotal: inv.subtotal || 0,
    tax_amount: inv.tax_amount || 0,
    payment_status: inv.payment_status || 'due',
    record_type: 'Purchase Invoice' as const,
    counts_toward_total: true,
  }));
}

export function mapPurchaseReturnsToReportRows(invoices: PurchaseInvoiceReportRow[]) {
  return invoices.map((inv) => ({
    subcategory: inv.invoice_number || '',
    amount: inv.total_amount || 0,
    category: inv.invoice_date
      ? new Date(inv.invoice_date).toLocaleDateString('en-IN')
      : '',
    invoice_number: inv.invoice_number,
    invoice_date: inv.invoice_date,
    supplier: inv.suppliers?.company_name || inv.business_entities?.name || 'Miscellaneous',
    subtotal: inv.subtotal || 0,
    tax_amount: inv.tax_amount || 0,
    payment_status: inv.payment_status || 'due',
    record_type: 'Purchase Return' as const,
    counts_toward_total: true,
  }));
}

export function buildPurchaseReportSummary(params: {
  purchaseInvoices: PurchaseInvoiceReportRow[];
  purchaseReturns: PurchaseInvoiceReportRow[];
}) {
  const { purchaseInvoices, purchaseReturns } = params;

  const invoiceSubtotal = purchaseInvoices.reduce(
    (sum, inv) => sum + (Number(inv.subtotal) || 0),
    0
  );
  const totalPurchaseReturns = purchaseReturns.reduce(
    (sum, inv) => sum + (Number(inv.subtotal) || 0),
    0
  );

  const invoiceTax = purchaseInvoices.reduce(
    (sum, inv) => sum + (Number(inv.tax_amount) || 0),
    0
  );
  const totalReturnTax = purchaseReturns.reduce(
    (sum, inv) => sum + (Number(inv.tax_amount) || 0),
    0
  );

  const invoiceTotal = purchaseInvoices.reduce(
    (sum, inv) => sum + (Number(inv.total_amount) || 0),
    0
  );
  const totalReturnAmount = purchaseReturns.reduce(
    (sum, inv) => sum + (Number(inv.total_amount) || 0),
    0
  );

  const netPurchase = invoiceSubtotal - totalPurchaseReturns;
  const netTax = invoiceTax - totalReturnTax;
  const netAmount = invoiceTotal - totalReturnAmount;

  return {
    totalSales: 0,
    totalPurchases: invoiceSubtotal,
    grossProfit: netTax,
    netProfit: netAmount,
    purchaseReturns: totalPurchaseReturns,
    netPurchase,
    totalTax: invoiceTax,
    totalReturnTax,
    netPurchaseTax: netTax,
  };
}

export function mapPurchaseOrdersToReportRows(orders: PurchaseOrderReportRow[]) {
  return orders.map((po) => {
    const items = po.purchase_order_items || [];
    const totalItems = items.length;
    const totalQuantity = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
    const receivedQuantity = items.reduce(
      (sum, item) => sum + (Number(item.received_quantity) || 0),
      0
    );

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
      record_type: 'PO',
      counts_toward_total: false,
    };
  });
}
