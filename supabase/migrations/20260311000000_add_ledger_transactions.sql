-- Introduce ledger_transactions table and link it to ledger_entries
CREATE TABLE IF NOT EXISTS public.ledger_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  company_id TEXT,
  financial_year TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.ledger_entries
ADD COLUMN IF NOT EXISTS transaction_id UUID REFERENCES public.ledger_transactions(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_ledger_entries_transaction_id
ON public.ledger_entries(transaction_id);

