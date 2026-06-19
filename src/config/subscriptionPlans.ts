export type SubscriptionPlanId = 'free_mobile' | 'monthly' | 'yearly';

export interface SubscriptionPlan {
  id: SubscriptionPlanId;
  name: string;
  priceInr: number;
  billingPeriod: 'free' | 'month' | 'year';
  webAccess: boolean;
  mobileAccess: boolean;
  adsEnabled: boolean;
  purchaseChannel: 'none' | 'iap';
  description: string;
}

export const SUBSCRIPTION_PLANS: Record<SubscriptionPlanId, SubscriptionPlan> = {
  free_mobile: {
    id: 'free_mobile',
    name: 'Free Mobile',
    priceInr: 0,
    billingPeriod: 'free',
    webAccess: false,
    mobileAccess: true,
    adsEnabled: true,
    purchaseChannel: 'none',
    description: 'Mobile app with ads. Web access is not included.',
  },
  monthly: {
    id: 'monthly',
    name: 'Monthly',
    priceInr: 500,
    billingPeriod: 'month',
    webAccess: true,
    mobileAccess: true,
    adsEnabled: false,
    purchaseChannel: 'iap',
    description: 'Full access on mobile and web. Billed monthly via app store.',
  },
  yearly: {
    id: 'yearly',
    name: 'Yearly',
    priceInr: 3000,
    billingPeriod: 'year',
    webAccess: true,
    mobileAccess: true,
    adsEnabled: false,
    purchaseChannel: 'iap',
    description: 'Full access on mobile and web. Best value — billed yearly via app store.',
  },
};

/** Legacy DB values mapped to current plan ids */
export function normalizePlanId(
  subscriptionType?: string | null,
  planName?: string | null
): SubscriptionPlanId {
  const type = (subscriptionType || '').toLowerCase();
  const plan = (planName || '').toLowerCase();

  if (type === 'free_mobile' || plan.includes('free mobile')) return 'free_mobile';
  if (type === 'monthly' || plan.includes('monthly')) return 'monthly';
  if (
    type === 'yearly' ||
    type === 'annual' ||
    plan.includes('yearly') ||
    plan.includes('annual')
  ) {
    return 'yearly';
  }

  // Legacy trial / unpaid defaults to free mobile tier for web gating
  if (type === 'trial' || type === '') return 'free_mobile';

  return 'free_mobile';
}
