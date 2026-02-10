-- Add opening stock fields to products for better P&L reporting
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS opening_stock_qty NUMERIC;

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS opening_stock_value NUMERIC;

