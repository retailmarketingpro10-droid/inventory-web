import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { logger } from '@/lib/logger';

export interface SubscriptionStatus {
  isActive: boolean;
  isExpired: boolean;
  isTrial: boolean;
  daysRemaining: number;
  subscription: {
    id: string;
    subscription_type: string;
    status: string;
    start_date: string;
    end_date: string;
    amount_paid: number;
    payment_status: string;
  } | null;
  loading: boolean;
}

export const useSubscription = () => {
  const { user } = useAuth();
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>({
    isActive: false,
    isExpired: false,
    isTrial: false,
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
      await supabase.rpc('check_subscription_expiry');

      // Get user's active subscription (must be active AND paid)
      // Pending subscriptions should NOT grant access
      const { data: subscriptions, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .eq('payment_status', 'paid')  // Only show paid subscriptions as active
        .order('end_date', { ascending: false })
        .limit(1);
      
      const subscription = subscriptions && subscriptions.length > 0 ? subscriptions[0] : null;

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        logger.error('Error fetching subscription:', error);
        setSubscriptionStatus({
          isActive: false,
          isExpired: true,
          isTrial: false,
          daysRemaining: 0,
          subscription: null,
          loading: false
        });
        return;
      }

      if (!subscription) {
        // No active subscription found - check if user is still in 11-month trial period
        // Get user creation date from profiles or auth
        const { data: profile } = await supabase
          .from('profiles')
          .select('created_at')
          .eq('id', user.id)
          .single();
        
        const userCreatedAt = profile?.created_at || user.created_at;
        
        if (userCreatedAt) {
          // Calculate trial end date (11 months from account creation)
          const accountCreatedDate = new Date(userCreatedAt);
          const trialEndDate = new Date(accountCreatedDate);
          trialEndDate.setMonth(trialEndDate.getMonth() + 11);
          
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          trialEndDate.setHours(0, 0, 0, 0);
          
          const isTrialExpired = trialEndDate < today;
          const daysRemaining = Math.ceil((trialEndDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          
          setSubscriptionStatus({
            isActive: !isTrialExpired, // Active if trial hasn't expired
            isExpired: isTrialExpired,
            isTrial: true,
            daysRemaining: isTrialExpired ? 0 : daysRemaining,
            subscription: null,
            loading: false
          });
        } else {
          // No account creation date found - treat as expired
          setSubscriptionStatus({
            isActive: false,
            isExpired: true,
            isTrial: false,
            daysRemaining: 0,
            subscription: null,
            loading: false
          });
        }
        return;
      }

      // Check if subscription is expired
      // Parse end_date as a date string (YYYY-MM-DD) and create date at start of day
      const endDateStr = subscription.end_date.split('T')[0]; // Get just the date part
      const endDate = new Date(endDateStr + 'T23:59:59'); // Set to end of the end date
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Subscription expires if end date has passed (end date is before today)
      // If end date is today, it's still valid
      const isExpired = endDate < today;
      const daysRemaining = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const isTrial = subscription.subscription_type === 'trial';
      // For trial subscriptions, allow access even if payment_status is not 'paid' since it's free
      const isActive = !isExpired && subscription.status === 'active' && 
        (subscription.payment_status === 'paid' || subscription.subscription_type === 'trial');
      
      console.log('Subscription check:', {
        end_date: subscription.end_date,
        endDateStr,
        endDate: endDate.toISOString(),
        today: today.toISOString(),
        isExpired,
        daysRemaining,
        isActive
      });

      setSubscriptionStatus({
        isActive,
        isExpired,
        isTrial,
        daysRemaining: isExpired ? 0 : daysRemaining,
        subscription: {
          id: subscription.id,
          subscription_type: subscription.subscription_type,
          status: subscription.status,
          start_date: subscription.start_date,
          end_date: subscription.end_date,
          amount_paid: subscription.amount_paid,
          payment_status: subscription.payment_status
        },
        loading: false
      });
    } catch (error) {
      logger.error('Error checking subscription:', error);
      setSubscriptionStatus({
        isActive: false,
        isExpired: true,
        isTrial: false,
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

