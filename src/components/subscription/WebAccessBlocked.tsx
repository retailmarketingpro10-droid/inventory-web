import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Smartphone, Monitor, Lock, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SUBSCRIPTION_PLANS } from '@/config/subscriptionPlans';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

export const WebAccessBlocked = () => {
  const navigate = useNavigate();
  const monthly = SUBSCRIPTION_PLANS.monthly;
  const yearly = SUBSCRIPTION_PLANS.yearly;

  const handleSignOut = async () => {
    try {
      const keys = Object.keys(localStorage);
      keys.forEach((key) => {
        if (key.startsWith('sb-') || key.includes('supabase') || key.includes('auth')) {
          localStorage.removeItem(key);
        }
      });
    } catch (error) {
      logger.warn('Failed to clear storage:', error);
    }

    Promise.race([
      supabase.auth.signOut({ scope: 'local' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000)),
    ]).catch(() => undefined);

    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-2xl w-full border-primary/30">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Web access requires a paid plan</CardTitle>
          <CardDescription className="text-base">
            Your account is on the free mobile plan. Subscribe in the Android or iOS app to
            unlock the web dashboard with the same login.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center gap-2 font-semibold">
                <Smartphone className="h-4 w-4 text-primary" />
                Free Mobile
              </div>
              <p className="text-sm text-muted-foreground">
                Mobile app with ads. Web is not included on this plan.
              </p>
            </div>
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-2">
              <div className="flex items-center gap-2 font-semibold">
                <Monitor className="h-4 w-4 text-primary" />
                Paid plans
              </div>
              <p className="text-sm text-muted-foreground">
                Monthly ₹{monthly.priceInr} or Yearly ₹{yearly.priceInr} — mobile + web, no ads.
              </p>
            </div>
          </div>

          <div className="bg-muted rounded-lg p-4 text-sm text-muted-foreground space-y-2">
            <p className="font-medium text-foreground">How to upgrade</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Open the Inventory Migrator app on Android or iOS</li>
              <li>Go to Subscription and choose Monthly or Yearly</li>
              <li>Complete in-app purchase, then sign in here again</li>
            </ol>
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
              View plans
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
