-- Remove the automatic 11-month trial trigger as requested.
-- Trial logic is now handled strictly by the App/Play stores.

DROP TRIGGER IF EXISTS on_user_signup_create_subscription ON auth.users;
DROP FUNCTION IF EXISTS public.create_initial_subscription();

-- Ensure profiles have subscription_status column
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'expired';

-- Update all current 'active' trials that were created via trigger to 'active'
-- (They will stay active until they actually expire based on their end_date)
-- But new users will start with 'expired' status until they purchase/start trial via store.
