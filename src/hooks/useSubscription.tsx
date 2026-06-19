import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { logger } from '@/lib/logger';
import {
  evaluateWebSubscriptionAccess,
  pickActiveSubscription,
  type SubscriptionRecord,
  type WebSubscriptionAccess,
} from '@/lib/subscriptionAccess';
import type { SubscriptionPlanId } from '@/config/subscriptionPlans';

export interface SubscriptionStatus extends WebSubscriptionAccess {
  subscription: {
    id: string;
    subscription_type: string;
    subscription_status: string;
    start_date: string;
    end_date: string;
    payment_amount: number;
    payment_status: string;
    plan_name: string;
  } | null;
  loading: boolean;
  /** @deprecated Use isFreeMobile */
  isTrial: boolean;
}

const defaultStatus: SubscriptionStatus = {
  planId: 'free_mobile',
  planName: 'Free Mobile',
  hasWebAccess: false,
  isActive: false,
  isExpired: true,
  isFreeMobile: true,
  isPaidPlan: false,
  isReadOnly: true,
  isTrial: true,
  daysRemaining: 0,
  paymentStatus: null,
  subscription: null,
  loading: true,
};

interface SubscriptionContextValue extends SubscriptionStatus {
  refetch: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

export const SubscriptionProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [subscriptionStatus, setSubscriptionStatus] =
    useState<SubscriptionStatus>(defaultStatus);

  const checkSubscription = useCallback(async () => {
    if (!user?.id) {
      setSubscriptionStatus({ ...defaultStatus, loading: false });
      return;
    }

    try {
      try {
        await (supabase as any).rpc('check_subscription_expiry');
      } catch {
        // RPC may not exist on older databases
      }

      const { data: subscriptions, error } = await (supabase as any)
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('Error fetching subscription:', error);
        setSubscriptionStatus({ ...defaultStatus, loading: false });
        return;
      }

      const subscription = pickActiveSubscription(
        (subscriptions as SubscriptionRecord[]) || []
      );

      const access = evaluateWebSubscriptionAccess(subscription);

      setSubscriptionStatus({
        ...access,
        isTrial: access.isFreeMobile,
        subscription: subscription
          ? {
              id: subscription.id!,
              subscription_type: subscription.subscription_type || 'free_mobile',
              subscription_status:
                subscription.subscription_status || subscription.status || 'inactive',
              start_date: subscription.start_date || '',
              end_date: subscription.end_date || '',
              payment_amount:
                subscription.payment_amount ?? subscription.amount_paid ?? 0,
              payment_status: subscription.payment_status || 'pending',
              plan_name: subscription.plan_name || access.planName,
            }
          : null,
        loading: false,
      });
    } catch (error) {
      logger.error('Error checking subscription:', error);
      setSubscriptionStatus({ ...defaultStatus, loading: false });
    }
  }, [user?.id]);

  useEffect(() => {
    if (user) {
      checkSubscription();
    } else {
      setSubscriptionStatus({ ...defaultStatus, loading: false });
    }
  }, [user, checkSubscription]);

  const value = useMemo(
    () => ({
      ...subscriptionStatus,
      refetch: checkSubscription,
    }),
    [subscriptionStatus, checkSubscription]
  );

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within SubscriptionProvider');
  }
  return context;
};

export type { SubscriptionPlanId };
