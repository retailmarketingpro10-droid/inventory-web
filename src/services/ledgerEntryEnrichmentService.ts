import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

export interface LedgerEntryPaymentSummary {
  invoiceTotal: number;
  totalPaid: number;
  amountDue: number;
  isPaymentVoucher: boolean;
  invoiceNumber?: string;
}

interface LedgerEntryRow {
  id: string;
  transaction_id?: string | null;
  description?: string;
  debit_amount: number;
  credit_amount: number;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function extractInvoiceNumber(description?: string): string | null {
  if (!description) return null;
  const match = description.match(/INV-\d{6}-\d+/i);
  return match ? match[0].toUpperCase() : null;
}

function derivePaymentStatus(summary: {
  totalPaid: number;
  amountDue: number;
}): 'paid' | 'partial' | 'due' {
  if (summary.amountDue <= 0 && summary.totalPaid > 0) return 'paid';
  if (summary.totalPaid > 0 && summary.amountDue > 0) return 'partial';
  return 'due';
}

export function resolvePartyEntryStatus(
  storedStatus: string,
  ledgerType: string,
  summary?: LedgerEntryPaymentSummary
): string {
  const party =
    (ledgerType || '').toLowerCase() === 'receivables' ||
    (ledgerType || '').toLowerCase() === 'payables';

  if (!party || !summary || summary.isPaymentVoucher) {
    return storedStatus;
  }

  return derivePaymentStatus(summary);
}

/** Attach invoice payment totals to ledger rows (for partial / due display on party ledgers). */
export async function enrichLedgerEntriesWithPayments(
  entries: LedgerEntryRow[],
  userId: string,
  companyId?: string | null
): Promise<Map<string, LedgerEntryPaymentSummary>> {
  const result = new Map<string, LedgerEntryPaymentSummary>();
  const txIds = [
    ...new Set(entries.map((e) => e.transaction_id).filter(Boolean)),
  ] as string[];

  const txMap = new Map<string, { invoice_id?: string; voucher_type?: string }>();
  if (txIds.length) {
    const { data: txs, error: txError } = await (supabase as any)
      .from('ledger_transactions')
      .select('id, invoice_id, voucher_type, reference_number')
      .in('id', txIds);

    if (txError) {
      logger.error('enrichLedgerEntriesWithPayments: transactions', txError);
    } else {
      (txs || []).forEach((t: { id: string; invoice_id?: string; voucher_type?: string }) => {
        txMap.set(t.id, t);
      });
    }
  }

  const invoiceIds = [
    ...new Set(
      [...txMap.values()]
        .map((t) => t.invoice_id)
        .filter(Boolean)
    ),
  ] as string[];

  const invoicesMap = new Map<
    string,
    { total_amount?: number; payment_status?: string; invoice_number?: string }
  >();
  const invoiceByNumber = new Map<string, string>();
  const paymentsMap = new Map<string, number>();

  if (invoiceIds.length) {
    const { data: invoices, error: invError } = await (supabase as any)
      .from('invoices')
      .select('id, invoice_number, total_amount, payment_status')
      .in('id', invoiceIds);

    if (invError) {
      logger.error('enrichLedgerEntriesWithPayments: invoices', invError);
    } else {
      (invoices || []).forEach(
        (inv: {
          id: string;
          invoice_number?: string;
          total_amount?: number;
          payment_status?: string;
        }) => {
          invoicesMap.set(inv.id, inv);
          if (inv.invoice_number) {
            invoiceByNumber.set(inv.invoice_number.toUpperCase(), inv.id);
          }
        }
      );
    }
  }

  const legacyNumbers = [
    ...new Set(
      entries
        .filter((e) => !e.transaction_id)
        .map((e) => extractInvoiceNumber(e.description))
        .filter(Boolean)
    ),
  ] as string[];

  const unresolvedNumbers = legacyNumbers.filter(
    (n) => !invoiceByNumber.has(n)
  );

  if (unresolvedNumbers.length && companyId) {
    const { data: legacyInvoices } = await (supabase as any)
      .from('invoices')
      .select('id, invoice_number, total_amount, payment_status')
      .eq('company_id', companyId)
      .in('invoice_number', unresolvedNumbers);

    (legacyInvoices || []).forEach(
      (inv: {
        id: string;
        invoice_number?: string;
        total_amount?: number;
        payment_status?: string;
      }) => {
        invoicesMap.set(inv.id, inv);
        if (inv.invoice_number) {
          invoiceByNumber.set(inv.invoice_number.toUpperCase(), inv.id);
        }
        if (!invoiceIds.includes(inv.id)) invoiceIds.push(inv.id);
      }
    );
  }

  if (invoiceIds.length) {
    const { data: payments, error: payError } = await (supabase as any)
      .from('invoice_payments')
      .select('invoice_id, amount')
      .in('invoice_id', invoiceIds)
      .eq('user_id', userId);

    if (payError) {
      logger.error('enrichLedgerEntriesWithPayments: payments', payError);
    } else {
      (payments || []).forEach((p: { invoice_id: string; amount?: number }) => {
        const prev = paymentsMap.get(p.invoice_id) || 0;
        paymentsMap.set(p.invoice_id, prev + (Number(p.amount) || 0));
      });
    }
  }

  const attachSummary = (
    entryId: string,
    invoiceId: string,
    lineAmount: number,
    isPaymentVoucher: boolean,
    invoiceNumber?: string
  ) => {
    if (isPaymentVoucher) {
      result.set(entryId, {
        invoiceTotal: round2(lineAmount),
        totalPaid: round2(lineAmount),
        amountDue: 0,
        isPaymentVoucher: true,
        invoiceNumber,
      });
      return;
    }

    const inv = invoicesMap.get(invoiceId);
    if (!inv) return;

    const invoiceTotal = round2(Number(inv.total_amount) || lineAmount);
    let totalPaid = round2(paymentsMap.get(invoiceId) || 0);
    let amountDue = round2(Math.max(0, invoiceTotal - totalPaid));

    if (inv.payment_status === 'paid' && amountDue > 0) {
      totalPaid = invoiceTotal;
      amountDue = 0;
    }

    result.set(entryId, {
      invoiceTotal,
      totalPaid,
      amountDue,
      isPaymentVoucher: false,
      invoiceNumber: inv.invoice_number || invoiceNumber,
    });
  };

  for (const entry of entries) {
    const lineAmount = Math.max(
      Number(entry.debit_amount) || 0,
      Number(entry.credit_amount) || 0
    );

    if (entry.transaction_id) {
      const tx = txMap.get(entry.transaction_id);
      if (!tx?.invoice_id) continue;

      const isPaymentVoucher =
        tx.voucher_type === 'receipt' || tx.voucher_type === 'payment';

      attachSummary(entry.id, tx.invoice_id, lineAmount, isPaymentVoucher);
      continue;
    }

    const invoiceNumber = extractInvoiceNumber(entry.description);
    if (!invoiceNumber) continue;
    const invoiceId = invoiceByNumber.get(invoiceNumber);
    if (!invoiceId) continue;

    const isPaymentVoucher = (entry.description || '')
      .toLowerCase()
      .startsWith('payment');

    attachSummary(
      entry.id,
      invoiceId,
      lineAmount,
      isPaymentVoucher,
      invoiceNumber
    );
  }

  return result;
}
