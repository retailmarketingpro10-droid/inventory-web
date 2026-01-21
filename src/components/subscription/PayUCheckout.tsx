import { useEffect, useRef } from 'react';
import { payuService } from '@/services/payuService';

interface PayUCheckoutProps {
  amount: number;
  transactionId: string;
  userEmail: string;
  userName: string;
  userPhone: string;
  onSuccess?: () => void;
  onFailure?: () => void;
}

export const PayUCheckout = ({
  amount,
  transactionId,
  userEmail,
  userName,
  userPhone,
  onSuccess,
  onFailure
}: PayUCheckoutProps) => {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (formRef.current) {
      // Auto-submit form to redirect to PayU
      formRef.current.submit();
    }
  }, []);

  const paymentForm = payuService.createPaymentForm({
    amount,
    productInfo: 'Inventory Subscription Renewal - Annual Plan',
    firstName: userName.split(' ')[0] || 'Customer', // First part of name
    lastName: userName.split(' ').slice(1).join(' ') || 'User', // Rest of name as lastname
    email: userEmail,
    phone: userPhone,
    transactionId,
    successUrl: `${window.location.origin}/payment-success?txnid=${transactionId}`,
    failureUrl: `${window.location.origin}/payment-failure?txnid=${transactionId}`,
    // Add default address fields
    address1: 'N/A',
    city: 'N/A',
    state: 'N/A',
    country: 'India',
    zipcode: '000000'
  });

  return (
    <form
      ref={formRef}
      action={paymentForm.action}
      method={paymentForm.method}
      style={{ display: 'none' }}
    >
      {Object.entries(paymentForm.fields).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
    </form>
  );
};
