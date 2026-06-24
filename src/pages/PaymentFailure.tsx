import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { XCircle, ArrowRight, RefreshCw, AlertTriangle, Mail, Receipt } from 'lucide-react';
import { buildSupportMailtoUrl, SUPPORT_EMAIL } from '@/lib/supportEmail';

export default function PaymentFailure() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const error = searchParams.get('error');
  const txnid = searchParams.get('txnid');

  // Map error codes to user-friendly messages
  const getErrorMessage = (errorCode: string | null): string => {
    if (!errorCode) return 'Payment could not be processed. Please try again.';
    
    const errorMessages: Record<string, string> = {
      'hash_mismatch': 'Payment verification failed. Please try again or contact support.',
      'processing_error': 'There was an error processing your payment. Please try again.',
      'cancelled': 'Payment was cancelled by user.',
      'timeout': 'Payment session timed out. Please try again.',
      'insufficient_funds': 'Insufficient funds. Please try with a different payment method.',
      'card_declined': 'Your card was declined. Please try a different card.',
      'network_error': 'Network error occurred. Please check your connection and try again.',
    };

    return errorMessages[errorCode] || decodeURIComponent(errorCode);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-destructive/20 bg-card/95 backdrop-blur">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <XCircle className="h-10 w-10 text-destructive" />
          </div>
          <CardTitle className="text-2xl text-destructive">
            Payment Failed
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            We couldn't process your payment
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Error Details */}
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 space-y-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-destructive mb-1">Error Details</p>
                <p className="text-sm text-muted-foreground">
                  {getErrorMessage(error)}
                </p>
              </div>
            </div>
            {txnid && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t border-destructive/20">
                <Receipt className="h-3 w-3" />
                <span>Transaction Reference: {txnid}</span>
              </div>
            )}
          </div>

          {/* What to do next */}
          <div className="bg-muted/50 rounded-lg p-4">
            <p className="font-semibold mb-2 text-sm">What you can do:</p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">1.</span>
                Try the payment again with the same or different payment method
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">2.</span>
                Check if your card/bank account has sufficient balance
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">3.</span>
                Contact your bank if the issue persists
              </li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <Button
              onClick={() => navigate('/dashboard?tab=subscription')}
              className="w-full"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Try Again
            </Button>
            
            <Button
              variant="outline"
              onClick={() => navigate('/dashboard')}
              className="w-full"
            >
              Go to Dashboard
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>

          {/* Support Section */}
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Mail className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-semibold text-sm mb-1">Need Help?</p>
                <p className="text-xs text-muted-foreground mb-2">
                  If you continue to experience issues or if money was deducted, 
                  please contact our support team immediately.
                </p>
                <a
                  href={buildSupportMailtoUrl('payment', { transactionId: txnid || undefined })}
                  className="text-sm text-primary hover:underline font-medium"
                >
                  {SUPPORT_EMAIL}
                </a>
              </div>
            </div>
          </div>

          {/* Note about pending charges */}
          <p className="text-center text-xs text-muted-foreground">
            Note: If you see a pending charge, it will be automatically reversed within 5-7 business days.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
