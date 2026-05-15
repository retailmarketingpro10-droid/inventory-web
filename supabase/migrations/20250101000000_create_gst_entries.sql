-- Create GST entries table for enhanced CGST/SGST/IGST tracking
CREATE TABLE public.gst_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('sale', 'purchase', 'sale_return', 'purchase_return')),
  entity_name TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  invoice_date DATE NOT NULL,
  taxable_amount DECIMAL(12,2) NOT NULL,
  gst_rate DECIMAL(5,2) NOT NULL,
  cgst DECIMAL(12,2) NOT NULL DEFAULT 0,
  sgst DECIMAL(12,2) NOT NULL DEFAULT 0,
  igst DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_gst DECIMAL(12,2) NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL,
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  is_interstate BOOLEAN NOT NULL DEFAULT false,
  user_id UUID REFERENCES auth.users(id),
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX idx_gst_entries_transaction_type ON public.gst_entries(transaction_type);
CREATE INDEX idx_gst_entries_invoice_date ON public.gst_entries(invoice_date);
CREATE INDEX idx_gst_entries_user_id ON public.gst_entries(user_id);
CREATE INDEX idx_gst_entries_states ON public.gst_entries(from_state, to_state);

-- Enable Row Level Security
ALTER TABLE public.gst_entries ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own GST entries" ON public.gst_entries
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own GST entries" ON public.gst_entries
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own GST entries" ON public.gst_entries
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own GST entries" ON public.gst_entries
  FOR DELETE USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_gst_entries_updated_at 
  BEFORE UPDATE ON public.gst_entries 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

