-- Link sale/purchase returns to the original invoice (credit/debit note reference)
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS original_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_original_invoice_id
  ON public.invoices(original_invoice_id);
