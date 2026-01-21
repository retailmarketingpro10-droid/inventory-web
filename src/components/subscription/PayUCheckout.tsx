import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, CreditCard, Shield, Lock } from 'lucide-react';

// PayU Configuration from environment
const PAYU_MERCHANT_KEY = import.meta.env.VITE_PAYU_MERCHANT_KEY || '';
const PAYU_TEST_MODE = import.meta.env.VITE_PAYU_TEST_MODE === 'true';
const SITE_URL = import.meta.env.VITE_URL || window.location.origin;

// PayU URLs
const PAYU_BASE_URL = PAYU_TEST_MODE 
  ? 'https://test.payu.in/_payment' 
  : 'https://secure.payu.in/_payment';

interface PayUCheckoutProps {
  amount: number;
  productInfo: string;
  subscriptionType: 'annual' | 'monthly';
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

    setLoading(true);

    try {
      // Generate transaction ID
      const txnid = generateTxnId();
      
      // Get user details
      const firstname = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Customer';
      const email = user.email || '';
      const phone = user.user_metadata?.phone || user.phone || '';

      // Create a pending subscription record first
      const startDate = new Date();
      const endDate = new Date();
      
      if (subscriptionType === 'annual') {
        endDate.setFullYear(endDate.getFullYear() + 1);
      } else {
        endDate.setMonth(endDate.getMonth() + 1);
      }

      // Insert pending subscription
      const { error: subscriptionError } = await supabase
        .from('subscriptions')
        .insert({
          user_id: user.id,
          subscription_type: subscriptionType,
          status: 'pending',
          amount_paid: amount,
          start_date: startDate.toISOString().split('T')[0],
          end_date: endDate.toISOString().split('T')[0],
          renewal_date: endDate.toISOString().split('T')[0],
          payment_status: 'pending',
          payment_method: 'payu',
          transaction_id: txnid,
          notes: 'Payment initiated via PayU',
        });

      if (subscriptionError) {
        console.error('Error creating pending subscription:', subscriptionError);
        // Continue anyway - the payment verification will create it
      }

      // Get hash from Supabase Edge Function
      const { data: session } = await supabase.auth.getSession();
      
      if (!session?.session?.access_token) {
        throw new Error('No active session');
      }

      const hashResponse = await supabase.functions.invoke('payu-hash', {
        body: {
          txnid,
          amount: amount.toFixed(2),
          productinfo: productInfo,
          firstname,
          email,
          phone,
          udf1: user.id,           // Store user_id
          udf2: subscriptionType,   // Store subscription type
          udf3: '',
          udf4: '',
          udf5: '',
        },
      });

      if (hashResponse.error) {
        throw new Error(hashResponse.error.message || 'Failed to generate payment hash');
      }

      const { hash, key } = hashResponse.data;

      if (!hash || !key) {
        throw new Error('Invalid hash response from server');
      }

      // Get Supabase function URL for callbacks
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://fxylrxbhcqkwyxhftxxp.supabase.co';
      const successUrl = `${supabaseUrl}/functions/v1/payu-verify`;
      const failureUrl = `${supabaseUrl}/functions/v1/payu-verify`;

      // Set form data - this will trigger the form submission
      setFormData({
        key,
        txnid,
        amount: amount.toFixed(2),
        productinfo: productInfo,
        firstname,
        email,
        phone: phone || '9999999999', // PayU requires a phone number
        surl: successUrl,
        furl: failureUrl,
        hash,
        udf1: user.id,
        udf2: subscriptionType,
        udf3: '',
        udf4: '',
        udf5: '',
      });

      toast({
        title: "Redirecting to PayU",
        description: "Please complete your payment on the PayU secure page",
      });

    } catch (error: any) {
      console.error('Payment initiation error:', error);
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
