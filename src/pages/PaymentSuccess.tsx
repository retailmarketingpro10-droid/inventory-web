import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, ArrowRight, Receipt, Calendar, IndianRupee, PartyPopper } from 'lucide-react';
import { formatIndianCurrency } from '@/utils/indianBusiness';

export default function PaymentSuccess() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [countdown, setCountdown] = useState(10);

  const txnid = searchParams.get('txnid');
  const amount = searchParams.get('amount');

  // Auto-redirect countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate('/dashboard?tab=subscription');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [navigate]);

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
            Your subscription has been activated
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Transaction Details */}
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 space-y-3">
            {txnid && (
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Receipt className="h-4 w-4" />
                  Transaction ID
                </span>
                <span className="font-mono text-xs">{txnid}</span>
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
              <span className="font-medium">1 Year</span>
            </div>
          </div>

          {/* Success Message */}
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              Thank you for your payment! Your subscription is now active for the next 12 months.
            </p>
            <p className="text-xs text-muted-foreground">
              A confirmation email will be sent to your registered email address.
            </p>
          </div>

          {/* Auto-redirect Notice */}
          <div className="text-center text-xs text-muted-foreground">
            Redirecting to dashboard in <span className="font-bold text-primary">{countdown}</span> seconds...
          </div>

          {/* Action Button */}
          <Button
            onClick={() => navigate('/dashboard?tab=subscription')}
            className="w-full bg-green-600 hover:bg-green-700"
          >
            Go to Dashboard
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>

          {/* Support Link */}
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
