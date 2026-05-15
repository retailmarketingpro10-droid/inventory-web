-- Subscription Renewal Logic: 1 year (365 days)
-- If renewed before expiry: extend from current end_date
-- If renewed after expiry: start from today

CREATE OR REPLACE FUNCTION public.set_subscription_dates()
RETURNS TRIGGER AS $$
DECLARE
    last_end_date TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Only set dates if they are not already manually provided (e.g., from Apple/Play Store)
    -- or if we want to enforce the 1-year logic for all new subscriptions.
    
    -- Find the latest active end_date for this user
    SELECT MAX(end_date) INTO last_end_date
    FROM public.subscriptions
    WHERE user_id = NEW.user_id
      AND payment_status = 'paid'
      AND subscription_status = 'active';

    IF last_end_date IS NOT NULL AND last_end_date > now() THEN
        -- Case: Renewed before expiry
        NEW.start_date := last_end_date;
        NEW.end_date := last_end_date + INTERVAL '365 days';
    ELSE
        -- Case: Renewed after expiry or first-time subscription
        NEW.start_date := now();
        NEW.end_date := now() + INTERVAL '365 days';
    END IF;

    -- Ensure other defaults
    NEW.subscription_status := 'active';
    NEW.plan_name := COALESCE(NEW.plan_name, 'Annual');
    NEW.created_at := now();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to set dates before insertion
DROP TRIGGER IF EXISTS tr_set_subscription_dates ON public.subscriptions;
CREATE TRIGGER tr_set_subscription_dates
BEFORE INSERT ON public.subscriptions
FOR EACH ROW
WHEN (NEW.payment_status = 'paid')
EXECUTE FUNCTION public.set_subscription_dates();
