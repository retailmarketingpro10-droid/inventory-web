import { supabase } from '@/integrations/supabase/client';

const CREDIT_NORMAL_TYPES = new Set([
  'capital',
  'equity',
  'loan',
  'payables',
  'liability',
  'income',
  'revenue',
  'sundry creditor',
  'creditor',
  'secondary loan',
  'unsecured loan',
]);

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function isCreditNormalLedgerType(ledgerType: string): boolean {
  return CREDIT_NORMAL_TYPES.has((ledgerType || '').toLowerCase());
}

/** Signed balance from opening + entries (assets: Dr+, liabilities/capital: Cr+). */
export async function getSignedLedgerBalance(params: {
  ledgerId: string;
  userId: string;
  ledgerType?: string;
}): Promise<number> {
  const { data: ledger, error: ledgerError } = await (supabase as any)
    .from('ledgers')
    .select('opening_balance, ledger_type')
    .eq('id', params.ledgerId)
    .eq('user_id', params.userId)
    .single();

  if (ledgerError) throw ledgerError;

  const ledgerType = params.ledgerType || ledger?.ledger_type || '';
  const creditNormal = isCreditNormalLedgerType(ledgerType);

  const { data: entries, error: entriesError } = await (supabase as any)
    .from('ledger_entries')
    .select('debit_amount, credit_amount')
    .eq('ledger_id', params.ledgerId)
    .eq('user_id', params.userId);

  if (entriesError) throw entriesError;

  let balance = Number(ledger?.opening_balance) || 0;
  for (const entry of entries || []) {
    const debit = Number(entry.debit_amount) || 0;
    const credit = Number(entry.credit_amount) || 0;
    balance += creditNormal ? credit - debit : debit - credit;
  }

  return round2(balance);
}
