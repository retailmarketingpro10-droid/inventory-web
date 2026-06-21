import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { LedgerMappingSettings } from '@/config/ledgerAccounts';
import {
  createLedgerTransaction,
  type LedgerPostingLine,
} from '@/services/ledgerPostingService';
import { getFinancialYearForDate } from '@/utils/indianBusiness';

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

function pickPartyLedger(
  mapping: LedgerMappingSettings,
  paymentStatus: string,
  paymentMethod: string | undefined,
  side: 'sales' | 'purchase'
): string | undefined {
  const isPaid = paymentStatus === 'paid';
  if (isPaid) {
    if (paymentMethod === 'bank' && mapping.bankAccountId) return mapping.bankAccountId;
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
      lines.push({ ledger_id: ledgerId, amount: round2(amount), side: 'credit' });
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
      lines.push({ ledger_id: ledgerId, amount: round2(amount), side: 'debit' });
    }
  }
}

function buildInvoiceVoucherLines(params: PostInvoiceLedgerParams): LedgerPostingLine[] {
  const { invoiceType, paymentStatus, paymentMethod, totals, mapping } = params;
  const lines: LedgerPostingLine[] = [];
  const taxable = round2(totals.subtotalAfterDiscount);
  const discount = round2(totals.discountAmount);
  const total = round2(totals.total);

  if (invoiceType === 'sales') {
    const partyId = pickPartyLedger(mapping, paymentStatus, paymentMethod, 'sales');
    const salesId = mapping.salesAccountId;
    if (!partyId || !salesId) return lines;

    lines.push({ ledger_id: partyId, amount: total, side: 'debit' });
    if (discount > 0 && mapping.discountAllowedAccountId) {
      lines.push({
        ledger_id: mapping.discountAllowedAccountId,
        amount: discount,
        side: 'debit',
      });
    }
    lines.push({ ledger_id: salesId, amount: round2(taxable + discount), side: 'credit' });
    addOutputTaxCredits(lines, mapping, totals.cgst, totals.sgst, totals.igst);
  } else if (invoiceType === 'sale_return') {
    const partyId = pickPartyLedger(mapping, paymentStatus, paymentMethod, 'sales');
    const salesId = mapping.salesAccountId;
    if (!partyId || !salesId) return lines;

    lines.push({ ledger_id: salesId, amount: round2(taxable + discount), side: 'debit' });
    for (const [amount, ledgerId] of [
      [totals.cgst, mapping.outputCgstAccountId],
      [totals.sgst, mapping.outputSgstAccountId],
      [totals.igst, mapping.outputIgstAccountId],
    ] as const) {
      if (ledgerId && amount > 0) {
        lines.push({ ledger_id: ledgerId, amount: round2(amount), side: 'debit' });
      }
    }
    lines.push({ ledger_id: partyId, amount: total, side: 'credit' });
  } else if (invoiceType === 'purchase') {
    const partyId = pickPartyLedger(mapping, paymentStatus, paymentMethod, 'purchase');
    const purchaseId = mapping.purchaseAccountId;
    if (!partyId || !purchaseId) return lines;

    lines.push({ ledger_id: purchaseId, amount: round2(taxable + discount), side: 'debit' });
    addInputTaxDebits(lines, mapping, totals.cgst, totals.sgst, totals.igst);
    if (discount > 0 && mapping.discountReceivedAccountId) {
      lines.push({
        ledger_id: mapping.discountReceivedAccountId,
        amount: discount,
        side: 'credit',
      });
    }
    lines.push({ ledger_id: partyId, amount: total, side: 'credit' });
  } else if (invoiceType === 'purchase_return') {
    const partyId = pickPartyLedger(mapping, paymentStatus, paymentMethod, 'purchase');
    const purchaseId = mapping.purchaseAccountId;
    if (!partyId || !purchaseId) return lines;

    lines.push({ ledger_id: partyId, amount: total, side: 'debit' });
    for (const [amount, ledgerId] of [
      [totals.cgst, mapping.inputCgstAccountId],
      [totals.sgst, mapping.inputSgstAccountId],
      [totals.igst, mapping.inputIgstAccountId],
    ] as const) {
      if (ledgerId && amount > 0) {
        lines.push({ ledger_id: ledgerId, amount: round2(amount), side: 'credit' });
      }
    }
    lines.push({ ledger_id: purchaseId, amount: round2(taxable + discount), side: 'credit' });
  }

  return lines.filter((l) => l.amount > 0);
}

export async function invoiceAlreadyPosted(invoiceId: string): Promise<boolean> {
  const { data } = await (supabase as any)
    .from('ledger_transactions')
    .select('id')
    .eq('invoice_id', invoiceId)
    .limit(1);

  return (data?.length || 0) > 0;
}

export async function postInvoiceToLedger(
  params: PostInvoiceLedgerParams
): Promise<{ transactionId?: string; skipped?: boolean }> {
  if (params.mapping.postOnInvoice === false) {
    return { skipped: true };
  }

  if (await invoiceAlreadyPosted(params.invoiceId)) {
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
}

export async function postPaymentToLedger(
  params: PostPaymentLedgerParams
): Promise<{ transactionId?: string; skipped?: boolean }> {
  if (params.mapping.postOnPayment === false) {
    return { skipped: true };
  }

  const amount = round2(params.amount);
  if (amount <= 0) return { skipped: true };

  const cashOrBank =
    params.paymentMethod === 'bank'
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
      lines.push({ ledger_id: cashOrBank, amount, side: 'debit' });
      lines.push({ ledger_id: debtors, amount, side: 'credit' });
    } else {
      lines.push({ ledger_id: debtors, amount, side: 'debit' });
      lines.push({ ledger_id: cashOrBank, amount, side: 'credit' });
    }
  } else {
    const creditors = params.mapping.sundryCreditorsAccountId;
    if (!cashOrBank || !creditors) {
      throw new Error('Cash/Bank and Sundry Creditors must be mapped for payment vouchers.');
    }
    if (params.invoiceType === 'purchase') {
      lines.push({ ledger_id: creditors, amount, side: 'debit' });
      lines.push({ ledger_id: cashOrBank, amount, side: 'credit' });
    } else {
      lines.push({ ledger_id: cashOrBank, amount, side: 'debit' });
      lines.push({ ledger_id: creditors, amount, side: 'credit' });
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

  return { transactionId };
}
