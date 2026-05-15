-- Add supplier_id column to products table (optional relationship)
-- This allows products to be linked to their primary supplier
ALTER TABLE public.products 
ADD COLUMN supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL;

-- Create index for better query performance
CREATE INDEX idx_products_supplier_id ON public.products(supplier_id);

