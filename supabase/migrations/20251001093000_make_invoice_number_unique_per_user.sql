-- Make invoice_number unique per user instead of globally
-- 1) Drop existing global unique constraint if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'invoices' AND c.conname = 'invoices_invoice_number_key'
  ) THEN
    ALTER TABLE public.invoices DROP CONSTRAINT invoices_invoice_number_key;
  END IF;
END $$;

-- 2) Ensure user_id column exists (added in earlier migration) and create new unique index
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' AND indexname = 'invoices_user_id_invoice_number_key'
  ) THEN
    CREATE UNIQUE INDEX invoices_user_id_invoice_number_key
    ON public.invoices (user_id, invoice_number);
  END IF;
END $$;



