import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { LedgerMappingSettings } from '@/config/ledgerAccounts';
import { getLedgerMappingSettings } from '@/services/accountingSettingsService';
import { ensureDefaultChartOfAccounts } from '@/services/chartOfAccountsService';
import { getStockValuationForPeriod } from '@/services/inventoryValuationService';
import { getFinancialYearForDate } from '@/utils/indianBusiness';

export interface LedgerReportParams {
  companyName: string;
  userId: string;
  dateFrom: string;
  dateTo: string;
  mapping?: LedgerMappingSettings;
}

interface LedgerRow {
  id: string;
  name: string;
  ledger_type: string;
  opening_balance: number;
}

interface Movement {
  debits: number;
  credits: number;
}

const CREDIT_BALANCE_TYPES = new Set([
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

function isCreditBalanceType(ledgerType: string) {
  return CREDIT_BALANCE_TYPES.has((ledgerType || '').toLowerCase());
}

function signedBalance(
  ledger: LedgerRow,
  movement: Movement,
  openingExtra?: Movement
): number {
  const base = Number(ledger.opening_balance) || 0;
  const pre = openingExtra || { debits: 0, credits: 0 };
  const debits = movement.debits + pre.debits;
  const credits = movement.credits + pre.credits;
  return isCreditBalanceType(ledger.ledger_type)
    ? base + credits - debits
    : base + debits - credits;
}

function mappingLedgerIds(mapping: LedgerMappingSettings): string[] {
  const ids = new Set<string>();
  const add = (id?: string) => {
    if (id) ids.add(id);
  };
  add(mapping.salesAccountId);
  add(mapping.purchaseAccountId);
  add(mapping.cashAccountId);
  add(mapping.bankAccountId);
  add(mapping.sundryDebtorsAccountId);
  add(mapping.sundryCreditorsAccountId);
  add(mapping.discountAllowedAccountId);
  add(mapping.discountReceivedAccountId);
  add(mapping.stockInHandAccountId);
  add(mapping.capitalAccountId);
  (mapping.directExpenseAccountIds || []).forEach(add);
  (mapping.indirectExpenseAccountIds || []).forEach(add);
  (mapping.indirectIncomeAccountIds || []).forEach(add);
  return [...ids];
}

async function loadLedgers(
  params: LedgerReportParams,
  fyLabel: string,
  mapping?: LedgerMappingSettings
) {
  const { data, error } = await (supabase as any)
    .from('ledgers')
    .select('id, name, ledger_type, opening_balance, financial_year')
    .eq('company_id', params.companyName)
    .eq('user_id', params.userId);

  if (error) {
    logger.error('ledgerReportService: loadLedgers', error);
    return [];
  }

  const allLedgers = (data || []) as LedgerRow[];
  const fyLedgers = allLedgers.filter(
    (l: any) => !l.financial_year || l.financial_year === fyLabel
  );
  const ledgers = fyLedgers.length > 0 ? fyLedgers : allLedgers;

  const mappedIds = mapping ? mappingLedgerIds(mapping) : [];
  const missingIds = mappedIds.filter((id) => !ledgers.some((l) => l.id === id));

  if (missingIds.length === 0) return ledgers;

  const { data: extra, error: extraError } = await (supabase as any)
    .from('ledgers')
    .select('id, name, ledger_type, opening_balance, financial_year')
    .in('id', missingIds)
    .eq('user_id', params.userId);

  if (extraError) {
    logger.error('ledgerReportService: loadMappedLedgers', extraError);
    return ledgers;
  }

  return [...ledgers, ...((extra || []) as LedgerRow[])];
}

async function loadMovements(
  ledgerIds: string[],
  userId: string,
  from: string,
  to: string,
  companyName?: string
): Promise<Map<string, Movement>> {
  const map = new Map<string, Movement>();

  let data: any[] | null = null;
  let error: any = null;

  if (companyName) {
    const result = await (supabase as any)
      .from('ledger_entries')
      .select('ledger_id, debit_amount, credit_amount, ledgers!inner(company_id)')
      .eq('user_id', userId)
      .eq('ledgers.company_id', companyName)
      .gte('entry_date', from)
      .lte('entry_date', to);
    data = result.data;
    error = result.error;
  } else if (ledgerIds.length) {
    const result = await (supabase as any)
      .from('ledger_entries')
      .select('ledger_id, debit_amount, credit_amount')
      .in('ledger_id', ledgerIds)
      .eq('user_id', userId)
      .gte('entry_date', from)
      .lte('entry_date', to);
    data = result.data;
    error = result.error;
  } else {
    return map;
  }

  if (error) {
    logger.error('ledgerReportService: loadMovements', error);
    return map;
  }

  (data || []).forEach((entry: any) => {
    const cur = map.get(entry.ledger_id) || { debits: 0, credits: 0 };
    map.set(entry.ledger_id, {
      debits: cur.debits + (Number(entry.debit_amount) || 0),
      credits: cur.credits + (Number(entry.credit_amount) || 0),
    });
  });
  return map;
}

async function loadPrePeriodMovements(
  ledgerIds: string[],
  userId: string,
  fyStart: string,
  dateFrom: string,
  companyName?: string
): Promise<Map<string, Movement>> {
  const dayBefore = new Date(dateFrom);
  dayBefore.setDate(dayBefore.getDate() - 1);
  const preEnd = dayBefore.toISOString().split('T')[0];
  if (preEnd < fyStart) return new Map();
  return loadMovements(ledgerIds, userId, fyStart, preEnd, companyName);
}

async function resolveMapping(params: LedgerReportParams) {
  const stored =
    params.mapping ||
    (await getLedgerMappingSettings(params.userId, params.companyName));
  return ensureDefaultChartOfAccounts(
    params.userId,
    params.companyName,
    stored
  );
}

function sumMovementForIds(map: Map<string, Movement>, ids: string[] = []) {
  return ids.reduce(
    (acc, id) => {
      const m = map.get(id) || { debits: 0, credits: 0 };
      return { debits: acc.debits + m.debits, credits: acc.credits + m.credits };
    },
    { debits: 0, credits: 0 }
  );
}

function netIncome(m: Movement) {
  return m.credits - m.debits;
}

function netExpense(m: Movement) {
  return m.debits - m.credits;
}

export async function generateTrialBalanceFromLedger(params: LedgerReportParams) {
  const mapping = await resolveMapping(params);
  const fy = getFinancialYearForDate(new Date(params.dateFrom));
  const ledgers = await loadLedgers(params, fy.label, mapping);
  const ledgerIds = ledgers.map((l) => l.id);
  const periodMap = await loadMovements(
    ledgerIds,
    params.userId,
    params.dateFrom,
    params.dateTo,
    params.companyName
  );
  const preMap = await loadPrePeriodMovements(
    ledgerIds,
    params.userId,
    fy.start.toISOString().split('T')[0],
    params.dateFrom,
    params.companyName
  );

  const rows = ledgers.map((l) => {
    const period = periodMap.get(l.id) || { debits: 0, credits: 0 };
    const pre = preMap.get(l.id) || { debits: 0, credits: 0 };
    const openingBalance = signedBalance(l, { debits: 0, credits: 0 }, pre);
    const closingBalance = signedBalance(l, period, pre);
    const isCredit = isCreditBalanceType(l.ledger_type);

    let closingDebit = 0;
    let closingCredit = 0;
    if (isCredit) {
      if (closingBalance >= 0) closingCredit = closingBalance;
      else closingDebit = Math.abs(closingBalance);
    } else {
      if (closingBalance >= 0) closingDebit = closingBalance;
      else closingCredit = Math.abs(closingBalance);
    }

    return {
      subcategory: l.name,
      amount: closingBalance,
      category: l.ledger_type,
      opening_balance: openingBalance,
      debits: period.debits,
      credits: period.credits,
      closing_debit: closingDebit,
      closing_credit: closingCredit,
      closing_balance: closingBalance,
    };
  });

  const totalDebits = rows.reduce((s, r) => s + (Number(r.closing_debit) || 0), 0);
  const totalCredits = rows.reduce((s, r) => s + (Number(r.closing_credit) || 0), 0);
  const periodDebits = rows.reduce((s, r) => s + (Number(r.debits) || 0), 0);
  const periodCredits = rows.reduce((s, r) => s + (Number(r.credits) || 0), 0);

  return {
    rows,
    summary: {
      totalSales: totalCredits,
      totalPurchases: totalDebits,
      grossProfit: periodDebits - periodCredits,
      netProfit: totalDebits - totalCredits,
      periodDebits,
      periodCredits,
      totalClosingDebits: totalDebits,
      totalClosingCredits: totalCredits,
    },
  };
}

export async function generateProfitAndLossFromLedger(params: LedgerReportParams) {
  const mapping = await resolveMapping(params);
  const fy = getFinancialYearForDate(new Date(params.dateFrom));
  const ledgers = await loadLedgers(params, fy.label, mapping);
  const ledgerIds = [...new Set([...ledgers.map((l) => l.id), ...mappingLedgerIds(mapping)])];
  const periodMap = await loadMovements(
    ledgerIds,
    params.userId,
    params.dateFrom,
    params.dateTo,
    params.companyName
  );
  const preMap = await loadPrePeriodMovements(
    ledgerIds,
    params.userId,
    fy.start.toISOString().split('T')[0],
    params.dateFrom,
    params.companyName
  );

  const salesM = mapping.salesAccountId
    ? periodMap.get(mapping.salesAccountId) || { debits: 0, credits: 0 }
    : { debits: 0, credits: 0 };
  const purchaseM = mapping.purchaseAccountId
    ? periodMap.get(mapping.purchaseAccountId) || { debits: 0, credits: 0 }
    : { debits: 0, credits: 0 };

  let netSales = Math.max(0, netIncome(salesM));
  let netPurchases = Math.max(0, netExpense(purchaseM));

  if (netSales === 0) {
    for (const l of ledgers) {
      if (l.name.toLowerCase() !== 'sales account') continue;
      const candidate = Math.max(
        0,
        netIncome(periodMap.get(l.id) || { debits: 0, credits: 0 })
      );
      if (candidate > 0) {
        netSales = candidate;
        break;
      }
    }
  }
  if (netPurchases === 0) {
    for (const l of ledgers) {
      if (l.name.toLowerCase() !== 'purchase account') continue;
      const candidate = Math.max(
        0,
        netExpense(periodMap.get(l.id) || { debits: 0, credits: 0 })
      );
      if (candidate > 0) {
        netPurchases = candidate;
        break;
      }
    }
  }

  const directExpenseIds = mapping.directExpenseAccountIds || [];
  const directExpenses = Math.max(
    0,
    netExpense(sumMovementForIds(periodMap, directExpenseIds))
  );

  const indirectExpenseIds = [
    ...(mapping.indirectExpenseAccountIds || []),
    ...(mapping.discountAllowedAccountId ? [mapping.discountAllowedAccountId] : []),
  ];
  const indirectIncomeIds = [
    ...(mapping.indirectIncomeAccountIds || []),
    ...(mapping.discountReceivedAccountId ? [mapping.discountReceivedAccountId] : []),
  ];

  const indirectExpenses = Math.max(
    0,
    netExpense(sumMovementForIds(periodMap, indirectExpenseIds))
  );
  const indirectIncome = Math.max(
    0,
    netIncome(sumMovementForIds(periodMap, indirectIncomeIds))
  );

  let openingStock = 0;
  let closingStock = 0;

  try {
    const stockValuation = await getStockValuationForPeriod({
      companyId: params.companyName,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
    });
    openingStock = stockValuation.openingStock;
    closingStock = stockValuation.closingStock;
  } catch (stockError) {
    logger.error('ledgerReportService: stock valuation failed', stockError);
  }

  // Fallback: Stock-in-Hand ledger if inventory module has no valued stock
  if (openingStock === 0 && closingStock === 0 && mapping.stockInHandAccountId) {
    const stockLedger = ledgers.find((l) => l.id === mapping.stockInHandAccountId);
    if (stockLedger) {
      const pre = preMap.get(stockLedger.id) || { debits: 0, credits: 0 };
      const period = periodMap.get(stockLedger.id) || { debits: 0, credits: 0 };
      openingStock = signedBalance(stockLedger, { debits: 0, credits: 0 }, pre);
      closingStock = signedBalance(stockLedger, period, pre);
    }
  }

  // When there are no sales, purchases add to stock — closing must be opening + purchases.
  const impliedClosingStock = openingStock + netPurchases + directExpenses;
  if (netSales === 0 && impliedClosingStock > closingStock + 0.01) {
    closingStock = impliedClosingStock;
  }

  const cogs = openingStock + netPurchases + directExpenses - closingStock;
  const grossProfit = netSales - cogs;
  const netProfit = grossProfit - indirectExpenses + indirectIncome;

  const grossProfitCategory = grossProfit >= 0 ? 'Gross Profit' : 'Gross Loss';
  const netProfitCategory = netProfit >= 0 ? 'Net Profit' : 'Net Loss';

  const rows = [
    { subcategory: 'Sales Account', amount: netSales, category: 'Revenue' },
    { subcategory: 'Opening Stock', amount: openingStock, category: 'Cost of Goods Sold' },
    { subcategory: 'Purchase Account', amount: netPurchases, category: 'Cost of Goods Sold' },
    { subcategory: 'Direct Expenses', amount: directExpenses, category: 'Cost of Goods Sold' },
    { subcategory: 'Less: Closing Stock', amount: closingStock, category: 'Cost of Goods Sold' },
    { subcategory: 'Cost of Goods Sold', amount: cogs, category: 'Cost of Goods Sold' },
    { subcategory: '', amount: grossProfit, category: grossProfitCategory },
    { subcategory: 'Indirect Expenses', amount: indirectExpenses, category: 'Indirect Expenses' },
    { subcategory: 'Indirect Income', amount: indirectIncome, category: 'Indirect Income' },
    { subcategory: '', amount: netProfit, category: netProfitCategory },
  ];

  return {
    rows,
    summary: {
      totalSales: netSales,
      totalPurchases: netPurchases,
      grossProfit,
      netProfit,
      openingStock,
      closingStock,
      cogs,
      directExpenses,
      indirectExpenses,
      indirectIncome,
    },
  };
}

export async function generateBalanceSheetFromLedger(params: LedgerReportParams) {
  const mapping = await resolveMapping(params);
  const fy = getFinancialYearForDate(new Date(params.dateTo));
  const ledgers = await loadLedgers(params, fy.label, mapping);
  const ledgerIds = ledgers.map((l) => l.id);
  const fyStart = fy.start.toISOString().split('T')[0];
  const movements = await loadMovements(
    ledgerIds,
    params.userId,
    fyStart,
    params.dateTo,
    params.companyName
  );

  const assetRows: any[] = [];
  const liabilityRows: any[] = [];
  const equityRows: any[] = [];
  let plBalance = 0;

  ledgers.forEach((l) => {
    const m = movements.get(l.id) || { debits: 0, credits: 0 };
    const balance = signedBalance(l, m);
    const type = (l.ledger_type || '').toLowerCase();

    if (['income', 'revenue', 'expense', 'expenses'].includes(type)) {
      plBalance += isCreditBalanceType(type) ? balance : -balance;
      return;
    }

    const row = { subcategory: l.name, amount: balance, category: '' };
    if (['capital', 'equity'].includes(type)) {
      row.category = 'Equity';
      equityRows.push(row);
    } else if (
      ['loan', 'payables', 'liability', 'sundry creditor', 'creditor'].includes(type)
    ) {
      row.category = 'Liability';
      liabilityRows.push(row);
    } else {
      row.category = 'Asset';
      assetRows.push(row);
    }
  });

  if (plBalance !== 0) {
    liabilityRows.push({
      subcategory: 'Profit & Loss A/c',
      amount: plBalance > 0 ? plBalance : 0,
      category: 'Liability',
    });
    if (plBalance < 0) {
      assetRows.push({
        subcategory: 'Profit & Loss A/c (Loss)',
        amount: Math.abs(plBalance),
        category: 'Asset',
      });
    }
  }

  const totalAssets = assetRows.reduce((s, r) => s + r.amount, 0);
  const totalLiabilities = liabilityRows.reduce((s, r) => s + r.amount, 0);
  const totalEquity = equityRows.reduce((s, r) => s + r.amount, 0);

  return {
    rows: [...assetRows, ...liabilityRows, ...equityRows],
    summary: {
      totalAssets,
      totalLiabilities,
      totalEquity,
      netProfit: plBalance,
      totalSales: totalAssets,
      totalPurchases: totalLiabilities + totalEquity,
      grossProfit: 0,
    },
  };
}

export async function generateLedgerSummaryFromLedger(params: LedgerReportParams) {
  const result = await generateTrialBalanceFromLedger(params);

  const assetTypes = new Set(['asset', 'cash', 'bank', 'receivables']);
  const liabilityTypes = new Set([
    'payables',
    'liability',
    'loan',
    'sundry creditor',
    'creditor',
    'secondary loan',
    'unsecured loan',
  ]);
  const equityTypes = new Set(['capital', 'equity']);
  const incomeTypes = new Set(['income', 'revenue']);
  const expenseTypes = new Set(['expense', 'expenses']);

  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalEquity = 0;
  let totalIncome = 0;
  let totalExpenses = 0;

  result.rows.forEach((row: any) => {
    const type = String(row.category || '').toLowerCase();
    const bal = Number(row.closing_balance) || 0;

    if (assetTypes.has(type)) totalAssets += Math.max(0, bal);
    else if (liabilityTypes.has(type)) totalLiabilities += Math.max(0, bal);
    else if (equityTypes.has(type)) totalEquity += Math.max(0, bal);
    else if (incomeTypes.has(type)) totalIncome += Math.max(0, bal);
    else if (expenseTypes.has(type)) totalExpenses += Math.max(0, bal);
    else if (bal >= 0) totalAssets += bal;
    else totalLiabilities += Math.abs(bal);
  });

  return {
    rows: result.rows,
    summary: {
      ...result.summary,
      totalAssets,
      totalLiabilities,
      totalEquity,
      totalIncome,
      totalExpenses,
    },
  };
}
