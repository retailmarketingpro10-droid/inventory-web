-- Unified ledger posting: create ledger_transactions if missing, add voucher metadata,
-- link ledger_entries, remove duplicate invoice trigger.

-- 1. Core voucher header table (safe if already created by 20260311000000)
CREATE TABLE IF NOT EXISTS public.ledger_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  company_id TEXT,
  financial_year TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  voucher_type TEXT,
  reference_number TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 2. Add columns when table existed from an older migration without them
ALTER TABLE public.ledger_transactions
  ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS voucher_type TEXT,
  ADD COLUMN IF NOT EXISTS reference_number TEXT;

-- 3. Link ledger_entries to voucher headers
ALTER TABLE public.ledger_entries
  ADD COLUMN IF NOT EXISTS transaction_id UUID REFERENCES public.ledger_transactions(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_ledger_entries_transaction_id
  ON public.ledger_entries(transaction_id);

CREATE INDEX IF NOT EXISTS idx_ledger_transactions_invoice_id
  ON public.ledger_transactions(invoice_id);

CREATE INDEX IF NOT EXISTS idx_ledger_transactions_voucher_type
  ON public.ledger_transactions(voucher_type);

CREATE INDEX IF NOT EXISTS idx_ledger_transactions_user_id
  ON public.ledger_transactions(user_id);

CREATE INDEX IF NOT EXISTS idx_ledger_transactions_company_id
  ON public.ledger_transactions(company_id);

-- 4. RLS for ledger_transactions
ALTER TABLE public.ledger_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own ledger transactions" ON public.ledger_transactions;
CREATE POLICY "Users can view their own ledger transactions"
  ON public.ledger_transactions
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own ledger transactions" ON public.ledger_transactions;
CREATE POLICY "Users can create their own ledger transactions"
  ON public.ledger_transactions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own ledger transactions" ON public.ledger_transactions;
CREATE POLICY "Users can update their own ledger transactions"
  ON public.ledger_transactions
  FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own ledger transactions" ON public.ledger_transactions;
CREATE POLICY "Users can delete their own ledger transactions"
  ON public.ledger_transactions
  FOR DELETE
  USING (auth.uid() = user_id);

-- 5. Remove DB trigger that duplicated client-side posting
DROP TRIGGER IF EXISTS trigger_auto_balance_invoice_ledger ON public.invoices;
DROP FUNCTION IF EXISTS public.auto_balance_invoice_ledger();

-- ledger_mapping is stored in profiles.business_entities[].ledger_mapping (JSON)
