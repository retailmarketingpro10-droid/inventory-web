import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { getFinancialYearForDate } from '@/utils/indianBusiness';
import { createLedgerTransaction } from '@/services/ledgerPostingService';
import {
  getLedgerMappingSettings,
  saveLedgerMappingSettings,
} from '@/services/accountingSettingsService';
import { fetchCompanyLedgers } from '@/services/chartOfAccountsService';

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export interface PostPettyExpenseParams {
  companyId: string;
  userId: string;
  entryDate: string;
  description: string;
  amount: number;
  expenseLedgerId: string;
  paymentLedgerId: string;
}

export interface PettyExpenseRow {
  id: string;
  entry_date: string;
  description: string;
  amount: number;
  reference_number: string | null;
  expense_ledger_name?: string;
  payment_ledger_name?: string;
}

/** Register expense ledger for P&L indirect expenses if not already mapped. */
export async function ensureIndirectExpenseMapping(
  userId: string,
  companyId: string,
  expenseLedgerId: string
): Promise<void> {
  const mapping = await getLedgerMappingSettings(userId, companyId);
  const ids = mapping.indirectExpenseAccountIds || [];
  if (ids.includes(expenseLedgerId)) return;

  await saveLedgerMappingSettings(userId, companyId, {
    ...mapping,
    indirectExpenseAccountIds: [...ids, expenseLedgerId],
  });
}

export async function postPettyExpense(
  params: PostPettyExpenseParams
): Promise<{ referenceNumber: string; transactionId: string }> {
  const amount = round2(params.amount);
  if (amount <= 0) {
    throw new Error('Amount must be greater than 0');
  }
  if (!params.description.trim()) {
    throw new Error('Description is required');
  }

  const fy = getFinancialYearForDate(new Date(params.entryDate)).label;
  const referenceNumber = `PE-${Date.now().toString().slice(-8)}`;
  const description = params.description.trim();

  const { transactionId } = await createLedgerTransaction({
    description,
    companyId: params.companyId,
    financialYear: fy,
    userId: params.userId,
    entryDate: params.entryDate,
    voucherType: 'petty_expense',
    referenceNumber,
    lines: [
      {
        ledger_id: params.expenseLedgerId,
        amount,
        side: 'debit',
        status: 'paid',
      },
      {
        ledger_id: params.paymentLedgerId,
        amount,
        side: 'credit',
        status: 'paid',
      },
    ],
  });

  try {
    await ensureIndirectExpenseMapping(
      params.userId,
      params.companyId,
      params.expenseLedgerId
    );
  } catch (mapError) {
    logger.warn('Could not auto-map petty expense ledger:', mapError);
  }

  return { referenceNumber, transactionId };
}

export async function createExpenseLedger(params: {
  userId: string;
  companyId: string;
  name: string;
}): Promise<{ id: string; name: string }> {
  const name = params.name.trim();
  if (!name) throw new Error('Ledger name is required');

  const fy = getFinancialYearForDate(new Date()).label;
  const existing = await fetchCompanyLedgers(params.userId, params.companyId, fy);
  const duplicate = existing.find(
    (l) => l.name.toLowerCase() === name.toLowerCase()
  );
  if (duplicate) {
    return { id: duplicate.id, name: duplicate.name };
  }

  const { data, error } = await (supabase as any)
    .from('ledgers')
    .insert([
      {
        name,
        ledger_type: 'expense',
        company_id: params.companyId,
        financial_year: fy,
        user_id: params.userId,
        opening_balance: 0,
        current_balance: 0,
      },
    ])
    .select('id, name')
    .single();

  if (error) throw error;

  await ensureIndirectExpenseMapping(params.userId, params.companyId, data.id);

  return { id: data.id, name: data.name };
}

export async function fetchRecentPettyExpenses(params: {
  userId: string;
  companyId: string;
  limit?: number;
}): Promise<PettyExpenseRow[]> {
  const limit = params.limit ?? 50;

  const { data: txs, error } = await (supabase as any)
    .from('ledger_transactions')
    .select('id, transaction_date, description, reference_number')
    .eq('user_id', params.userId)
    .eq('company_id', params.companyId)
    .eq('voucher_type', 'petty_expense')
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error('fetchRecentPettyExpenses:', error);
    return [];
  }

  if (!txs?.length) return [];

  const txIds = txs.map((t: { id: string }) => t.id);
  const { data: entries } = await (supabase as any)
    .from('ledger_entries')
    .select('transaction_id, debit_amount, credit_amount, ledger_id, ledgers(name, ledger_type)')
    .in('transaction_id', txIds)
    .eq('user_id', params.userId);

  const entriesByTx = new Map<string, any[]>();
  (entries || []).forEach((e: any) => {
    const list = entriesByTx.get(e.transaction_id) || [];
    list.push(e);
    entriesByTx.set(e.transaction_id, list);
  });

  return txs.map((tx: any) => {
    const lines = entriesByTx.get(tx.id) || [];
    const expenseLine = lines.find((l: any) => Number(l.debit_amount) > 0);
    const paymentLine = lines.find((l: any) => Number(l.credit_amount) > 0);
    const amount = Number(expenseLine?.debit_amount) || 0;

    return {
      id: tx.id,
      entry_date: tx.transaction_date,
      description: tx.description,
      amount,
      reference_number: tx.reference_number,
      expense_ledger_name: expenseLine?.ledgers?.name,
      payment_ledger_name: paymentLine?.ledgers?.name,
    };
  });
}
