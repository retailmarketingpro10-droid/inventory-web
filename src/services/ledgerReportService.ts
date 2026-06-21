import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { LedgerMappingSettings } from '@/config/ledgerAccounts';
import { getLedgerMappingSettings } from '@/services/accountingSettingsService';
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

async function loadLedgers(params: LedgerReportParams, fyLabel: string) {
  const { data, error } = await (supabase as any)
    .from('ledgers')
    .select('id, name, ledger_type, opening_balance')
    .eq('company_id', params.companyName)
    .eq('user_id', params.userId)
    .eq('financial_year', fyLabel);

  if (error) {
    logger.error('ledgerReportService: loadLedgers', error);
    return [];
  }
  return (data || []) as LedgerRow[];
}

async function loadMovements(
  ledgerIds: string[],
  userId: string,
  fyLabel: string,
  from: string,
  to: string
): Promise<Map<string, Movement>> {
  const map = new Map<string, Movement>();
  if (!ledgerIds.length) return map;

  const { data, error } = await (supabase as any)
    .from('ledger_entries')
    .select('ledger_id, debit_amount, credit_amount')
    .in('ledger_id', ledgerIds)
    .eq('user_id', userId)
    .eq('financial_year', fyLabel)
    .gte('entry_date', from)
    .lte('entry_date', to);

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
  fyLabel: string,
  fyStart: string,
  dateFrom: string
): Promise<Map<string, Movement>> {
  return loadMovements(ledgerIds, userId, fyLabel, fyStart, dateFrom);
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
  const fy = getFinancialYearForDate(new Date(params.dateFrom));
  const ledgers = await loadLedgers(params, fy.label);
  const ledgerIds = ledgers.map((l) => l.id);
  const periodMap = await loadMovements(
    ledgerIds,
    params.userId,
    fy.label,
    params.dateFrom,
    params.dateTo
  );
  const preMap = await loadPrePeriodMovements(
    ledgerIds,
    params.userId,
    fy.label,
    fy.start.toISOString().split('T')[0],
    params.dateFrom
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

  return {
    rows,
    summary: {
      totalSales: totalCredits,
      totalPurchases: totalDebits,
      grossProfit: rows.reduce((s, r) => s + r.debits, 0),
      netProfit: totalDebits - totalCredits,
      periodCredits: rows.reduce((s, r) => s + r.credits, 0),
    },
  };
}

export async function generateProfitAndLossFromLedger(params: LedgerReportParams) {
  const mapping =
    params.mapping ||
    (await getLedgerMappingSettings(params.userId, params.companyName));
  const fy = getFinancialYearForDate(new Date(params.dateFrom));
  const ledgers = await loadLedgers(params, fy.label);
  const ledgerIds = ledgers.map((l) => l.id);
  const periodMap = await loadMovements(
    ledgerIds,
    params.userId,
    fy.label,
    params.dateFrom,
    params.dateTo
  );
  const preMap = await loadPrePeriodMovements(
    ledgerIds,
    params.userId,
    fy.label,
    fy.start.toISOString().split('T')[0],
    params.dateFrom
  );

  const salesM = mapping.salesAccountId
    ? periodMap.get(mapping.salesAccountId) || { debits: 0, credits: 0 }
    : { debits: 0, credits: 0 };
  const purchaseM = mapping.purchaseAccountId
    ? periodMap.get(mapping.purchaseAccountId) || { debits: 0, credits: 0 }
    : { debits: 0, credits: 0 };

  const netSales = Math.max(0, netIncome(salesM));
  const netPurchases = Math.max(0, netExpense(purchaseM));

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
  if (mapping.stockInHandAccountId) {
    const stockLedger = ledgers.find((l) => l.id === mapping.stockInHandAccountId);
    if (stockLedger) {
      const pre = preMap.get(stockLedger.id) || { debits: 0, credits: 0 };
      const period = periodMap.get(stockLedger.id) || { debits: 0, credits: 0 };
      openingStock = signedBalance(stockLedger, { debits: 0, credits: 0 }, pre);
      closingStock = signedBalance(stockLedger, period, pre);
    }
  }

  const cogs = openingStock + netPurchases + directExpenses - closingStock;
  const grossProfit = netSales - cogs;
  const netProfit = grossProfit - indirectExpenses + indirectIncome;

  const rows = [
    { subcategory: 'Sales Account', amount: netSales, category: 'Revenue' },
    { subcategory: 'Opening Stock', amount: openingStock, category: 'Cost of Goods Sold' },
    { subcategory: 'Purchase Account', amount: netPurchases, category: 'Cost of Goods Sold' },
    { subcategory: 'Direct Expenses', amount: directExpenses, category: 'Cost of Goods Sold' },
    { subcategory: 'Less: Closing Stock', amount: -closingStock, category: 'Cost of Goods Sold' },
    { subcategory: 'Cost of Goods Sold', amount: cogs, category: 'Cost of Goods Sold' },
    { subcategory: '', amount: grossProfit, category: 'Gross Profit' },
    { subcategory: 'Indirect Expenses', amount: indirectExpenses, category: 'Indirect Expenses' },
    { subcategory: 'Indirect Income', amount: indirectIncome, category: 'Indirect Income' },
    { subcategory: '', amount: netProfit, category: 'Net Profit' },
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
  const fy = getFinancialYearForDate(new Date(params.dateTo));
  const ledgers = await loadLedgers(params, fy.label);
  const ledgerIds = ledgers.map((l) => l.id);
  const fyStart = fy.start.toISOString().split('T')[0];
  const movements = await loadMovements(
    ledgerIds,
    params.userId,
    fy.label,
    fyStart,
    params.dateTo
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
  return result;
}
