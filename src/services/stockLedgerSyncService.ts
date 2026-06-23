import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { LedgerMappingSettings } from '@/config/ledgerAccounts';
import { createLedgerTransaction } from '@/services/ledgerPostingService';
import { getTotalStockValue } from '@/services/inventoryValuationService';
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

  const { data: ledger, error: ledgerError } = await (supabase as any)
    .from('ledgers')
    .select('current_balance')
    .eq('id', stockId)
    .eq('user_id', params.userId)
    .single();

  if (ledgerError) {
    logger.error('reconcileStockInHandLedger: load ledger', ledgerError);
    throw ledgerError;
  }

  const currentBalance = Number(ledger?.current_balance) || 0;
  const diff = round2(targetValue - currentBalance);

  if (Math.abs(diff) < 0.01) {
    return { adjusted: false, difference: 0 };
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
