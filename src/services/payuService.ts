import CryptoJS from 'crypto-js';

interface PayUConfig {
  merchantKey: string;
  merchantSalt: string;
  testMode: boolean;
}

interface PayUPaymentParams {
  amount: number;
  productInfo: string;
  firstName: string;
  lastName?: string;
  email: string;
  phone: string;
  transactionId: string;
  userId?: string;
  successUrl?: string;
  failureUrl?: string;
  udf1?: string;
  udf2?: string;
  udf3?: string;
  udf4?: string;
  udf5?: string;
}

class PayUService {
  private config: PayUConfig;

  constructor() {
    this.config = {
      merchantKey: import.meta.env.VITE_PAYU_MERCHANT_KEY || '',
      merchantSalt: import.meta.env.VITE_PAYU_MERCHANT_SALT || '',
      testMode: import.meta.env.VITE_PAYU_TEST_MODE === 'true'
    };
    
    console.log('PayU Config Loaded:', {
      hasKey: !!this.config.merchantKey,
      hasSalt: !!this.config.merchantSalt,
      keyLength: this.config.merchantKey?.length,
      saltLength: this.config.merchantSalt?.length,
      testMode: this.config.testMode
    });
    
    if (!this.config.merchantKey || !this.config.merchantSalt) {
      console.error('PayU configuration missing: MERCHANT_KEY and MERCHANT_SALT are required');
    }
  }

  /**
   * Generate SHA512 hash for PayU payment request
   * EXACT PayU Format: sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT)
   * Note: 6 empty pipes (||||||) after udf5 before SALT
   */
  generateHash(params: {
    key: string;
    txnid: string;
    amount: string;
    productinfo: string;
    firstname: string;
    email: string;
    udf1?: string;
    udf2?: string;
    udf3?: string;
    udf4?: string;
    udf5?: string;
  }, salt: string): string {
    // PayU hash format: key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT
    // The sequence requires UDF fields (empty if not used) followed by 6 empty pipes before salt
    const hashString = 
      `${params.key}|` +
      `${params.txnid}|` +
      `${params.amount}|` +
      `${params.productinfo}|` +
      `${params.firstname}|` +
      `${params.email}|` +
      `${params.udf1 || ''}|` +
      `${params.udf2 || ''}|` +
      `${params.udf3 || ''}|` +
      `${params.udf4 || ''}|` +
      `${params.udf5 || ''}|` +
      `|||||${salt}`; // 6 empty pipes (5 more after the last |) then salt
    
    console.log('Hash String:', hashString);
    const hash = CryptoJS.SHA512(hashString).toString().toLowerCase();
    console.log('Generated Hash:', hash);
    return hash;
  }

  /**
   * Verify payment response hash from PayU
   * Reverse format: SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key
   */
  verifyPaymentResponse(response: {
    status: string;
    txnid: string;
    amount: string;
    productinfo: string;
    firstname: string;
    email: string;
    hash: string;
    udf1?: string;
    udf2?: string;
    udf3?: string;
    udf4?: string;
    udf5?: string;
  }): boolean {
    const hashString = 
      `${this.config.merchantSalt}|` +
      `${response.status}|` +
      `|||||` + // 6 empty fields
      `${response.udf5 || ''}|` +
      `${response.udf4 || ''}|` +
      `${response.udf3 || ''}|` +
      `${response.udf2 || ''}|` +
      `${response.udf1 || ''}|` +
      `${response.email}|` +
      `${response.firstname}|` +
      `${response.productinfo}|` +
      `${response.amount}|` +
      `${response.txnid}|` +
      `${this.config.merchantKey}`;
    
    const calculatedHash = CryptoJS.SHA512(hashString).toString().toLowerCase();
    return calculatedHash === response.hash.toLowerCase();
  }

  /**
   * Create payment form data for PayU
   */
  createPaymentForm(params: PayUPaymentParams) {
    if (!this.config.merchantKey || !this.config.merchantSalt) {
      throw new Error('PayU merchant key or salt is missing. Please check environment variables.');
    }

    // PayU API endpoint - use test or production based on config
    const baseUrl = this.config.testMode 
      ? 'https://test.payu.in/_payment'
      : 'https://secure.payu.in/_payment';

    // Prepare transaction ID (max 30 chars)
    const txnid = params.transactionId.substring(0, 30);
    
    // Format amount to 2 decimal places as string
    const amount = params.amount.toFixed(2);
    
    // Prepare basic fields
    const productinfo = params.productInfo.substring(0, 100);
    const firstname = (params.firstName || 'Customer').substring(0, 60).trim();
    const lastname = (params.lastName || '').substring(0, 60).trim();
    const email = params.email.trim();
    const phone = this.formatPhoneNumber(params.phone);

    // UDF fields (User Defined Fields) - use empty string if not provided
    const udf1 = params.udf1 || '';
    const udf2 = params.udf2 || '';
    const udf3 = params.udf3 || '';
    const udf4 = params.udf4 || '';
    const udf5 = params.udf5 || '';

    // Validate required fields
    if (!email || !firstname || phone.length !== 10) {
      throw new Error(`Invalid payment parameters: email=${!!email}, name=${!!firstname}, phone=${phone.length} digits`);
    }

    // Build URLs - ensure no trailing slash issues
    let appBaseUrl = import.meta.env.VITE_URL || window.location.origin;
    // Remove trailing slash if present
    if (appBaseUrl.endsWith('/')) {
      appBaseUrl = appBaseUrl.slice(0, -1);
    }
    // Remove /subscription if present at the end
    if (appBaseUrl.endsWith('/subscription')) {
      appBaseUrl = appBaseUrl.replace('/subscription', '');
    }
    
    const surl = params.successUrl || `${appBaseUrl}/payment-success?txnid=${txnid}`;
    const furl = params.failureUrl || `${appBaseUrl}/payment-failure?txnid=${txnid}`;

    // Generate hash with ALL required fields including UDFs
    const hash = this.generateHash({
      key: this.config.merchantKey,
      txnid,
      amount,
      productinfo,
      firstname,
      email,
      udf1,
      udf2,
      udf3,
      udf4,
      udf5
    }, this.config.merchantSalt);

    // Build the complete form fields
    const formFields: Record<string, string> = {
      key: this.config.merchantKey,
      txnid,
      amount,
      productinfo,
      firstname,
      email,
      phone,
      surl,
      furl,
      hash,
      service_provider: 'payu_paisa',
      udf1,
      udf2,
      udf3,
      udf4,
      udf5
    };

    // Add optional fields
    if (lastname) formFields.lastname = lastname;

    console.log('PayU Payment Request:', {
      key: formFields.key,
      txnid: formFields.txnid,
      amount: formFields.amount,
      productinfo: formFields.productinfo,
      firstname: formFields.firstname,
      email: formFields.email,
      phone: formFields.phone,
      surl: formFields.surl,
      furl: formFields.furl,
      udf1: formFields.udf1,
      udf2: formFields.udf2,
      hash: formFields.hash.substring(0, 30) + '...',
      hashLength: formFields.hash.length,
      testMode: this.config.testMode,
      paymentUrl: baseUrl
    });

    return {
      action: baseUrl,
      method: 'POST' as const,
      fields: formFields
    };
  }

  /**
   * Format phone number for PayU (must be exactly 10 digits for India)
   */
  formatPhoneNumber(phone: string): string {
    if (!phone) return '0000000000'; // Default fallback
    
    // Remove all non-digit characters
    const digits = phone.replace(/\D/g, '');
    
    // Remove country code if present (91 for India)
    if (digits.length === 12 && digits.startsWith('91')) {
      return digits.substring(2);
    }
    
    // Remove leading 0 if present
    if (digits.length === 11 && digits.startsWith('0')) {
      return digits.substring(1);
    }
    
    // Return last 10 digits if longer, or pad if shorter
    if (digits.length >= 10) {
      return digits.slice(-10);
    }
    
    return digits.padStart(10, '0');
  }

  /**
   * Generate unique transaction ID (PayU max 30 chars, alphanumeric)
   */
  generateTransactionId(): string {
    const timestamp = Date.now().toString().slice(-10); // Last 10 digits
    const random = Math.random().toString(36).substring(2, 8).toUpperCase(); // 6 chars
    return `TXN${timestamp}${random}`.substring(0, 30); // Ensure max 30 chars
  }
}

export const payuService = new PayUService();

