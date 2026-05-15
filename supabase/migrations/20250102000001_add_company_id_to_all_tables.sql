-- Add company_id column to invoices table
ALTER TABLE public.invoices 
ADD COLUMN company_id TEXT;

-- Add company_id column to purchase_orders table
ALTER TABLE public.purchase_orders 
ADD COLUMN company_id TEXT;

-- Add company_id column to suppliers table
ALTER TABLE public.suppliers 
ADD COLUMN company_id TEXT;

-- Create indexes for better query performance
CREATE INDEX idx_invoices_company_id ON public.invoices(company_id);
CREATE INDEX idx_purchase_orders_company_id ON public.purchase_orders(company_id);
CREATE INDEX idx_suppliers_company_id ON public.suppliers(company_id);

