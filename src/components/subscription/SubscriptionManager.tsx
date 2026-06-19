import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  CheckCircle,
  AlertCircle,
  Mail,
  Smartphone,
  Monitor,
  Shield,
  CreditCard,
} from 'lucide-react';
import { formatIndianCurrency } from '@/utils/indianBusiness';
import { SUBSCRIPTION_PLANS } from '@/config/subscriptionPlans';
import { PayUCheckout, SecurePaymentBadge } from '@/components/subscription/PayUCheckout';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

type SelectablePlanId = 'monthly' | 'yearly';

export const SubscriptionManager = () => {
  const { user } = useAuth();
  const {
    planId,
    planName,
    hasWebAccess,
    isExpired,
    daysRemaining,
    subscription,
    refetch,
  } = useSubscription();
  const navigate = useNavigate();
  const [userCreatedAt, setUserCreatedAt] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<SelectablePlanId>('yearly');

  const payuConfigured =
    Boolean(import.meta.env.VITE_PAYU_MERCHANT_KEY) &&
    Boolean(import.meta.env.VITE_PAYU_MERCHANT_SALT);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('profiles')
      .select('created_at')
      .eq('id', user.id)
      .single()
      .then(({ data }) => setUserCreatedAt(data?.created_at || user.created_at || null))
      .catch(() => setUserCreatedAt(user.created_at || null));
  }, [user]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const statusLabel = !subscription
    ? 'No paid plan'
    : hasWebAccess
      ? 'Active'
      : isExpired
        ? 'Expired'
        : 'Mobile only';

  const statusColor = hasWebAccess
    ? 'text-green-600 bg-green-500/10 border-green-500/20'
    : isExpired
      ? 'text-red-600 bg-red-500/10 border-red-500/20'
      : 'text-yellow-600 bg-yellow-500/10 border-yellow-500/20';

  const paidPlans: SelectablePlanId[] = ['monthly', 'yearly'];
  const selectedPlan = SUBSCRIPTION_PLANS[selectedPlanId];
  const showCheckout = !hasWebAccess || isExpired;

  return (
    <div className="max-w-3xl mx-auto space-y-8 py-4">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-black tracking-tight text-foreground">Subscription</h2>
        <p className="text-muted-foreground font-medium">
          Select a plan below to unlock web access
        </p>
      </div>

      <Card className={`overflow-hidden border-2 ${statusColor.split(' ').slice(2).join(' ')}`}>
        <CardHeader>
          <div className="flex justify-between items-start gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2 rounded-lg">
                <Calendar className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-2xl font-bold">Current plan</CardTitle>
                <CardDescription>{planName}</CardDescription>
              </div>
            </div>
            <Badge className={`${statusColor} border font-bold uppercase tracking-wider`}>
              {statusLabel}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {subscription ? (
            <div className="grid sm:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground uppercase text-xs font-bold">Start</p>
                <p className="font-semibold">
                  {new Date(subscription.start_date).toLocaleDateString('en-IN')}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground uppercase text-xs font-bold">End</p>
                <p className="font-semibold">
                  {new Date(subscription.end_date).toLocaleDateString('en-IN')}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground uppercase text-xs font-bold">Days left</p>
                <p className="font-semibold">{hasWebAccess ? daysRemaining : 0}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Member since{' '}
              {userCreatedAt
                ? new Date(userCreatedAt).toLocaleDateString('en-IN')
                : '—'}
              . Choose a paid plan to use the web dashboard.
            </p>
          )}

          <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? 'Checking…' : 'Refresh status'}
          </Button>
        </CardContent>
      </Card>

      <div>
        <h3 className="text-lg font-bold mb-3">Choose a plan</h3>
        <div className="grid md:grid-cols-3 gap-4">
          <Card className="border-dashed opacity-80">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Smartphone className="h-5 w-5" />
                {SUBSCRIPTION_PLANS.free_mobile.name}
              </CardTitle>
              <CardDescription>{SUBSCRIPTION_PLANS.free_mobile.description}</CardDescription>
            </CardHeader>
            <CardContent className="text-sm space-y-2 text-muted-foreground">
              <p>✓ Mobile app (ads)</p>
              <p className="text-destructive">✗ Web dashboard</p>
            </CardContent>
          </Card>

          {paidPlans.map((id) => {
            const plan = SUBSCRIPTION_PLANS[id];
            const isSelected = selectedPlanId === id;
            const isCurrent = planId === id && hasWebAccess;

            return (
              <Card
                key={id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedPlanId(id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedPlanId(id);
                  }
                }}
                className={cn(
                  'cursor-pointer transition-all hover:shadow-md hover:border-primary/50',
                  isSelected && 'border-primary border-2 ring-2 ring-primary/20',
                  isCurrent && 'border-green-500'
                )}
              >
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-lg">
                    <span className="flex items-center gap-2">
                      <Monitor className="h-5 w-5" />
                      {plan.name}
                    </span>
                    {isSelected && (
                      <Badge variant="default" className="text-xs">
                        Selected
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {formatIndianCurrency(plan.priceInr)}
                    /{plan.billingPeriod === 'month' ? 'month' : 'year'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  <p className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" /> Mobile + web
                  </p>
                  <p className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-green-600" /> No ads
                  </p>
                  {isCurrent && (
                    <Badge className="mt-2 bg-green-600">Your current plan</Badge>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {showCheckout && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Subscribe — {selectedPlan.name}
            </CardTitle>
            <CardDescription>
              {formatIndianCurrency(selectedPlan.priceInr)} — includes mobile and web access
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {payuConfigured ? (
              <>
                <PayUCheckout
                  amount={selectedPlan.priceInr}
                  productInfo={`Inventory Migrator ${selectedPlan.name} Plan`}
                  subscriptionType={selectedPlanId}
                  buttonText={`Pay ${formatIndianCurrency(selectedPlan.priceInr)}`}
                  className="w-full h-12 text-base font-bold"
                />
                <div className="flex justify-center">
                  <SecurePaymentBadge />
                </div>
                <p className="text-xs text-center text-muted-foreground">
                  You can also subscribe via the Android / iOS app (in-app purchase).
                </p>
              </>
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground space-y-2">
                <p className="font-medium text-foreground">Web payment not configured</p>
                <p>
                  Add <code className="text-xs">VITE_PAYU_MERCHANT_KEY</code> and{' '}
                  <code className="text-xs">VITE_PAYU_MERCHANT_SALT</code> to your{' '}
                  <code className="text-xs">.env</code> file, or contact support for manual
                  activation.
                </p>
                <Button variant="outline" onClick={() => navigate('/auth?view=support')}>
                  Contact billing support
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {hasWebAccess && !isExpired && (
        <Card className="bg-green-500/5 border-green-500/20">
          <CardContent className="p-6 flex gap-4 items-center">
            <CheckCircle className="h-6 w-6 text-green-600 shrink-0" />
            <p className="text-sm">
              Your <strong>{planName}</strong> plan is active. Web and mobile access are enabled.
            </p>
          </CardContent>
        </Card>
      )}

      <Card
        className="border-dashed cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => navigate('/auth?view=support')}
      >
        <CardContent className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Mail className="h-8 w-8 text-primary" />
            <div>
              <p className="font-bold">Billing support</p>
              <p className="text-sm text-muted-foreground">
                Payment not syncing? Contact us for manual activation.
              </p>
            </div>
          </div>
          <Button variant="outline">Contact</Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default SubscriptionManager;
