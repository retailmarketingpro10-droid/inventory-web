import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { openSupportEmail } from '@/lib/supportEmail';
import { Loader2, CreditCard, Shield, Lock } from 'lucide-react';

// PayU Configuration from environment
const PAYU_MERCHANT_KEY = import.meta.env.VITE_PAYU_MERCHANT_KEY || '';
const PAYU_MERCHANT_SALT = import.meta.env.VITE_PAYU_MERCHANT_SALT || '';
const PAYU_TEST_MODE = import.meta.env.VITE_PAYU_TEST_MODE === 'true';
const SITE_URL = import.meta.env.VITE_URL || window.location.origin;

// PayU URLs
const PAYU_BASE_URL = PAYU_TEST_MODE 
  ? 'https://test.payu.in/_payment' 
  : 'https://secure.payu.in/_payment';

interface PayUCheckoutProps {
  amount: number;
  productInfo: string;
  subscriptionType: 'monthly' | 'yearly' | 'annual';
  onSuccess?: () => void;
  onFailure?: (error: string) => void;
  onCancel?: () => void;
  buttonText?: string;
  className?: string;
  disabled?: boolean;
}

interface PayUFormData {
  key: string;
  txnid: string;
  amount: string;
  productinfo: string;
  firstname: string;
  email: string;
  phone: string;
  surl: string;
  furl: string;
  hash: string;
  udf1: string;
  udf2: string;
  udf3: string;
  udf4: string;
  udf5: string;
}

// Generate a unique transaction ID
const generateTxnId = (): string => {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 10);
  return `INV${timestamp}${randomStr}`.toUpperCase();
};

// Generate SHA-512 hash using Web Crypto API (client-side)
const generateSHA512Hash = async (message: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-512', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

// Generate PayU hash (client-side)
// Formula: sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||salt)
const generatePayUHash = async (
  key: string,
  txnid: string,
  amount: string,
  productinfo: string,
  firstname: string,
  email: string,
  udf1: string = '',
  udf2: string = '',
  udf3: string = '',
  udf4: string = '',
  udf5: string = '',
  salt: string
): Promise<string> => {
  const hashString = `${key}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|${udf1}|${udf2}|${udf3}|${udf4}|${udf5}||||||${salt}`;
  console.log('Hash string (for debugging):', hashString.replace(salt, '****'));
  return await generateSHA512Hash(hashString);
};

export const PayUCheckout: React.FC<PayUCheckoutProps> = ({
  amount,
  productInfo,
  subscriptionType,
  onSuccess,
  onFailure,
  onCancel,
  buttonText = 'Pay Now',
  className = '',
  disabled = false,
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [formData, setFormData] = useState<PayUFormData | null>(null);

  // Submit form when formData is ready
  useEffect(() => {
    if (formData && formRef.current) {
      formRef.current.submit();
    }
  }, [formData]);

  const initiatePayment = async () => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please login to make a payment",
        variant: "destructive"
      });
      return;
    }

    // Validate PayU credentials
    if (!PAYU_MERCHANT_KEY || !PAYU_MERCHANT_SALT) {
      toast({
        title: "Configuration Error",
        description: "Payment gateway is not configured. Use Contact support on the Subscription page.",
        variant: "destructive"
      });
      openSupportEmail('billing', { userId: user.id, userEmail: user.email });
      return;
    }

    setLoading(true);

    try {
      // Generate transaction ID
      const txnid = generateTxnId();
      
      // Get user details
      const firstname = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Customer';
      const email = user.email || '';
      const phone = user.user_metadata?.phone || user.phone || '9999999999';

      // Create a pending subscription record first
      const startDate = new Date();
      const endDate = new Date();
      
      const dbSubscriptionType =
        subscriptionType === 'monthly' ? 'monthly' : 'yearly';
      const planLabel =
        subscriptionType === 'monthly' ? 'Monthly' : 'Yearly';

      if (subscriptionType === 'monthly') {
        endDate.setMonth(endDate.getMonth() + 1);
      } else {
        endDate.setFullYear(endDate.getFullYear() + 1);
      }

      const subscriptionRow: Record<string, unknown> = {
        user_id: user.id,
        subscription_type: dbSubscriptionType,
        status: 'pending',
        amount_paid: amount,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        renewal_date: endDate.toISOString().split('T')[0],
        payment_status: 'pending',
        payment_method: 'payu',
        transaction_id: txnid,
        notes: `PayU web checkout — ${planLabel}`,
      };

      const { error: subscriptionError } = await (supabase as any)
        .from('subscriptions')
        .insert(subscriptionRow);

      if (subscriptionError) {
        logger.error('Error creating pending subscription:', subscriptionError);
        // Continue anyway - we'll handle it after payment
      }

      // UDF fields for storing user context
      const udf1 = user.id;           // Store user_id
      const udf2 = dbSubscriptionType;
      const udf3 = '';
      const udf4 = '';
      const udf5 = '';

      // Generate hash client-side
      const hash = await generatePayUHash(
        PAYU_MERCHANT_KEY,
        txnid,
        amount.toFixed(2),
        productInfo,
        firstname,
        email,
        udf1,
        udf2,
        udf3,
        udf4,
        udf5,
        PAYU_MERCHANT_SALT
      );

      // PayU POSTs payment result to surl/furl — use API paths that redirect to SPA routes
      const successUrl = `${SITE_URL}/api/payu-success`;
      const failureUrl = `${SITE_URL}/api/payu-failure`;

      // Set form data - this will trigger the form submission
      setFormData({
        key: PAYU_MERCHANT_KEY,
        txnid,
        amount: amount.toFixed(2),
        productinfo: productInfo,
        firstname,
        email,
        phone: phone || '9999999999', // PayU requires a phone number
        surl: successUrl,
        furl: failureUrl,
        hash,
        udf1,
        udf2,
        udf3,
        udf4,
        udf5,
      });

      toast({
        title: "Redirecting to PayU",
        description: "Please complete your payment on the PayU secure page",
      });

    } catch (error: any) {
      logger.error('Payment initiation error:', error);
      setLoading(false);
      
      toast({
        title: "Payment Error",
        description: error.message || "Failed to initiate payment. Please try again.",
        variant: "destructive"
      });

      onFailure?.(error.message || 'Payment initiation failed');
    }
  };

  return (
    <>
      {/* Hidden form for PayU submission */}
      {formData && (
        <form
          ref={formRef}
          method="POST"
          action={PAYU_BASE_URL}
          style={{ display: 'none' }}
        >
          <input type="hidden" name="key" value={formData.key} />
          <input type="hidden" name="txnid" value={formData.txnid} />
          <input type="hidden" name="amount" value={formData.amount} />
          <input type="hidden" name="productinfo" value={formData.productinfo} />
          <input type="hidden" name="firstname" value={formData.firstname} />
          <input type="hidden" name="email" value={formData.email} />
          <input type="hidden" name="phone" value={formData.phone} />
          <input type="hidden" name="surl" value={formData.surl} />
          <input type="hidden" name="furl" value={formData.furl} />
          <input type="hidden" name="hash" value={formData.hash} />
          <input type="hidden" name="udf1" value={formData.udf1} />
          <input type="hidden" name="udf2" value={formData.udf2} />
          <input type="hidden" name="udf3" value={formData.udf3} />
          <input type="hidden" name="udf4" value={formData.udf4} />
          <input type="hidden" name="udf5" value={formData.udf5} />
        </form>
      )}

      {/* Payment Button */}
      <Button
        onClick={initiatePayment}
        disabled={disabled || loading || !user}
        className={`${className}`}
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <CreditCard className="mr-2 h-4 w-4" />
            {buttonText}
          </>
        )}
      </Button>
    </>
  );
};

// Export a secure payment badge component
export const SecurePaymentBadge: React.FC = () => (
  <div className="flex items-center gap-2 text-xs text-muted-foreground">
    <Shield className="h-3 w-3" />
    <span>Secured by PayU</span>
    <Lock className="h-3 w-3" />
    <span>256-bit SSL</span>
  </div>
);

export default PayUCheckout;
