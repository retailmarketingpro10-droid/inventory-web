-- Tighten supplier visibility: each user sees only their own suppliers (not global legacy rows)
DROP POLICY IF EXISTS "Users can view their own suppliers" ON public.suppliers;

CREATE POLICY "Users can view their own suppliers" ON public.suppliers
  FOR SELECT USING (auth.uid() = user_id);

-- Best-effort backfill for legacy rows missing owner / company
UPDATE public.suppliers s
SET user_id = sub.user_id
FROM (
  SELECT DISTINCT ON (supplier_id) supplier_id, user_id
  FROM public.purchase_orders
  WHERE supplier_id IS NOT NULL AND user_id IS NOT NULL
  ORDER BY supplier_id, created_at DESC
) sub
WHERE s.id = sub.supplier_id AND s.user_id IS NULL;

UPDATE public.suppliers s
SET user_id = sub.user_id,
    company_id = COALESCE(s.company_id, sub.company_id)
FROM (
  SELECT DISTINCT ON (supplier_id) supplier_id, user_id, company_id
  FROM public.products
  WHERE supplier_id IS NOT NULL AND user_id IS NOT NULL
  ORDER BY supplier_id, created_at DESC
) sub
WHERE s.id = sub.supplier_id AND s.user_id IS NULL;
