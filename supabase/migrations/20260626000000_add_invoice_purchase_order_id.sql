-- Link purchase invoices to their source PO so reports can avoid double-counting
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_purchase_order_id
  ON public.invoices(purchase_order_id)
  WHERE purchase_order_id IS NOT NULL;
