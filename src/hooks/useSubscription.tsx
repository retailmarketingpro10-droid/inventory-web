import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { logger } from '@/lib/logger';

export interface SubscriptionStatus {
  isActive: boolean;
  isExpired: boolean;
  isTrial: boolean;
  isReadOnly: boolean; // TRUE if expired or payment pending
  daysRemaining: number;
  subscription: {
    id: string;
    subscription_type: string;
    subscription_status: string; // Renamed status
    start_date: string;
    end_date: string;
    payment_amount: number;
    payment_status: string;
    plan_name: string;
  } | null;
  loading: boolean;
}

export const useSubscription = () => {
  const { user } = useAuth();
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>({
    isActive: false,
    isExpired: false,
    isTrial: false,
    isReadOnly: false,
    daysRemaining: 0,
    subscription: null,
    loading: true
  });

  useEffect(() => {
    if (user) {
      checkSubscription();
    } else {
      setSubscriptionStatus(prev => ({ ...prev, loading: false, isActive: false }));
    }
  }, [user]);

  const checkSubscription = async () => {
    if (!user?.id) {
      setSubscriptionStatus(prev => ({ ...prev, loading: false, isActive: false }));
      return;
    }

    try {
      // First, run the expiry check function to update expired subscriptions
      await (supabase as any).rpc('check_subscription_expiry');

      // Get user's active subscription (must be active AND paid)
      // Call the new RPC for unified status
      const { data: statusJson, error: statusError } = await (supabase as any)
        .rpc('get_subscription_status', { user_id_uuid: user.id });

      // Also get full details for the UI
      const { data: subscriptions, error } = await (supabase as any)
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .order('end_date', { ascending: false })
        .limit(1);
      
      const subscription = subscriptions && subscriptions.length > 0 ? subscriptions[0] : null;

      if (error) {
        logger.error('Error fetching subscription:', error);
        setSubscriptionStatus({
          isActive: false,
          isExpired: true,
          isTrial: false,
          isReadOnly: true,
          daysRemaining: 0,
          subscription: null,
          loading: false
        });
        return;
      }

      if (!subscription) {
        // No subscription record found - block access
        setSubscriptionStatus({
          isActive: false,
          isExpired: false,
          isTrial: false,
          isReadOnly: true,
          daysRemaining: 0,
          subscription: null,
          loading: false
        });
        return;
      }

      // Check if subscription is expired
      const endDateStr = (subscription as any).end_date.split('T')[0];
      const endDate = new Date(endDateStr + 'T23:59:59');
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const isExpired = endDate < today;
      const daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
      const isTrial = (subscription as any).subscription_type === 'trial';
      
      // Active if it's paid AND not expired
      const isActive = !isExpired && (subscription as any).payment_status === 'paid';
      
      // READ-ONLY if expired OR pay status is not 'paid'
      const isReadOnly = isExpired || (subscription as any).payment_status !== 'paid';

      setSubscriptionStatus({
        isActive,
        isExpired,
        isTrial,
        isReadOnly,
        daysRemaining,
        subscription: {
          id: (subscription as any).id,
          subscription_type: (subscription as any).subscription_type,
          subscription_status: (subscription as any).subscription_status,
          start_date: (subscription as any).start_date,
          end_date: (subscription as any).end_date,
          payment_amount: (subscription as any).payment_amount,
          payment_status: (subscription as any).payment_status,
          plan_name: (subscription as any).plan_name || 'Annual'
        },
        loading: false
      });
    } catch (error) {
      logger.error('Error checking subscription:', error);
      setSubscriptionStatus({
        isActive: false,
        isExpired: true,
        isTrial: false,
        isReadOnly: true,
        daysRemaining: 0,
        subscription: null,
        loading: false
      });
    }
  };

  return {
    ...subscriptionStatus,
    refetch: checkSubscription
  };
};

