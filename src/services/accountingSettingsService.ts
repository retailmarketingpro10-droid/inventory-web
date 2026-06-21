import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import {
  DEFAULT_LEDGER_MAPPING,
  type LedgerMappingSettings,
} from '@/config/ledgerAccounts';

export async function getLedgerMappingSettings(
  userId: string,
  companyName: string
): Promise<LedgerMappingSettings> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('business_entities')
      .eq('id', userId)
      .single();

    if (error) throw error;

    const entities = (data?.business_entities as any[]) || [];
    const entity = entities.find((e) => e?.company_name === companyName);
    const stored = entity?.ledger_mapping as LedgerMappingSettings | undefined;

    return {
      ...DEFAULT_LEDGER_MAPPING,
      ...stored,
      directExpenseAccountIds: stored?.directExpenseAccountIds || [],
      indirectExpenseAccountIds: stored?.indirectExpenseAccountIds || [],
      indirectIncomeAccountIds: stored?.indirectIncomeAccountIds || [],
    };
  } catch (error) {
    logger.error('Failed to load ledger mapping settings:', error);
    return { ...DEFAULT_LEDGER_MAPPING };
  }
}

export async function saveLedgerMappingSettings(
  userId: string,
  companyName: string,
  mapping: LedgerMappingSettings
): Promise<void> {
  const { data, error } = await supabase
    .from('profiles')
    .select('business_entities')
    .eq('id', userId)
    .single();

  if (error) throw error;

  const entities = [...((data?.business_entities as any[]) || [])];
  const index = entities.findIndex((e) => e?.company_name === companyName);

  if (index < 0) {
    throw new Error(`Company "${companyName}" not found in profile`);
  }

  entities[index] = {
    ...entities[index],
    ledger_mapping: mapping,
  };

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ business_entities: entities })
    .eq('id', userId);

  if (updateError) throw updateError;
}
