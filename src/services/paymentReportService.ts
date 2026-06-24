import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

export interface PaymentReportParams {
  companyName: string;
  userId: string;
  dateFrom: string;
  dateTo: string;
}

export interface PaymentReportRow {
  subcategory: string;
  amount: number;
  category: string;
  invoice_number: string;
  invoice_date: string;
  payment_date: string;
  payment_method: string;
  payment_status: string;
  record_type: string;
  party: string;
  invoice_type: string;
}

const BANK_METHODS = new Set([
  'bank',
  'bank_transfer',
  'cheque',
  'upi',
  'credit_card',
]);

function paymentMethodLabel(method: string): string {
  switch (method) {
    case 'bank_transfer':
      return 'Bank Transfer';
    case 'cheque':
      return 'Cheque';
    case 'upi':
      return 'UPI';
    case 'credit_card':
      return 'Credit Card';
    case 'other':
      return 'Other';
    default:
      return 'Cash';
  }
}

function isBankMethod(method: string): boolean {
  return BANK_METHODS.has(method);
}

/** Payment report from recorded invoice_payments (no duplicate invoice + ledger rows). */
export async function generatePaymentReport(params: PaymentReportParams) {
  const { companyName, userId, dateFrom, dateTo } = params;

  const { data: payments, error } = await (supabase as any)
    .from('invoice_payments')
    .select(
      `
      id,
      amount,
      payment_date,
      payment_method,
      notes,
      invoice_id,
      invoices!inner (
        invoice_number,
        invoice_date,
        invoice_type,
        payment_status,
        company_id,
        business_entities (name),
        suppliers (company_name)
      )
    `
    )
    .eq('user_id', userId)
    .gte('payment_date', dateFrom)
    .lte('payment_date', dateTo)
    .eq('invoices.company_id', companyName)
    .order('payment_date', { ascending: false });

  if (error) {
    logger.error('paymentReportService: load payments', error);
    throw error;
  }

  const rows: PaymentReportRow[] = (payments || []).map((p: any) => {
    const inv = p.invoices || {};
    const isSales =
      inv.invoice_type === 'sales' || inv.invoice_type === 'sale_return';
    const party =
      inv.business_entities?.name || inv.suppliers?.company_name || 'N/A';
    const method = p.payment_method || 'cash';

    return {
      subcategory: inv.invoice_number || '—',
      amount: Number(p.amount) || 0,
      category: p.payment_date,
      invoice_number: inv.invoice_number || '',
      invoice_date: inv.invoice_date || '',
      payment_date: p.payment_date,
      payment_method: method,
      payment_status: 'completed',
      record_type: isSales ? 'Receipt' : 'Payment',
      party,
      invoice_type: inv.invoice_type || '',
    };
  });

  let cashTotal = 0;
  let bankTotal = 0;
  let otherTotal = 0;
  let receiptsTotal = 0;
  let paymentsOutTotal = 0;

  rows.forEach((row) => {
    const method = row.payment_method;
    if (isBankMethod(method)) bankTotal += row.amount;
    else if (method === 'cash') cashTotal += row.amount;
    else otherTotal += row.amount;

    if (row.record_type === 'Receipt') receiptsTotal += row.amount;
    else paymentsOutTotal += row.amount;
  });

  return {
    rows,
    summary: {
      totalSales: receiptsTotal,
      totalPurchases: paymentsOutTotal,
      grossProfit: rows.length,
      netProfit: receiptsTotal - paymentsOutTotal,
      cashTotal,
      bankTotal,
      otherTotal,
      totalPayments: rows.length,
    },
  };
}

export { paymentMethodLabel, isBankMethod };
