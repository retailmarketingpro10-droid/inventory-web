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
  company_id?: string | null;
  user_id?: string | null;
  suppliers?: { company_name?: string | null } | null;
  purchase_order_items?: PurchaseOrderReportItem[] | null;
}

export const PURCHASE_ORDER_REPORT_SELECT = `
  id,
  po_number,
  order_date,
  subtotal,
  tax_amount,
  total_amount,
  status,
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
    };
  });
}
