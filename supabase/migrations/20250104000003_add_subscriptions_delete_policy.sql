-- Add DELETE policy for subscriptions table
-- Users can only delete their own pending subscriptions

DROP POLICY IF EXISTS "Users can delete their own subscriptions" ON public.subscriptions;

CREATE POLICY "Users can delete their own subscriptions"
ON public.subscriptions
FOR DELETE
USING (
  auth.uid() = user_id 
  AND status = 'pending'  -- Only allow deleting pending subscriptions
);

