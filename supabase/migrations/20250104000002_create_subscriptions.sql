-- Create subscriptions table for tracking yearly renewals
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_type TEXT NOT NULL DEFAULT 'annual' CHECK (subscription_type IN ('trial', 'annual', 'monthly')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled', 'pending')),
  amount_paid DECIMAL(10,2) NOT NULL,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE NOT NULL,
  renewal_date DATE,
  payment_status TEXT DEFAULT 'paid' CHECK (payment_status IN ('paid', 'pending', 'failed', 'refunded')),
  payment_method TEXT,
  transaction_id TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add subscription_id to profiles for quick reference
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES public.subscriptions(id),
ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'trial';

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_end_date ON public.subscriptions(end_date);

-- Enable RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can create their own subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can update their own subscriptions" ON public.subscriptions;

-- RLS Policies for subscriptions
CREATE POLICY "Users can view their own subscriptions"
ON public.subscriptions
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own subscriptions"
ON public.subscriptions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own subscriptions"
ON public.subscriptions
FOR UPDATE
USING (auth.uid() = user_id);

-- Function to create subscription on user signup
CREATE OR REPLACE FUNCTION public.create_initial_subscription()
RETURNS TRIGGER AS $$
DECLARE
  new_subscription_id UUID;
  subscription_end_date DATE;
BEGIN
  -- Calculate end date (11 months free trial from signup)
  subscription_end_date := CURRENT_DATE + INTERVAL '11 months';
  
  -- Create subscription with free trial (no payment required for first 11 months)
  INSERT INTO public.subscriptions (
    user_id,
    subscription_type,
    status,
    amount_paid,
    start_date,
    end_date,
    renewal_date,
    payment_status,
    payment_method,
    notes
  ) VALUES (
    NEW.id,
    'trial',
    'active',
    0.00, -- Free trial - no initial payment
    CURRENT_DATE,
    subscription_end_date,
    subscription_end_date, -- Set renewal date same as end date (11 months from now)
    'paid', -- Mark as paid since it's free trial
    'trial',
    '11-month free trial period - No payment required'
  ) RETURNING id INTO new_subscription_id;
  
  -- Update profile with subscription info
  UPDATE public.profiles
  SET subscription_id = new_subscription_id,
      subscription_status = 'active'
  WHERE id = NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to create subscription when new user signs up
DROP TRIGGER IF EXISTS on_user_signup_create_subscription ON auth.users;
CREATE TRIGGER on_user_signup_create_subscription
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.create_initial_subscription();

-- Function to check and update expired subscriptions
CREATE OR REPLACE FUNCTION public.check_subscription_expiry()
RETURNS void AS $$
BEGIN
  UPDATE public.subscriptions
  SET status = 'expired',
      updated_at = now()
  WHERE status = 'active'
    AND end_date < CURRENT_DATE;
  
  -- Update profiles for expired subscriptions
  UPDATE public.profiles
  SET subscription_status = 'expired'
  WHERE subscription_id IN (
    SELECT id FROM public.subscriptions
    WHERE status = 'expired'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for automatic timestamp updates (drop if exists first)
DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER update_subscriptions_updated_at
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

