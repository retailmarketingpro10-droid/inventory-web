import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { useToast } from '@/hooks/use-toast';
import {
  Calendar,
  CheckCircle,
  AlertCircle,
  Smartphone,
  Monitor,
  Shield,
  CreditCard,
  RefreshCw,
  XCircle,
  LifeBuoy,
} from 'lucide-react';
import { formatIndianCurrency } from '@/utils/indianBusiness';
import { SUBSCRIPTION_PLANS } from '@/config/subscriptionPlans';
import { PayUCheckout, SecurePaymentBadge } from '@/components/subscription/PayUCheckout';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { openSupportEmail, SUPPORT_EMAIL } from '@/lib/supportEmail';
import { requestSubscriptionCancellation } from '@/services/subscriptionCancellationService';
import { ContactSupportPanel } from '@/components/support/ContactSupportPanel';
import { logger } from '@/lib/logger';

type SelectablePlanId = 'monthly' | 'yearly';

export const SubscriptionManager = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const {
    planId,
    planName,
    hasWebAccess,
    isExpired,
    daysRemaining,
    subscription,
    refetch,
  } = useSubscription();
  const [userCreatedAt, setUserCreatedAt] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<SelectablePlanId>('yearly');
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [cancellationRequestedAt, setCancellationRequestedAt] = useState<string | null>(null);

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

  useEffect(() => {
    if (!subscription?.id || !user?.id) {
      setCancellationRequestedAt(null);
      return;
    }
    (supabase as any)
      .from('subscriptions')
      .select('cancellation_requested_at')
      .eq('id', subscription.id)
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }: { data: { cancellation_requested_at?: string } | null }) => {
        setCancellationRequestedAt(data?.cancellation_requested_at || null);
      })
      .catch(() => setCancellationRequestedAt(null));
  }, [subscription?.id, user?.id]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleCancelRequest = async () => {
    if (!user?.id || !subscription?.id) {
      openSupportEmail('cancellation', {
        userId: user?.id,
        userEmail: user?.email,
      });
      setShowCancelDialog(false);
      return;
    }

    setCancelling(true);
    try {
      await requestSubscriptionCancellation({
        subscriptionId: subscription.id,
        userId: user.id,
        userEmail: user.email,
        reason: cancelReason.trim() || undefined,
      });
      setCancellationRequestedAt(new Date().toISOString());
      setShowCancelDialog(false);
      setCancelReason('');
      toast({
        title: 'Cancellation request sent',
        description: `Your email app should open to ${SUPPORT_EMAIL}. We will process your request shortly.`,
      });
    } catch (error) {
      logger.error('Cancellation request failed:', error);
      toast({
        title: 'Could not save request',
        description: 'Opening email to contact support instead.',
        variant: 'destructive',
      });
      openSupportEmail('cancellation', {
        userId: user.id,
        userEmail: user.email,
      });
      setShowCancelDialog(false);
    } finally {
      setCancelling(false);
    }
  };

  const statusLabel = !subscription
    ? 'No paid plan'
    : cancellationRequestedAt
      ? 'Cancellation pending'
      : hasWebAccess
        ? 'Active'
        : isExpired
          ? 'Expired'
          : 'Mobile only';

  const statusColor = cancellationRequestedAt
    ? 'text-orange-600 bg-orange-500/10 border-orange-500/20'
    : hasWebAccess
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
          Manage, renew, or cancel your plan. For help, contact support by email.
        </p>
      </div>

      {/* Current plan — manage */}
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

          {cancellationRequestedAt && (
            <div className="flex gap-3 rounded-lg border border-orange-500/30 bg-orange-500/5 p-4 text-sm">
              <AlertCircle className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-orange-800 dark:text-orange-200">
                  Cancellation requested
                </p>
                <p className="text-muted-foreground mt-1">
                  Submitted on{' '}
                  {new Date(cancellationRequestedAt).toLocaleString('en-IN')}. Our team will
                  confirm by email. Access continues until your billing period ends unless we
                  notify you otherwise.
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Checking…' : 'Refresh status'}
            </Button>
            {hasWebAccess && !isExpired && !cancellationRequestedAt && subscription && (
              <Button
                variant="outline"
                className="text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={() => setShowCancelDialog(true)}
              >
                <XCircle className="h-4 w-4 mr-2" />
                Request cancellation
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Renew / subscribe */}
      <div>
        <h3 className="text-lg font-bold mb-1">
          {showCheckout ? 'Subscribe or renew' : 'Renew or change plan'}
        </h3>
        <p className="text-sm text-muted-foreground mb-3">
          {showCheckout
            ? 'Select a plan and pay securely to unlock web access.'
            : 'Pay before your end date to extend access, or switch plans at renewal.'}
        </p>
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

      {(showCheckout || hasWebAccess) && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              {showCheckout ? 'Subscribe' : 'Renew'} — {selectedPlan.name}
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
              </>
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground space-y-2">
                <p className="font-medium text-foreground">Web payment not configured</p>
                <p>
                  Contact support for manual activation or billing help.
                </p>
                <Button
                  variant="outline"
                  onClick={() =>
                    openSupportEmail('billing', { userId: user?.id, userEmail: user?.email })
                  }
                >
                  Contact billing support
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {hasWebAccess && !isExpired && !cancellationRequestedAt && (
        <Card className="bg-green-500/5 border-green-500/20">
          <CardContent className="p-6 flex gap-4 items-center">
            <CheckCircle className="h-6 w-6 text-green-600 shrink-0" />
            <p className="text-sm">
              Your <strong>{planName}</strong> plan is active. Web and mobile access are enabled.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Contact support */}
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <LifeBuoy className="h-5 w-5" />
            Help & support
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ContactSupportPanel
            userId={user?.id}
            userEmail={user?.email}
            description={`Opens your default email app with user ID and app version pre-filled. Billing: ${SUPPORT_EMAIL}`}
          />
          <Button
            variant="outline"
            className="w-full mt-3"
            onClick={() => openSupportEmail('billing', { userId: user?.id, userEmail: user?.email })}
          >
            Billing & payments only
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Request subscription cancellation?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-left">
              <span className="block">
                This records your cancellation request and opens your email app so our team can
                confirm. You typically keep access until the end of your current billing period.
              </span>
              <span className="block text-xs text-muted-foreground">
                Refund policy: see Refund Policy on our website. For urgent help, use Contact
                support after submitting.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label htmlFor="cancel-reason">Reason (optional)</Label>
            <Textarea
              id="cancel-reason"
              className="mt-2"
              placeholder="Why are you cancelling?"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Keep subscription</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleCancelRequest();
              }}
              disabled={cancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelling ? 'Submitting…' : 'Submit & open email'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SubscriptionManager;
