import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

export interface PurchaseLineItemForPoMatch {
  product_id?: string | null;
  quantity: number;
}

export interface PoReceiptStockItem {
  product_id: string | null;
  receiveQty: number;
  description?: string;
}

/**
 * Purchase invoice linked to a PO records accounting only — stock moves on PO receipt.
 */
export function shouldSkipPurchaseInvoiceStockUpdate(
  invoiceType: string,
  selectedPoId?: string | null
): boolean {
  return invoiceType === 'purchase' && Boolean(selectedPoId);
}

/**
 * Increase product stock when goods are received against a purchase order.
 */
export async function applyPoReceiptStockUpdates(params: {
  items: PoReceiptStockItem[];
  companyId?: string | null;
}): Promise<{ updated: number; failed: number; messages: string[] }> {
  let updated = 0;
  let failed = 0;
  const messages: string[] = [];

  for (const item of params.items) {
    if (!item.product_id || item.receiveQty <= 0) continue;

    let fetchQuery: any = supabase
      .from('products')
      .select('current_stock, name')
      .eq('id', item.product_id);

    if (params.companyId) {
      fetchQuery = fetchQuery.eq('company_id', params.companyId);
    }

    const { data: productData, error: fetchErr } = await fetchQuery.single();
    if (fetchErr || !productData) {
      failed++;
      messages.push(
        `Could not update stock for ${item.description || item.product_id}: ${fetchErr?.message || 'Product not found'}`
      );
      continue;
    }

    const newStock = (Number(productData.current_stock) || 0) + item.receiveQty;
    let updateQuery: any = supabase
      .from('products')
      .update({ current_stock: newStock })
      .eq('id', item.product_id);

    if (params.companyId) {
      updateQuery = updateQuery.eq('company_id', params.companyId);
    }

    const { error: updateError } = await updateQuery;
    if (updateError) {
      failed++;
      messages.push(`Failed to update stock for ${productData.name}`);
      logger.error('applyPoReceiptStockUpdates:', updateError);
    } else {
      updated++;
    }
  }

  return { updated, failed, messages };
}

/**
 * Link a purchase invoice to its PO for reference (PO does not affect inventory or purchase reports).
 */
export async function resolvePurchaseOrderIdForInvoice(params: {
  companyId: string;
  invoiceType: string;
  totalAmount: number;
  lineItems: PurchaseLineItemForPoMatch[];
  explicitPoId?: string | null;
}): Promise<string | null> {
  if (params.invoiceType !== 'purchase') return null;
  if (params.explicitPoId) return params.explicitPoId;

  try {
    const { data: orders, error } = await (supabase as any)
      .from('purchase_orders')
      .select(
        `
        id,
        total_amount,
        order_date,
        status,
        purchase_order_items(product_id, quantity, received_quantity)
      `
      )
      .eq('company_id', params.companyId)
      .in('status', ['received', 'partial', 'sent', 'draft'])
      .order('order_date', { ascending: false });

    if (error) {
      logger.error('resolvePurchaseOrderIdForInvoice:', error);
      return null;
    }

    const targetTotal = Number(params.totalAmount) || 0;
    const invoiceLines = params.lineItems.filter((li) => li.product_id && li.quantity > 0);

    for (const po of orders || []) {
      if (Math.abs((Number(po.total_amount) || 0) - targetTotal) > 0.02) continue;

      const poItems = po.purchase_order_items || [];
      if (!invoiceLines.length) {
        return po.id as string;
      }

      const linesMatch = invoiceLines.every((line) => {
        const poItem = poItems.find(
          (item: { product_id?: string | null }) => item.product_id === line.product_id
        );
        return Boolean(poItem);
      });

      if (linesMatch) return po.id as string;
    }
  } catch (err) {
    logger.error('resolvePurchaseOrderIdForInvoice failed:', err);
  }

  return null;
}
