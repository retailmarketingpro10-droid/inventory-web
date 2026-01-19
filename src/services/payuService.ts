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
  cancelUrl?: string;
  address1?: string;
  city?: string;
  state?: string;
  country?: string;
  zipcode?: string;
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
   * EXACT format from working project: key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||salt
   */
  generateHash(params: Record<string, string>, salt: string): string {
    // PayU hash format: key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||salt
    const hashSequence = [
      params.key,
      params.txnid,
      params.amount,
      params.productinfo,
      params.firstname,
      params.email,
      params.udf1 || '',
      params.udf2 || '',
      params.udf3 || '',
      params.udf4 || '',
      params.udf5 || '',
      '', '', '', '', '', // 5 empty fields before salt
      salt
    ].join('|');
    
    console.log('Hash String:', hashSequence);
    const hash = CryptoJS.SHA512(hashSequence).toString(CryptoJS.enc.Hex);
    console.log('Generated Hash:', hash);
    return hash;
  }

  /**
   * Verify payment response hash from PayU
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
    const hashSequence = [
      this.config.merchantSalt,
      response.status,
      '', '', '', '', '',
      response.udf5 || '',
      response.udf4 || '',
      response.udf3 || '',
      response.udf2 || '',
      response.udf1 || '',
      response.email,
      response.firstname,
      response.productinfo,
      response.amount,
      response.txnid,
      this.config.merchantKey
    ].join('|');
    
    const calculatedHash = CryptoJS.SHA512(hashSequence).toString(CryptoJS.enc.Hex);
    return calculatedHash.toLowerCase() === response.hash.toLowerCase();
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

    // Generate unique transaction ID
    const txnid = params.transactionId.substring(0, 30);
    
    // Format amount to 2 decimal places
    const amount = params.amount.toFixed(2);
    
    // Prepare basic fields
    const productinfo = params.productInfo.substring(0, 100);
    const firstname = (params.firstName || 'Customer').substring(0, 60).trim();
    const lastname = (params.lastName || '').substring(0, 60).trim();
    const email = params.email.trim();
    const phone = this.formatPhoneNumber(params.phone);

    // Validate required fields
    if (!email || !firstname || phone.length !== 10) {
      throw new Error(`Invalid payment parameters: email=${!!email}, name=${!!firstname}, phone=${phone.length} digits`);
    }

    // Build URLs
    const appBaseUrl = import.meta.env.VITE_URL || window.location.origin;
    const surl = params.successUrl || `${appBaseUrl}/payment-success?txnid=${txnid}`;
    const furl = params.failureUrl || `${appBaseUrl}/payment-failure?txnid=${txnid}`;
    const curl = params.cancelUrl || `${appBaseUrl}/payment-failure?txnid=${txnid}&cancelled=true`;

    // Prepare payment parameters object for hash generation
    const paymentParams: Record<string, string> = {
      key: this.config.merchantKey,
      txnid: txnid,
      amount: amount,
      productinfo: productinfo,
      firstname: firstname,
      email: email,
      phone: phone,
      surl: surl,
      furl: furl,
      curl: curl,
      udf1: params.userId || '',
      udf2: 'subscription_renewal',
      udf3: '',
      udf4: '',
      udf5: '',
    };

    // Generate hash
    paymentParams.hash = this.generateHash(paymentParams, this.config.merchantSalt);

    // Add service provider
    paymentParams.service_provider = 'payu_paisa';

    // Add optional fields
    if (lastname) paymentParams.lastname = lastname;
    if (params.address1) paymentParams.address1 = params.address1.substring(0, 100);
    if (params.city) paymentParams.city = params.city.substring(0, 20);
    if (params.state) paymentParams.state = params.state.substring(0, 20);
    if (params.country) paymentParams.country = params.country.substring(0, 20);
    if (params.zipcode) paymentParams.zipcode = params.zipcode.substring(0, 10);

    console.log('PayU Payment Request:', {
      key: paymentParams.key,
      txnid: paymentParams.txnid,
      amount: paymentParams.amount,
      productinfo: paymentParams.productinfo,
      firstname: paymentParams.firstname,
      email: paymentParams.email,
      phone: paymentParams.phone,
      surl: paymentParams.surl,
      furl: paymentParams.furl,
      udf1: paymentParams.udf1,
      udf2: paymentParams.udf2,
      hash: paymentParams.hash.substring(0, 30) + '...',
      hashLength: paymentParams.hash.length,
      testMode: this.config.testMode,
      paymentUrl: baseUrl
    });

    return {
      action: baseUrl,
      method: 'POST' as const,
      fields: paymentParams
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

