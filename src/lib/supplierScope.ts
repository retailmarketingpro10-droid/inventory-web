import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

export interface SupplierListItem {
  id: string;
  company_name: string;
  contact_person?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  gstin?: string | null;
  pan?: string | null;
}

/**
 * Load suppliers scoped to the selected company and current user (same as products / ERP import).
 */
export async function fetchSuppliersForCompany(params: {
  companyName?: string | null;
  userId?: string | null;
  select?: string;
}): Promise<SupplierListItem[]> {
  const select = params.select ?? 'id, company_name';

  if (!params.userId) {
    return [];
  }

  let query = (supabase as any)
    .from('suppliers')
    .select(select)
    .eq('user_id', params.userId);

  if (params.companyName) {
    query = query.eq('company_id', params.companyName);
  }

  const { data, error } = await query.order('company_name');

  if (error) {
    logger.error('fetchSuppliersForCompany:', error);
    throw error;
  }

  return (data || []).filter(
    (row: SupplierListItem) => row?.id && row?.company_name
  ) as SupplierListItem[];
}
