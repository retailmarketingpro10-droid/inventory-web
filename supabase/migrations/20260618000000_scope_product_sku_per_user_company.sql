-- Scope product SKU uniqueness per user + company (not globally).
-- Fixes bulk import 403 errors when another account already uses the same SKU/barcode.

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_sku_key;

-- Recreate as a non-unique lookup index (safe if index already exists as non-unique)
DROP INDEX IF EXISTS idx_products_sku;
CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products(sku);

CREATE UNIQUE INDEX IF NOT EXISTS products_user_company_sku_unique
  ON public.products (user_id, company_id, sku)
  WHERE sku IS NOT NULL;
