import { useEffect, useRef } from 'react';
import { payuService } from '@/services/payuService';

interface PayUCheckoutProps {
  amount: number;
  transactionId: string;
  userEmail: string;
  userName: string;
  userPhone: string;
  userId?: string;
  onSuccess?: () => void;
  onFailure?: () => void;
}

export const PayUCheckout = ({
  amount,
  transactionId,
  userEmail,
  userName,
  userPhone,
  userId,
  onSuccess,
  onFailure
}: PayUCheckoutProps) => {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (formRef.current) {
      // Auto-submit form to redirect to PayU
      console.log('Submitting PayU form...');
      formRef.current.submit();
    }
  }, []);

  // Build URLs - use VITE_URL if available, otherwise use window.location.origin
  const baseUrl = import.meta.env.VITE_URL || window.location.origin;
  
  const paymentForm = payuService.createPaymentForm({
    amount,
    productInfo: 'Inventory Subscription Renewal - Annual Plan',
    firstName: userName.split(' ')[0] || 'Customer',
    lastName: userName.split(' ').slice(1).join(' ') || 'User',
    email: userEmail,
    phone: userPhone,
    transactionId,
    userId: userId || '',
    successUrl: `${baseUrl}/payment-success?txnid=${transactionId}`,
    failureUrl: `${baseUrl}/payment-failure?txnid=${transactionId}`,
    cancelUrl: `${baseUrl}/payment-failure?txnid=${transactionId}&cancelled=true`,
    // Add default address fields
    address1: 'N/A',
    city: 'N/A',
    state: 'N/A',
    country: 'India',
    zipcode: '000000'
  });

  console.log('PayU Form Action:', paymentForm.action);
  console.log('PayU Form Fields:', Object.keys(paymentForm.fields));

  return (
    <form
      ref={formRef}
      action={paymentForm.action}
      method={paymentForm.method}
      style={{ display: 'none' }}
    >
      {Object.entries(paymentForm.fields).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value || ''} />
      ))}
    </form>
  );
};

