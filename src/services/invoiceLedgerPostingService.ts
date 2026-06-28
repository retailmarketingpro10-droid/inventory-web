import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { LedgerMappingSettings } from '@/config/ledgerAccounts';
import {
  createLedgerTransaction,
  type LedgerPostingLine,
} from '@/services/ledgerPostingService';
import { getFinancialYearForDate } from '@/utils/indianBusiness';
import { getLedgerMappingSettings } from '@/services/accountingSettingsService';
import { ensureDefaultChartOfAccounts } from '@/services/chartOfAccountsService';

export interface InvoiceLedgerTotals {
  subtotal: number;
  subtotalAfterDiscount: number;
  discountAmount: number;
  taxAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

export interface PostInvoiceLedgerParams {
  invoiceId: string;
  invoiceNumber: string;
  invoiceType: string;
  invoiceDate: string;
  paymentStatus: string;
  paymentMethod?: string;
  companyId: string;
  userId: string;
  totals: InvoiceLedgerTotals;
  mapping: LedgerMappingSettings;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function partyEntryStatus(paymentStatus: string): 'paid' | 'due' | 'partial' {
  if (paymentStatus === 'paid') return 'paid';
  if (paymentStatus === 'partial') return 'partial';
  return 'due';
}

const BOOKED = 'paid' as const;

function line(
  ledger_id: string,
  amount: number,
  side: 'debit' | 'credit',
  status: 'paid' | 'due' | 'partial' = BOOKED
): LedgerPostingLine {
  return { ledger_id, amount: round2(amount), side, status };
}

function isBankPayment(method?: string): boolean {
  return (
    method === 'bank' ||
    method === 'bank_transfer' ||
    method === 'cheque' ||
    method === 'upi' ||
    method === 'credit_card'
  );
}

function pickPartyLedger(
  mapping: LedgerMappingSettings,
  paymentStatus: string,
  paymentMethod: string | undefined,
  side: 'sales' | 'purchase'
): string | undefined {
  const isPaid = paymentStatus === 'paid';
  if (isPaid) {
    if (isBankPayment(paymentMethod) && mapping.bankAccountId) return mapping.bankAccountId;
    return mapping.cashAccountId || mapping.bankAccountId;
  }
  return side === 'sales'
    ? mapping.sundryDebtorsAccountId
    : mapping.sundryCreditorsAccountId;
}

function addOutputTaxCredits(
  lines: LedgerPostingLine[],
  mapping: LedgerMappingSettings,
  cgst: number,
  sgst: number,
  igst: number
) {
  for (const [amount, ledgerId] of [
    [cgst, mapping.outputCgstAccountId],
    [sgst, mapping.outputSgstAccountId],
    [igst, mapping.outputIgstAccountId],
  ] as const) {
    if (ledgerId && amount > 0) {
      lines.push(line(ledgerId, amount, 'credit', BOOKED));
    }
  }
}

function addInputTaxDebits(
  lines: LedgerPostingLine[],
  mapping: LedgerMappingSettings,
  cgst: number,
  sgst: number,
  igst: number
) {
  for (const [amount, ledgerId] of [
    [cgst, mapping.inputCgstAccountId],
    [sgst, mapping.inputSgstAccountId],
    [igst, mapping.inputIgstAccountId],
  ] as const) {
    if (ledgerId && amount > 0) {
      lines.push(line(ledgerId, amount, 'debit', BOOKED));
    }
  }
}

function buildInvoiceVoucherLines(params: PostInvoiceLedgerParams): LedgerPostingLine[] {
  const { invoiceType, paymentStatus, paymentMethod, totals, mapping } = params;
  const lines: LedgerPostingLine[] = [];
  const taxable = round2(totals.subtotalAfterDiscount);
  const discount = round2(totals.discountAmount);
  const total = round2(totals.total);

  const partyStatus = partyEntryStatus(paymentStatus);

  if (invoiceType === 'sales') {
    const partyId = pickPartyLedger(mapping, paymentStatus, paymentMethod, 'sales');
    const salesId = mapping.salesAccountId;
    if (!partyId || !salesId) return lines;

    lines.push(line(partyId, total, 'debit', partyStatus));
    if (discount > 0 && mapping.discountAllowedAccountId) {
      lines.push(line(mapping.discountAllowedAccountId, discount, 'debit', BOOKED));
    }
    lines.push(line(salesId, taxable + discount, 'credit', BOOKED));
    addOutputTaxCredits(lines, mapping, totals.cgst, totals.sgst, totals.igst);
  } else if (invoiceType === 'sale_return') {
    const partyId = pickPartyLedger(mapping, paymentStatus, paymentMethod, 'sales');
    const salesId = mapping.salesAccountId;
    if (!partyId || !salesId) return lines;

    lines.push(line(salesId, taxable + discount, 'debit', BOOKED));
    for (const [amount, ledgerId] of [
      [totals.cgst, mapping.outputCgstAccountId],
      [totals.sgst, mapping.outputSgstAccountId],
      [totals.igst, mapping.outputIgstAccountId],
    ] as const) {
      if (ledgerId && amount > 0) {
        lines.push(line(ledgerId, amount, 'debit', BOOKED));
      }
    }
    lines.push(line(partyId, total, 'credit', partyStatus));
  } else if (invoiceType === 'purchase') {
    const partyId = pickPartyLedger(mapping, paymentStatus, paymentMethod, 'purchase');
    const purchaseId = mapping.purchaseAccountId;
    if (!partyId || !purchaseId) return lines;

    lines.push(line(purchaseId, taxable + discount, 'debit', BOOKED));
    addInputTaxDebits(lines, mapping, totals.cgst, totals.sgst, totals.igst);
    if (discount > 0 && mapping.discountReceivedAccountId) {
      lines.push(line(mapping.discountReceivedAccountId, discount, 'credit', BOOKED));
    }
    lines.push(line(partyId, total, 'credit', partyStatus));
  } else if (invoiceType === 'purchase_return') {
    const partyId = pickPartyLedger(mapping, paymentStatus, paymentMethod, 'purchase');
    const purchaseId = mapping.purchaseAccountId;
    if (!partyId || !purchaseId) return lines;

    lines.push(line(partyId, total, 'debit', partyStatus));
    for (const [amount, ledgerId] of [
      [totals.cgst, mapping.inputCgstAccountId],
      [totals.sgst, mapping.inputSgstAccountId],
      [totals.igst, mapping.inputIgstAccountId],
    ] as const) {
      if (ledgerId && amount > 0) {
        lines.push(line(ledgerId, amount, 'credit', BOOKED));
      }
    }
    lines.push(line(purchaseId, taxable + discount, 'credit', BOOKED));
  }

  return lines.filter((l) => l.amount > 0);
}

export async function invoiceAlreadyPosted(
  invoiceId: string,
  invoiceNumber?: string
): Promise<boolean> {
  const skipTypes = new Set(['receipt', 'payment', 'stock_journal']);

  const { data: byInvoice } = await (supabase as any)
    .from('ledger_transactions')
    .select('id, voucher_type')
    .eq('invoice_id', invoiceId);

  if (
    (byInvoice || []).some(
      (t: { voucher_type?: string }) => !skipTypes.has(t.voucher_type || '')
    )
  ) {
    return true;
  }

  if (!invoiceNumber) return false;

  const { data: byRef } = await (supabase as any)
    .from('ledger_transactions')
    .select('id, voucher_type')
    .eq('reference_number', invoiceNumber);

  if (
    (byRef || []).some(
      (t: { voucher_type?: string }) => !skipTypes.has(t.voucher_type || '')
    )
  ) {
    return true;
  }

  const { data: byLegacy } = await (supabase as any)
    .from('ledger_transactions')
    .select('id, voucher_type')
    .ilike('description', `%${invoiceNumber}%`);

  return (byLegacy || []).some(
    (t: { voucher_type?: string }) => !skipTypes.has(t.voucher_type || '')
  );
}

export async function paymentVoucherAlreadyPosted(
  invoiceId: string,
  amount: number,
  paymentDate: string
): Promise<boolean> {
  const { data: txs } = await (supabase as any)
    .from('ledger_transactions')
    .select('id')
    .eq('invoice_id', invoiceId)
    .in('voucher_type', ['receipt', 'payment'])
    .eq('transaction_date', paymentDate);

  if (!txs?.length) return false;

  const txIds = txs.map((t: { id: string }) => t.id);
  const { data: entries } = await (supabase as any)
    .from('ledger_entries')
    .select('transaction_id, debit_amount, credit_amount')
    .in('transaction_id', txIds);

  const amountByTx = new Map<string, number>();
  (entries || []).forEach((e: any) => {
    const lineAmount = Math.max(Number(e.debit_amount) || 0, Number(e.credit_amount) || 0);
    amountByTx.set(
      e.transaction_id,
      Math.max(amountByTx.get(e.transaction_id) || 0, lineAmount)
    );
  });

  return [...amountByTx.values()].some((v) => Math.abs(v - round2(amount)) < 0.01);
}

export async function postInvoiceToLedger(
  params: PostInvoiceLedgerParams
): Promise<{ transactionId?: string; skipped?: boolean }> {
  if (params.mapping.postOnInvoice === false) {
    return { skipped: true };
  }

  if (await invoiceAlreadyPosted(params.invoiceId, params.invoiceNumber)) {
    return { skipped: true };
  }

  const lines = buildInvoiceVoucherLines(params);
  if (lines.length < 2) {
    throw new Error(
      'Ledger mapping incomplete. Configure accounts in Settings → Invoice & Ledger.'
    );
  }

  const fy = getFinancialYearForDate(new Date(params.invoiceDate)).label;
  const voucherType =
    params.invoiceType === 'sales'
      ? 'sales'
      : params.invoiceType === 'purchase'
        ? 'purchase'
        : params.invoiceType === 'sale_return'
          ? 'credit_note'
          : params.invoiceType === 'purchase_return'
            ? 'debit_note'
            : 'journal';

  const { transactionId } = await createLedgerTransaction({
    description: `${voucherType.toUpperCase()} — ${params.invoiceNumber}`,
    companyId: params.companyId,
    financialYear: fy,
    userId: params.userId,
    entryDate: params.invoiceDate,
    lines,
    voucherType,
    invoiceId: params.invoiceId,
    referenceNumber: params.invoiceNumber,
  });

  return { transactionId };
}

export interface PostPaymentLedgerParams {
  invoiceId: string;
  invoiceNumber: string;
  invoiceType: string;
  paymentDate: string;
  amount: number;
  paymentMethod: string;
  companyId: string;
  userId: string;
  mapping: LedgerMappingSettings;
  invoicePaymentStatus?: string;
}

async function updatePartyEntryStatusForInvoice(
  invoiceId: string,
  userId: string,
  mapping: LedgerMappingSettings,
  paymentStatus: string
) {
  const partyLedgerIds = [
    mapping.sundryDebtorsAccountId,
    mapping.sundryCreditorsAccountId,
  ].filter(Boolean) as string[];

  if (!partyLedgerIds.length) return;

  const entryStatus = partyEntryStatus(paymentStatus);

  const { data: txs } = await (supabase as any)
    .from('ledger_transactions')
    .select('id, voucher_type')
    .eq('invoice_id', invoiceId);

  const invoiceTxIds = (txs || [])
    .filter((t: any) => t.voucher_type !== 'receipt' && t.voucher_type !== 'payment')
    .map((t: any) => t.id);

  if (!invoiceTxIds.length) return;

  // Party line may be debit (debtors) or credit (creditors) depending on invoice type
  await (supabase as any)
    .from('ledger_entries')
    .update({ status: entryStatus })
    .in('transaction_id', invoiceTxIds)
    .in('ledger_id', partyLedgerIds)
    .eq('user_id', userId);
}

/** Keep Sundry Debtors/Creditors entry status aligned with invoice payment_status. */
export async function syncPartyLedgerPaymentStatus(params: {
  invoiceId: string;
  userId: string;
  companyId: string;
  paymentStatus: string;
}): Promise<void> {
  let mapping = await getLedgerMappingSettings(params.userId, params.companyId);
  mapping = await ensureDefaultChartOfAccounts(
    params.userId,
    params.companyId,
    mapping
  );
  await updatePartyEntryStatusForInvoice(
    params.invoiceId,
    params.userId,
    mapping,
    params.paymentStatus
  );
}

/** Align party ledger line status with every invoice in the company (backfill). */
export async function syncAllPartyLedgerPaymentStatuses(params: {
  userId: string;
  companyId: string;
}): Promise<void> {
  const { data: invoices, error } = await (supabase as any)
    .from('invoices')
    .select('id, payment_status')
    .eq('company_id', params.companyId)
    .eq('user_id', params.userId);

  if (error) {
    throw error;
  }

  if (!invoices?.length) return;

  let mapping = await getLedgerMappingSettings(params.userId, params.companyId);
  mapping = await ensureDefaultChartOfAccounts(
    params.userId,
    params.companyId,
    mapping
  );

  for (const inv of invoices) {
    await updatePartyEntryStatusForInvoice(
      inv.id,
      params.userId,
      mapping,
      inv.payment_status || 'due'
    );
  }
}

export async function postPaymentToLedger(
  params: PostPaymentLedgerParams
): Promise<{ transactionId?: string; skipped?: boolean }> {
  const syncParty = async () => {
    if (params.invoicePaymentStatus) {
      await updatePartyEntryStatusForInvoice(
        params.invoiceId,
        params.userId,
        params.mapping,
        params.invoicePaymentStatus
      );
    }
  };

  if (params.mapping.postOnPayment === false) {
    await syncParty();
    return { skipped: true };
  }

  const amount = round2(params.amount);
  if (amount <= 0) {
    await syncParty();
    return { skipped: true };
  }

  if (await paymentVoucherAlreadyPosted(params.invoiceId, amount, params.paymentDate)) {
    await syncParty();
    return { skipped: true };
  }

  const cashOrBank =
    isBankPayment(params.paymentMethod)
      ? params.mapping.bankAccountId || params.mapping.cashAccountId
      : params.mapping.cashAccountId || params.mapping.bankAccountId;

  const lines: LedgerPostingLine[] = [];
  const isSalesSide =
    params.invoiceType === 'sales' || params.invoiceType === 'sale_return';

  if (isSalesSide) {
    const debtors = params.mapping.sundryDebtorsAccountId;
    if (!cashOrBank || !debtors) {
      throw new Error('Cash/Bank and Sundry Debtors must be mapped for receipt vouchers.');
    }
    if (params.invoiceType === 'sales') {
      lines.push(line(cashOrBank, amount, 'debit', BOOKED));
      lines.push(line(debtors, amount, 'credit', BOOKED));
    } else {
      lines.push(line(debtors, amount, 'debit', BOOKED));
      lines.push(line(cashOrBank, amount, 'credit', BOOKED));
    }
  } else {
    const creditors = params.mapping.sundryCreditorsAccountId;
    if (!cashOrBank || !creditors) {
      throw new Error('Cash/Bank and Sundry Creditors must be mapped for payment vouchers.');
    }
    if (params.invoiceType === 'purchase') {
      lines.push(line(creditors, amount, 'debit', BOOKED));
      lines.push(line(cashOrBank, amount, 'credit', BOOKED));
    } else {
      lines.push(line(cashOrBank, amount, 'debit', BOOKED));
      lines.push(line(creditors, amount, 'credit', BOOKED));
    }
  }

  const fy = getFinancialYearForDate(new Date(params.paymentDate)).label;
  const { transactionId } = await createLedgerTransaction({
    description: `Payment — ${params.invoiceNumber}`,
    companyId: params.companyId,
    financialYear: fy,
    userId: params.userId,
    entryDate: params.paymentDate,
    lines,
    voucherType: isSalesSide ? 'receipt' : 'payment',
    invoiceId: params.invoiceId,
    referenceNumber: params.invoiceNumber,
  });

  if (params.invoicePaymentStatus) {
    await syncParty();
  }

  return { transactionId };
}
