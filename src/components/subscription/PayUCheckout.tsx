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
      console.log('Submitting PayU form...');
      formRef.current.submit();
    }
  }, []);

  const paymentForm = payuService.createPaymentForm({
    amount,
    productInfo: 'Inventory Subscription Renewal',
    firstName: userName.split(' ')[0] || 'Customer',
    lastName: userName.split(' ').slice(1).join(' ') || '',
    email: userEmail,
    phone: userPhone,
    transactionId,
    // UDF fields - keep empty strings for proper hash generation
    udf1: '',
    udf2: '',
    udf3: '',
    udf4: '',
    udf5: '',
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

