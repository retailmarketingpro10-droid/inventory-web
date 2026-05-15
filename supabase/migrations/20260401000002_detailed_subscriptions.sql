-- Enhancing Unified Subscription System as per new requirements
-- Update subscriptions table
ALTER TABLE public.subscriptions 
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'INR',
ADD COLUMN IF NOT EXISTS payment_date TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Rename status to subscription_status for exact match
DO $$ 
BEGIN 
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='subscriptions' AND column_name='status') THEN
    ALTER TABLE public.subscriptions RENAME COLUMN status TO subscription_status;
  END IF;
END $$;

-- Create Payments Table for tracking history
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  amount DECIMAL(10,2) NOT NULL,
  payment_gateway TEXT NOT NULL, -- PAYU, PLAY_STORE, APPLE
  transaction_id TEXT,
  payment_response_json JSONB,
  payment_status TEXT NOT NULL, -- paid, failed, refunded
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_txn ON public.payments(transaction_id);

-- Enable RLS for payments
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own payments" ON public.payments FOR SELECT USING (auth.uid() = user_id);

-- Update profile for account status
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'inactive'; -- 'active' or 'inactive'

-- Function to handle renewal logic and activate user
CREATE OR REPLACE FUNCTION public.handle_subscription_activation()
RETURNS TRIGGER AS $$
BEGIN
  -- If payment is successful, activate the account
  IF NEW.payment_status = 'paid' THEN
    UPDATE public.profiles
    SET status = 'active',
        subscription_status = 'active',
        subscription_plan = NEW.plan_name,
        subscription_end_date = NEW.end_date
    WHERE id = NEW.user_id;

    -- Also log to payments table (if not already there)
    INSERT INTO public.payments (
      user_id,
      subscription_id,
      amount,
      payment_gateway,
      transaction_id,
      payment_status,
      created_at
    ) 
    SELECT 
      NEW.user_id,
      NEW.id,
      NEW.payment_amount,
      NEW.payment_gateway,
      NEW.transaction_id,
      'paid',
      now()
    WHERE NOT EXISTS (
      SELECT 1 FROM public.payments WHERE transaction_id = NEW.transaction_id
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to handle activation
DROP TRIGGER IF EXISTS tr_subscription_activation ON public.subscriptions;
CREATE TRIGGER tr_subscription_activation
AFTER INSERT OR UPDATE OF payment_status ON public.subscriptions
FOR EACH ROW
WHEN (NEW.payment_status = 'paid' AND NEW.subscription_status = 'active')
EXECUTE FUNCTION public.handle_subscription_activation();

-- Status retrieval function for unified access
CREATE OR REPLACE FUNCTION public.get_subscription_status(user_id_uuid UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'status', s.subscription_status,
    'end_date', s.end_date,
    'days_remaining', (s.end_date - CURRENT_DATE),
    'plan', s.plan_name
  ) INTO result
  FROM public.subscriptions s
  WHERE s.user_id = user_id_uuid
  ORDER BY s.end_date DESC
  LIMIT 1;
  
  RETURN COALESCE(result, json_build_object('status', 'none', 'days_remaining', 0));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
