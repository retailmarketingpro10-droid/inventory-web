/** Standard ledger roles — maps to Tally-style primary groups */
export type LedgerRole =
  | 'sales'
  | 'purchase'
  | 'cash'
  | 'bank'
  | 'sundry_debtors'
  | 'sundry_creditors'
  | 'discount_allowed'
  | 'discount_received'
  | 'output_cgst'
  | 'output_sgst'
  | 'output_igst'
  | 'input_cgst'
  | 'input_sgst'
  | 'input_igst'
  | 'stock_in_hand'
  | 'direct_expense'
  | 'indirect_expense'
  | 'indirect_income'
  | 'capital';

export interface LedgerMappingSettings {
  salesAccountId?: string;
  purchaseAccountId?: string;
  cashAccountId?: string;
  bankAccountId?: string;
  sundryDebtorsAccountId?: string;
  sundryCreditorsAccountId?: string;
  discountAllowedAccountId?: string;
  discountReceivedAccountId?: string;
  outputCgstAccountId?: string;
  outputSgstAccountId?: string;
  outputIgstAccountId?: string;
  inputCgstAccountId?: string;
  inputSgstAccountId?: string;
  inputIgstAccountId?: string;
  stockInHandAccountId?: string;
  directExpenseAccountIds?: string[];
  indirectExpenseAccountIds?: string[];
  indirectIncomeAccountIds?: string[];
  capitalAccountId?: string;
  /** Post balanced voucher when invoice is saved */
  postOnInvoice?: boolean;
  /** Post receipt/payment voucher when payment is recorded */
  postOnPayment?: boolean;
}

export const DEFAULT_LEDGER_MAPPING: LedgerMappingSettings = {
  postOnInvoice: true,
  postOnPayment: true,
  directExpenseAccountIds: [],
  indirectExpenseAccountIds: [],
  indirectIncomeAccountIds: [],
};

export const DEFAULT_CHART_OF_ACCOUNTS: Array<{
  role: LedgerRole;
  name: string;
  ledger_type: string;
}> = [
  { role: 'sales', name: 'Sales Account', ledger_type: 'income' },
  { role: 'purchase', name: 'Purchase Account', ledger_type: 'expense' },
  { role: 'cash', name: 'Cash', ledger_type: 'cash' },
  { role: 'bank', name: 'Bank', ledger_type: 'bank' },
  { role: 'sundry_debtors', name: 'Sundry Debtors', ledger_type: 'receivables' },
  { role: 'sundry_creditors', name: 'Sundry Creditors', ledger_type: 'payables' },
  { role: 'discount_allowed', name: 'Discount Allowed', ledger_type: 'expense' },
  { role: 'discount_received', name: 'Discount Received', ledger_type: 'income' },
  { role: 'output_cgst', name: 'Output CGST', ledger_type: 'liability' },
  { role: 'output_sgst', name: 'Output SGST', ledger_type: 'liability' },
  { role: 'output_igst', name: 'Output IGST', ledger_type: 'liability' },
  { role: 'input_cgst', name: 'Input CGST', ledger_type: 'asset' },
  { role: 'input_sgst', name: 'Input SGST', ledger_type: 'asset' },
  { role: 'input_igst', name: 'Input IGST', ledger_type: 'asset' },
  { role: 'stock_in_hand', name: 'Stock-in-Hand', ledger_type: 'asset' },
  { role: 'capital', name: 'Capital Account', ledger_type: 'capital' },
];

export const LEDGER_ROLE_LABELS: Record<LedgerRole, string> = {
  sales: 'Sales Account',
  purchase: 'Purchase Account',
  cash: 'Cash',
  bank: 'Bank',
  sundry_debtors: 'Sundry Debtors',
  sundry_creditors: 'Sundry Creditors',
  discount_allowed: 'Discount Allowed (Indirect Expense)',
  discount_received: 'Discount Received (Indirect Income)',
  output_cgst: 'Output CGST',
  output_sgst: 'Output SGST',
  output_igst: 'Output IGST',
  input_cgst: 'Input CGST',
  input_sgst: 'Input SGST',
  input_igst: 'Input IGST',
  stock_in_hand: 'Stock-in-Hand',
  direct_expense: 'Direct Expense',
  indirect_expense: 'Indirect Expense',
  indirect_income: 'Indirect Income',
  capital: 'Capital Account',
};

export function roleToMappingKey(role: LedgerRole): keyof LedgerMappingSettings | null {
  const map: Partial<Record<LedgerRole, keyof LedgerMappingSettings>> = {
    sales: 'salesAccountId',
    purchase: 'purchaseAccountId',
    cash: 'cashAccountId',
    bank: 'bankAccountId',
    sundry_debtors: 'sundryDebtorsAccountId',
    sundry_creditors: 'sundryCreditorsAccountId',
    discount_allowed: 'discountAllowedAccountId',
    discount_received: 'discountReceivedAccountId',
    output_cgst: 'outputCgstAccountId',
    output_sgst: 'outputSgstAccountId',
    output_igst: 'outputIgstAccountId',
    input_cgst: 'inputCgstAccountId',
    input_sgst: 'inputSgstAccountId',
    input_igst: 'inputIgstAccountId',
    stock_in_hand: 'stockInHandAccountId',
    capital: 'capitalAccountId',
  };
  return map[role] ?? null;
}
