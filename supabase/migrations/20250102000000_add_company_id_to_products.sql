-- Add company_id column to products table
-- This will store the company_name to associate products with companies
ALTER TABLE public.products 
ADD COLUMN company_id TEXT;

-- Create index for better query performance
CREATE INDEX idx_products_company_id ON public.products(company_id);

-- Update RLS policies to allow filtering by company_id
-- Note: Products are already filtered by user_id via RLS, so company_id is an additional filter

