import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

export interface PurchaseLineItemForPoMatch {
  product_id?: string | null;
  quantity: number;
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
