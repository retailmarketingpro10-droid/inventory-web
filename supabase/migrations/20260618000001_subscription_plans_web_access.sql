-- Subscription plans: free mobile (no web), monthly, yearly (web + mobile via IAP)

-- Extend subscription_type to include free_mobile and yearly
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_subscription_type_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_subscription_type_check
  CHECK (subscription_type IN ('trial', 'annual', 'monthly', 'yearly', 'free_mobile'));

-- Optional explicit web flag (can also be derived from subscription_type in app)
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS web_access BOOLEAN DEFAULT false;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS plan_name TEXT;

-- Backfill: legacy trial / unpaid rows = free mobile, no web
UPDATE public.subscriptions
SET
  subscription_type = 'free_mobile',
  web_access = false,
  plan_name = COALESCE(plan_name, 'Free Mobile')
WHERE payment_status IS DISTINCT FROM 'paid'
   OR subscription_type = 'trial';

-- Paid annual → yearly plan with web
UPDATE public.subscriptions
SET
  subscription_type = CASE
    WHEN subscription_type = 'annual' THEN 'yearly'
    ELSE subscription_type
  END,
  web_access = true,
  plan_name = CASE
    WHEN subscription_type IN ('annual', 'yearly') THEN COALESCE(plan_name, 'Yearly')
    WHEN subscription_type = 'monthly' THEN COALESCE(plan_name, 'Monthly')
    ELSE plan_name
  END
WHERE payment_status = 'paid'
  AND subscription_type IN ('annual', 'monthly', 'yearly');

COMMENT ON COLUMN public.subscriptions.web_access IS
  'When true, user may access the web app. Set by IAP verification (monthly/yearly).';
