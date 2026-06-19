import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, ArrowRight, Receipt, Calendar, IndianRupee, PartyPopper, Loader2 } from 'lucide-react';
import { formatIndianCurrency } from '@/utils/indianBusiness';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { logger } from '@/lib/logger';

export default function PaymentSuccess() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { refetch } = useSubscription();
  const [countdown, setCountdown] = useState(10);
  const [updating, setUpdating] = useState(true);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [activationComplete, setActivationComplete] = useState(false);

  const txnid = searchParams.get('txnid');
  const amount = searchParams.get('amount');
  const mihpayid = searchParams.get('mihpayid');
  const planType = searchParams.get('udf2');

  useEffect(() => {
    if (authLoading) return;

    const updateSubscription = async () => {
      if (!user?.id) {
        setUpdateError('Please sign in to activate your subscription, then open Subscription from the dashboard.');
        setUpdating(false);
        return;
      }

      setUpdating(true);

      try {
        let query = (supabase as any)
          .from('subscriptions')
          .select('*')
          .eq('user_id', user.id);

        if (txnid) {
          query = query.eq('transaction_id', txnid);
        } else {
          query = query.eq('status', 'pending').order('created_at', { ascending: false }).limit(1);
        }

        const { data: pendingSubscription, error: fetchError } = await query.maybeSingle();

        if (fetchError) {
          logger.error('Error fetching subscription:', fetchError);
          setUpdateError('Could not find your subscription. Please contact support.');
          return;
        }

        if (!pendingSubscription) {
          setUpdateError('Payment received but no matching subscription was found. Contact support with your transaction ID.');
          return;
        }

        const subType =
          (pendingSubscription as { subscription_type?: string }).subscription_type ||
          planType ||
          'yearly';
        const startDate = new Date();
        const endDate = new Date();

        if (subType === 'monthly') {
          endDate.setMonth(endDate.getMonth() + 1);
        } else {
          endDate.setFullYear(endDate.getFullYear() + 1);
        }

        const { error: updateError } = await (supabase as any)
          .from('subscriptions')
          .update({
            status: 'active',
            payment_status: 'paid',
            subscription_type: subType === 'annual' ? 'yearly' : subType,
            transaction_id:
              mihpayid || txnid || (pendingSubscription as { transaction_id?: string }).transaction_id,
            start_date: startDate.toISOString().split('T')[0],
            end_date: endDate.toISOString().split('T')[0],
            renewal_date: endDate.toISOString().split('T')[0],
            notes: `PayU payment successful. Transaction ID: ${mihpayid || txnid || 'N/A'}`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', pendingSubscription.id);

        if (updateError) {
          logger.error('Error updating subscription:', updateError);
          setUpdateError('Payment received but could not update subscription. Please contact support.');
          return;
        }

        await supabase
          .from('profiles')
          .update({ subscription_plan: 'paid', subscription_status: 'active' })
          .eq('id', user.id);

        await refetch();
        setActivationComplete(true);
      } catch (error) {
        logger.error('Error processing payment success:', error);
        setUpdateError(
          'An error occurred. Your payment was received — please contact support if your subscription is not active.'
        );
      } finally {
        setUpdating(false);
      }
    };

    updateSubscription();
  }, [user?.id, authLoading, txnid, mihpayid, planType, refetch]);

  useEffect(() => {
    if (updating || !activationComplete) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate('/dashboard?tab=products');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [navigate, updating, activationComplete]);

  const periodLabel =
    planType === 'monthly' || searchParams.get('udf2') === 'monthly'
      ? '1 Month'
      : '1 Year';

  if (authLoading || updating) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-primary/20 bg-card/95 backdrop-blur">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
            <p className="text-lg font-medium">Processing your payment...</p>
            <p className="text-sm text-muted-foreground">Please wait while we activate your subscription.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-green-500/20 bg-card/95 backdrop-blur">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
            <CheckCircle className="h-10 w-10 text-green-500" />
          </div>
          <CardTitle className="flex items-center justify-center gap-2 text-2xl text-green-500">
            <PartyPopper className="h-6 w-6" />
            Payment Successful!
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {activationComplete
              ? 'Your subscription has been activated'
              : 'We received your payment'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {updateError && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 text-sm text-yellow-500">
              {updateError}
            </div>
          )}

          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 space-y-3">
            {(txnid || mihpayid) && (
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Receipt className="h-4 w-4" />
                  Transaction ID
                </span>
                <span className="font-mono text-xs">{mihpayid || txnid}</span>
              </div>
            )}
            {amount && (
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <IndianRupee className="h-4 w-4" />
                  Amount Paid
                </span>
                <span className="font-bold text-green-500">
                  {formatIndianCurrency(parseFloat(amount))}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-4 w-4" />
                Subscription Period
              </span>
              <span className="font-medium">{periodLabel}</span>
            </div>
          </div>

          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              {activationComplete
                ? `Thank you for your payment! Your subscription is now active for the next ${periodLabel.toLowerCase()}.`
                : 'If features are still locked, open Subscription and click Refresh, or contact support.'}
            </p>
          </div>

          {activationComplete && (
            <div className="text-center text-xs text-muted-foreground">
              Redirecting to products in{' '}
              <span className="font-bold text-primary">{countdown}</span> seconds...
            </div>
          )}

          <Button
            onClick={() => navigate('/dashboard?tab=products')}
            className="w-full bg-green-600 hover:bg-green-700"
          >
            Go to Dashboard
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Need help? Contact us at{' '}
            <a
              href="mailto:retailmarketingpro1.0@gmail.com"
              className="text-primary hover:underline"
            >
              retailmarketingpro1.0@gmail.com
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
