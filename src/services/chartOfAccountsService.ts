import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import {
  DEFAULT_CHART_OF_ACCOUNTS,
  roleToMappingKey,
  type LedgerMappingSettings,
} from '@/config/ledgerAccounts';
import { getFinancialYearForDate } from '@/utils/indianBusiness';

export interface CompanyLedger {
  id: string;
  name: string;
  ledger_type: string;
}

export async function fetchCompanyLedgers(
  userId: string,
  companyName: string,
  financialYear?: string
): Promise<CompanyLedger[]> {
  const fy =
    financialYear || getFinancialYearForDate(new Date()).label;

  const { data, error } = await (supabase as any)
    .from('ledgers')
    .select('id, name, ledger_type')
    .eq('company_id', companyName)
    .eq('user_id', userId)
    .eq('financial_year', fy)
    .order('name');

  if (error) {
    logger.error('Failed to fetch company ledgers:', error);
    return [];
  }

  return data || [];
}

/** Create missing default ledgers and return updated mapping with ledger IDs */
export async function ensureDefaultChartOfAccounts(
  userId: string,
  companyName: string,
  existingMapping: LedgerMappingSettings
): Promise<LedgerMappingSettings> {
  const fy = getFinancialYearForDate(new Date()).label;
  const ledgers = await fetchCompanyLedgers(userId, companyName, fy);
  const mapping: LedgerMappingSettings = { ...existingMapping };

  for (const account of DEFAULT_CHART_OF_ACCOUNTS) {
    const key = roleToMappingKey(account.role);
    if (!key) continue;

    const currentId = mapping[key] as string | undefined;
    if (currentId && ledgers.some((l) => l.id === currentId)) continue;

    let ledger = ledgers.find(
      (l) => l.name.toLowerCase() === account.name.toLowerCase()
    );

    if (!ledger) {
      const { data: created, error } = await (supabase as any)
        .from('ledgers')
        .insert([
          {
            name: account.name,
            ledger_type: account.ledger_type,
            company_id: companyName,
            financial_year: fy,
            user_id: userId,
            opening_balance: 0,
            current_balance: 0,
          },
        ])
        .select('id, name, ledger_type')
        .single();

      if (error) {
        logger.error(`Failed to create ledger ${account.name}:`, error);
        continue;
      }
      ledger = created;
      ledgers.push(ledger!);
    }

    (mapping as any)[key] = ledger!.id;
  }

  return mapping;
}
