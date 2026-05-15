-- Fix RLS policy for suppliers to allow viewing suppliers with null user_id
-- This is needed for legacy suppliers created before user_id was added

-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Users can view their own suppliers" ON public.suppliers;

-- Create a new policy that allows:
-- 1. Suppliers where user_id matches the current user
-- 2. Suppliers where user_id is NULL (legacy suppliers)
CREATE POLICY "Users can view their own suppliers" ON public.suppliers
  FOR SELECT USING (
    auth.uid() = user_id OR user_id IS NULL
  );

