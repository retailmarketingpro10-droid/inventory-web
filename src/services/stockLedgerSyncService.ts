import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { LedgerMappingSettings } from '@/config/ledgerAccounts';
import { createLedgerTransaction } from '@/services/ledgerPostingService';
import { getTotalStockValue } from '@/services/inventoryValuationService';
import { getSignedLedgerBalance } from '@/services/ledgerBalanceService';
import { getFinancialYearForDate } from '@/utils/indianBusiness';

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export interface ReconcileStockLedgerParams {
  companyId: string;
  userId: string;
  mapping: LedgerMappingSettings;
  asOfDate?: string;
  invoiceId?: string;
  reference?: string;
}

/**
 * Aligns Stock-in-Hand ledger balance with valued inventory (products + movements).
 * Posts a stock journal against Capital when the ledger drifts from inventory.
 */
export async function reconcileStockInHandLedger(
  params: ReconcileStockLedgerParams
): Promise<{ adjusted: boolean; difference?: number; transactionId?: string }> {
  if (params.mapping.syncStockToLedger === false) {
    return { adjusted: false };
  }

  const stockId = params.mapping.stockInHandAccountId;
  const capitalId = params.mapping.capitalAccountId;
  if (!stockId) {
    return { adjusted: false };
  }
  if (!capitalId) {
    throw new Error(
      'Capital Account must be mapped to sync Stock-in-Hand. Configure in Settings → Invoice & Ledger.'
    );
  }

  const asOfDate = params.asOfDate || new Date().toISOString().split('T')[0];
  const targetValue = await getTotalStockValue(params.companyId, asOfDate);

  const { data: stockLedger, error: ledgerError } = await (supabase as any)
    .from('ledgers')
    .select('current_balance, ledger_type')
    .eq('id', stockId)
    .eq('user_id', params.userId)
    .single();

  if (ledgerError) {
    logger.error('reconcileStockInHandLedger: load ledger', ledgerError);
    throw ledgerError;
  }

  const currentBalance = await getSignedLedgerBalance({
    ledgerId: stockId,
    userId: params.userId,
    ledgerType: stockLedger?.ledger_type || 'asset',
  });
  const diff = round2(targetValue - currentBalance);

  if (Math.abs(diff) < 0.01) {
    return { adjusted: false, difference: 0 };
  }

  // Avoid duplicate stock journals for the same invoice
  if (params.invoiceId) {
    const { data: existing } = await (supabase as any)
      .from('ledger_transactions')
      .select('id')
      .eq('invoice_id', params.invoiceId)
      .eq('voucher_type', 'stock_journal')
      .limit(1);
    if ((existing?.length || 0) > 0) {
      return { adjusted: false, difference: diff };
    }
  }

  const fy = getFinancialYearForDate(new Date(asOfDate)).label;
  const amount = Math.abs(diff);
  const lines =
    diff > 0
      ? [
          { ledger_id: stockId, amount, side: 'debit' as const },
          { ledger_id: capitalId, amount, side: 'credit' as const },
        ]
      : [
          { ledger_id: capitalId, amount, side: 'debit' as const },
          { ledger_id: stockId, amount, side: 'credit' as const },
        ];

  const { transactionId } = await createLedgerTransaction({
    description: params.reference || `Stock-in-Hand sync — inventory as of ${asOfDate}`,
    companyId: params.companyId,
    financialYear: fy,
    userId: params.userId,
    entryDate: asOfDate,
    lines,
    voucherType: 'stock_journal',
    invoiceId: params.invoiceId,
    referenceNumber: params.reference,
  });

  return { adjusted: true, difference: diff, transactionId };
}

/**
 * Removes all stock-journal vouchers for the company, then posts one fresh sync
 * to match current inventory value (fixes duplicated or inverted stock entries).
 */
export async function resetAndSyncStockInHandLedger(params: {
  companyId: string;
  userId: string;
  mapping: LedgerMappingSettings;
}): Promise<{
  removedCount: number;
  adjusted: boolean;
  difference?: number;
  targetValue: number;
}> {
  const { data: txs, error: fetchError } = await (supabase as any)
    .from('ledger_transactions')
    .select('id, voucher_type, description')
    .eq('company_id', params.companyId)
    .eq('user_id', params.userId);

  if (fetchError) {
    logger.error('resetAndSyncStockInHandLedger: fetch', fetchError);
    throw fetchError;
  }

  const stockTxIds = (txs || [])
    .filter(
      (t: { voucher_type?: string; description?: string }) =>
        t.voucher_type === 'stock_journal' ||
        /stock-in-hand sync/i.test(t.description || '')
    )
    .map((t: { id: string }) => t.id);

  if (stockTxIds.length > 0) {
    const { error: deleteError } = await (supabase as any)
      .from('ledger_transactions')
      .delete()
      .in('id', stockTxIds)
      .eq('user_id', params.userId);

    if (deleteError) {
      logger.error('resetAndSyncStockInHandLedger: delete', deleteError);
      throw deleteError;
    }
  }

  const targetValue = await getTotalStockValue(params.companyId);
  const result = await reconcileStockInHandLedger({
    companyId: params.companyId,
    userId: params.userId,
    mapping: params.mapping,
    reference: 'Stock ledger reset sync',
  });

  return {
    removedCount: stockTxIds.length,
    adjusted: result.adjusted,
    difference: result.difference,
    targetValue,
  };
}
