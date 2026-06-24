-- Track subscription cancellation requests from web/mobile (support workflow)
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS cancellation_requested_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_subscriptions_cancellation_requested
  ON public.subscriptions(cancellation_requested_at)
  WHERE cancellation_requested_at IS NOT NULL;
