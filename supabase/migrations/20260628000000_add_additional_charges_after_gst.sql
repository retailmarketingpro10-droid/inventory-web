-- Additional charges added after GST (freight, courier, packaging — no GST on these)
ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS additional_charges_after_gst DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS additional_charges_label TEXT;

COMMENT ON COLUMN public.invoices.additional_charges_after_gst IS
  'Non-taxable charges (freight, courier, packaging) added after GST on line items';
COMMENT ON COLUMN public.invoices.additional_charges_label IS
  'Display label for additional charges, e.g. Freight & Courier';
