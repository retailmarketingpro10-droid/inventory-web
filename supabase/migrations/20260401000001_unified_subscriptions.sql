-- Update subscriptions table to support unified tracking across Web and Mobile
ALTER TABLE public.subscriptions 
ADD COLUMN IF NOT EXISTS payment_gateway TEXT,
ADD COLUMN IF NOT EXISTS plan_name TEXT;

-- Rename amount_paid to payment_amount to match user request
DO $$ 
BEGIN 
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='subscriptions' AND column_name='amount_paid') THEN
    ALTER TABLE public.subscriptions RENAME COLUMN amount_paid TO payment_amount;
  END IF;
END $$;

-- Drop the automatic trial trigger to ensure users must pay/verify to activate
DROP TRIGGER IF EXISTS on_user_signup_create_subscription ON auth.users;
DROP FUNCTION IF EXISTS public.create_initial_subscription();

-- Ensure profile has the right fields for unified status
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'none';

-- Update check_subscription_expiry to be more robust
CREATE OR REPLACE FUNCTION public.check_subscription_expiry()
RETURNS void AS $$
BEGIN
  -- Mark subscriptions as expired if end_date is past
  UPDATE public.subscriptions
  SET status = 'expired',
      updated_at = now()
  WHERE status = 'active'
    AND end_date < CURRENT_DATE;
  
  -- Sync profile status from the most recent subscription
  -- Using a subquery to find the latest subscription per user
  UPDATE public.profiles p
  SET subscription_status = s.status,
      payment_status = s.payment_status,
      subscription_plan = s.plan_name
  FROM (
      SELECT DISTINCT ON (user_id) user_id, status, payment_status, plan_name
      FROM public.subscriptions
      ORDER BY user_id, end_date DESC
  ) s
  WHERE p.id = s.user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
