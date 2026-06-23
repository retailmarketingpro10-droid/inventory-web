import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

export interface EligibleOriginalInvoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  entity_id: string | null;
  entity_type: string | null;
  payment_status: string;
}

export interface ReturnableLineItem {
  product_id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  gst_rate: number;
  max_quantity: number;
}

function itemKey(productId: string | null | undefined, description: string) {
  return `${productId || ''}::${(description || '').trim().toLowerCase()}`;
}

export function isReturnInvoiceType(invoiceType: string) {
  return invoiceType === 'sale_return' || invoiceType === 'purchase_return';
}

export function originalInvoiceTypeForReturn(returnType: string) {
  return returnType === 'sale_return' ? 'sales' : 'purchase';
}

export async function fetchEligibleOriginalInvoices(params: {
  companyName: string;
  returnType: string;
  entityId?: string;
}): Promise<EligibleOriginalInvoice[]> {
  const sourceType = originalInvoiceTypeForReturn(params.returnType);

  let query = (supabase as any)
    .from('invoices')
    .select('id, invoice_number, invoice_date, total_amount, entity_id, entity_type, payment_status')
    .eq('company_id', params.companyName)
    .eq('invoice_type', sourceType)
    .order('invoice_date', { ascending: false });

  if (params.entityId) {
    query = query.eq('entity_id', params.entityId);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('fetchEligibleOriginalInvoices:', error);
    return [];
  }

  return (data || []) as EligibleOriginalInvoice[];
}

export async function loadReturnableLineItems(
  originalInvoiceId: string
): Promise<ReturnableLineItem[]> {
  const { data: originalItems, error: itemsError } = await (supabase as any)
    .from('invoice_items')
    .select('product_id, description, quantity, unit_price, gst_rate')
    .eq('invoice_id', originalInvoiceId);

  if (itemsError) {
    logger.error('loadReturnableLineItems: original items', itemsError);
    throw itemsError;
  }

  const { data: priorReturns, error: returnsError } = await (supabase as any)
    .from('invoices')
    .select('id, invoice_items(product_id, description, quantity)')
    .eq('original_invoice_id', originalInvoiceId)
    .in('invoice_type', ['sale_return', 'purchase_return']);

  if (returnsError) {
    logger.error('loadReturnableLineItems: prior returns', returnsError);
    throw returnsError;
  }

  const returnedQty = new Map<string, number>();
  for (const ret of priorReturns || []) {
    for (const item of ret.invoice_items || []) {
      const key = itemKey(item.product_id, item.description);
      returnedQty.set(
        key,
        (returnedQty.get(key) || 0) + (Number(item.quantity) || 0)
      );
    }
  }

  return (originalItems || []).map((item: any) => {
    const key = itemKey(item.product_id, item.description);
    const originalQty = Number(item.quantity) || 0;
    const alreadyReturned = returnedQty.get(key) || 0;
    const maxQty = Math.max(0, originalQty - alreadyReturned);

    return {
      product_id: item.product_id || undefined,
      description: item.description,
      quantity: 0,
      unit_price: Number(item.unit_price) || 0,
      gst_rate: Number(item.gst_rate) || 18,
      max_quantity: maxQty,
    };
  });
}

export async function fetchOriginalInvoiceSummary(invoiceId: string) {
  const { data, error } = await (supabase as any)
    .from('invoices')
    .select('id, invoice_number, entity_id, entity_type, invoice_date, total_amount')
    .eq('id', invoiceId)
    .single();

  if (error) throw error;
  return data;
}
