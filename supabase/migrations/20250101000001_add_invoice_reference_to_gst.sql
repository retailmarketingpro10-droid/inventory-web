-- Add invoice reference to GST entries table
ALTER TABLE public.gst_entries 
ADD COLUMN invoice_id UUID REFERENCES public.invoices(id) ON DELETE CASCADE;

-- Create index for better performance
CREATE INDEX idx_gst_entries_invoice_id ON public.gst_entries(invoice_id);

-- Update RLS policy to allow viewing GST entries linked to invoices
CREATE POLICY "Users can view GST entries linked to their invoices" ON public.gst_entries
  FOR SELECT USING (
    auth.uid() = user_id OR 
    invoice_id IN (
      SELECT id FROM public.invoices WHERE user_id = auth.uid()
    )
  );

