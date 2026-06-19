import {
  SUBSCRIPTION_PLANS,
  normalizePlanId,
  type SubscriptionPlanId,
} from '@/config/subscriptionPlans';

export interface SubscriptionRecord {
  subscription_type?: string | null;
  status?: string | null;
  subscription_status?: string | null;
  payment_status?: string | null;
  end_date?: string | null;
  plan_name?: string | null;
  payment_amount?: number | null;
  amount_paid?: number | null;
  start_date?: string | null;
  web_access?: boolean | null;
  id?: string;
  created_at?: string | null;
}

export interface WebSubscriptionAccess {
  planId: SubscriptionPlanId;
  planName: string;
  hasWebAccess: boolean;
  isActive: boolean;
  isExpired: boolean;
  isFreeMobile: boolean;
  isPaidPlan: boolean;
  isReadOnly: boolean;
  daysRemaining: number;
  paymentStatus: string | null;
}

function getSubscriptionStatus(sub: SubscriptionRecord): string {
  return (sub.subscription_status || sub.status || '').toLowerCase();
}

function getEndDate(sub: SubscriptionRecord): Date | null {
  if (!sub.end_date) return null;
  const endDateStr = sub.end_date.split('T')[0];
  return new Date(`${endDateStr}T23:59:59`);
}

function isNotExpired(sub: SubscriptionRecord): boolean {
  const endDate = getEndDate(sub);
  if (!endDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return endDate >= today;
}

/** Prefer paid monthly/yearly over legacy trial rows that share a later end_date */
export function pickActiveSubscription(
  subscriptions: SubscriptionRecord[]
): SubscriptionRecord | null {
  if (!subscriptions.length) return null;

  const ranked = subscriptions.map((sub) => {
    const planId = normalizePlanId(sub.subscription_type, sub.plan_name);
    const isPaidPlan = planId === 'monthly' || planId === 'yearly';
    const paymentStatus = (sub.payment_status || '').toLowerCase();
    const subStatus = getSubscriptionStatus(sub);
    const notExpired = isNotExpired(sub);

    let score = 0;
    if (isPaidPlan && paymentStatus === 'paid' && notExpired) score += 100;
    if (paymentStatus === 'paid' && notExpired) score += 40;
    if (subStatus === 'active' && notExpired) score += 30;
    if (subStatus === 'pending' && paymentStatus === 'paid') score += 25;
    if (isPaidPlan) score += 20;
    if (notExpired) score += 10;

    return {
      sub,
      score,
      endMs: getEndDate(sub)?.getTime() ?? 0,
      createdMs: sub.created_at ? new Date(sub.created_at).getTime() : 0,
    };
  });

  ranked.sort(
    (a, b) =>
      b.score - a.score ||
      b.endMs - a.endMs ||
      b.createdMs - a.createdMs
  );

  return ranked[0]?.sub ?? null;
}

export function evaluateWebSubscriptionAccess(
  subscription: SubscriptionRecord | null
): WebSubscriptionAccess {
  const planId: SubscriptionPlanId = subscription
    ? normalizePlanId(subscription.subscription_type, subscription.plan_name)
    : 'free_mobile';

  const plan = SUBSCRIPTION_PLANS[planId];
  const paymentStatus = (subscription?.payment_status || '').toLowerCase() || null;
  const subStatus = subscription ? getSubscriptionStatus(subscription) : 'none';

  const endDate = subscription ? getEndDate(subscription) : null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const daysRemaining =
    endDate && endDate >= today
      ? Math.max(0, Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)))
      : 0;

  const isExpired =
    !subscription ||
    subStatus === 'expired' ||
    subStatus === 'cancelled' ||
    (endDate ? endDate < today : true);

  const isPaid = paymentStatus === 'paid';
  const isPaidPlan = planId === 'monthly' || planId === 'yearly';
  const isFreeMobile = planId === 'free_mobile';

  const explicitWebAccess = subscription?.web_access === true;
  const hasWebAccess =
    isPaid &&
    !isExpired &&
    (explicitWebAccess || (isPaidPlan && plan.webAccess));
  const isActive = hasWebAccess;
  const isReadOnly = !hasWebAccess;

  return {
    planId,
    planName: plan.name,
    hasWebAccess,
    isActive,
    isExpired,
    isFreeMobile,
    isPaidPlan,
    isReadOnly,
    daysRemaining,
    paymentStatus,
  };
}
