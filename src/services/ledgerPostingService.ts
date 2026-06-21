import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

export type LedgerSide = "debit" | "credit";

export interface LedgerPostingLine {
  ledger_id: string;
  amount: number;
  side: LedgerSide;
}

export interface CreateLedgerTransactionParams {
  description: string;
  companyId: string;
  financialYear: string;
  userId: string;
  entryDate: string; // ISO date (YYYY-MM-DD)
  lines: LedgerPostingLine[];
  voucherType?: string;
  invoiceId?: string;
  referenceNumber?: string;
}

/**
 * Creates a balanced double-entry ledger transaction by:
 * - inserting a row into ledger_transactions
 * - inserting matching rows into ledger_entries with the same transaction_id
 * The caller is responsible for ensuring debits = credits.
 */
export async function createLedgerTransaction(params: CreateLedgerTransactionParams) {
  const {
    description,
    companyId,
    financialYear,
    userId,
    entryDate,
    lines,
    voucherType,
    invoiceId,
    referenceNumber,
  } = params;

  if (!lines || lines.length < 2) {
    throw new Error("A ledger transaction must contain at least two lines.");
  }

  const totalDebits = lines
    .filter((l) => l.side === "debit")
    .reduce((sum, l) => sum + (l.amount || 0), 0);
  const totalCredits = lines
    .filter((l) => l.side === "credit")
    .reduce((sum, l) => sum + (l.amount || 0), 0);

  if (Math.round((totalDebits - totalCredits) * 100) !== 0) {
    throw new Error(
      `Unbalanced ledger transaction: debits ${totalDebits} ≠ credits ${totalCredits}`
    );
  }

  const { data: tx, error: txError } = await (supabase as any)
    .from("ledger_transactions")
    .insert([
      {
        description,
        company_id: companyId,
        financial_year: financialYear,
        user_id: userId,
        transaction_date: entryDate,
        voucher_type: voucherType || "journal",
        invoice_id: invoiceId || null,
        reference_number: referenceNumber || null,
      },
    ])
    .select()
    .single();

  if (txError) {
    logger.error("Failed to create ledger transaction:", txError);
    throw txError;
  }

  const transactionId = tx.id as string;

  const entryRows = lines.map((line) => ({
    ledger_id: line.ledger_id,
    entry_date: entryDate,
    description,
    debit_amount: line.side === "debit" ? line.amount : 0,
    credit_amount: line.side === "credit" ? line.amount : 0,
    financial_year: financialYear,
    user_id: userId,
    transaction_id: transactionId,
  }));

  const { error: entriesError } = await (supabase as any)
    .from("ledger_entries")
    .insert(entryRows);

  if (entriesError) {
    logger.error("Failed to create ledger entries for transaction:", entriesError);
    throw entriesError;
  }

  return { transactionId };
}

