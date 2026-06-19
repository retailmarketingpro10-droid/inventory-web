import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, Lock, CreditCard, RefreshCw, LogOut, Smartphone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatIndianCurrency } from '@/utils/indianBusiness';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { SUBSCRIPTION_PLANS, type SubscriptionPlanId } from '@/config/subscriptionPlans';

interface PaymentRequiredProps {
  daysRemaining?: number;
  planId?: SubscriptionPlanId;
}

export const PaymentRequired = ({ daysRemaining, planId = 'yearly' }: PaymentRequiredProps) => {
  const navigate = useNavigate();
  const plan = SUBSCRIPTION_PLANS[planId === 'monthly' ? 'monthly' : 'yearly'];

  const handleSignOut = async () => {
    try {
      const keys = Object.keys(localStorage);
      keys.forEach((key) => {
        if (key.startsWith('sb-') || key.includes('supabase') || key.includes('auth')) {
          localStorage.removeItem(key);
        }
      });
    } catch (storageError) {
      logger.warn('Failed to clear storage:', storageError);
    }

    Promise.race([
      supabase.auth.signOut({ scope: 'local' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000)),
    ]).catch((error) => {
      logger.warn('SignOut API call failed (non-blocking):', error);
    });

    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-2xl w-full border-destructive">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <Lock className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle className="text-2xl">Subscription expired</CardTitle>
          <CardDescription className="text-base">
            Renew your {plan.name.toLowerCase()} plan in the mobile app to restore web access.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-muted rounded-lg p-6 space-y-4">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <p className="font-semibold">Web access paused</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Paid subscribers use the same account on Android, iOS, and web. Renew through
              in-app purchase on your phone, then refresh this page.
            </p>
            {daysRemaining !== undefined && daysRemaining < 0 && (
              <p className="text-sm text-destructive font-medium">
                Your subscription expired {Math.abs(daysRemaining)} day
                {Math.abs(daysRemaining) !== 1 ? 's' : ''} ago.
              </p>
            )}
          </div>

          <div className="border rounded-lg p-4 space-y-3">
            <h3 className="font-semibold flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Available plans (in-app purchase)
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Monthly:</span>
                <span className="font-semibold">
                  {formatIndianCurrency(SUBSCRIPTION_PLANS.monthly.priceInr)}/month
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Yearly:</span>
                <span className="font-semibold">
                  {formatIndianCurrency(SUBSCRIPTION_PLANS.yearly.priceInr)}/year
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Your last plan:</span>
                <span>{plan.name}</span>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg border p-4 text-sm text-muted-foreground">
            <Smartphone className="h-5 w-5 shrink-0 text-primary mt-0.5" />
            <p>
              Open the Inventory Migrator app → Subscription → renew Monthly or Yearly. Web
              access syncs automatically after payment.
            </p>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={handleSignOut}>
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
            <Button
              className="flex-1"
              onClick={() => navigate('/dashboard?tab=subscription', { replace: true })}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              View subscription
            </Button>
          </div>

          <p className="text-xs text-center text-muted-foreground">
            Billing help: retailmarketingpro1.0@gmail.com
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
