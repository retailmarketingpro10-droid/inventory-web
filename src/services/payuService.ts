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
  userId?: string; // User ID for tracking
  successUrl?: string;
  failureUrl?: string;
  cancelUrl?: string;
  // Optional address fields
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
    
    // Validate config
    if (!this.config.merchantKey || !this.config.merchantSalt) {
      console.error('PayU configuration missing: MERCHANT_KEY and MERCHANT_SALT are required');
    }
  }

  /**
   * Generate SHA512 hash for PayU payment request
   * PayU hash format: key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||salt
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
    salt: string;
  }): string {
    // PayU hash sequence: key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||salt
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
      params.salt
    ].join('|');
    
    console.log('Hash sequence (preview):', hashSequence.substring(0, 100) + '...');
    return CryptoJS.SHA512(hashSequence).toString(CryptoJS.enc.Hex);
  }

  /**
   * Verify payment response hash from PayU
   * Reverse hash format: salt|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key
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
      '', '', '', '', '', // 5 empty fields
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
    // Validate config
    if (!this.config.merchantKey || !this.config.merchantSalt) {
      throw new Error('PayU merchant key or salt is missing. Please check your environment variables.');
    }

    const baseUrl = this.config.testMode 
      ? 'https://test.payu.in/_payment'
      : 'https://secure.payu.in/_payment';

    const txnid = params.transactionId.substring(0, 30); // Ensure max length
    const amount = params.amount.toFixed(2); // Ensure 2 decimal places
    const productinfo = params.productInfo.substring(0, 100); // Max 100 chars
    const firstname = (params.firstName || 'Customer').substring(0, 60).trim(); // Max 60 chars, required
    const lastname = (params.lastName || 'User').substring(0, 60).trim(); // Default lastname
    const email = params.email.trim();
    const phone = this.formatPhoneNumber(params.phone); // Format to 10 digits
    
    // UDF fields for tracking
    const udf1 = params.userId || ''; // Store user ID
    const udf2 = 'subscription_renewal'; // Payment type
    const udf3 = '';
    const udf4 = '';
    const udf5 = '';
    
    // Address fields with defaults
    const address1 = (params.address1 || 'N/A').substring(0, 100);
    const city = (params.city || 'N/A').substring(0, 20);
    const state = (params.state || 'N/A').substring(0, 20);
    const country = (params.country || 'India').substring(0, 20);
    const zipcode = (params.zipcode || '000000').substring(0, 10);

    // Validate required fields
    if (!email || !firstname || phone.length !== 10) {
      throw new Error(`Invalid payment parameters: email=${!!email}, name=${!!firstname}, phone=${phone.length} digits`);
    }

    // Build URLs - use VITE_URL if available, otherwise use window.location.origin
    const baseAppUrl = import.meta.env.VITE_URL || window.location.origin;
    const surl = params.successUrl || `${baseAppUrl}/payment-success?txnid=${txnid}`;
    const furl = params.failureUrl || `${baseAppUrl}/payment-failure?txnid=${txnid}`;
    const curl = params.cancelUrl || `${baseAppUrl}/payment-failure?txnid=${txnid}&cancelled=true`;

    // Generate hash with UDF fields
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
      udf5,
      salt: this.config.merchantSalt
    });

    // Debug logging
    console.log('PayU Payment Request:', {
      key: this.config.merchantKey,
      txnid,
      amount,
      productinfo,
      firstname,
      lastname,
      email,
      phone,
      surl,
      furl,
      curl,
      udf1,
      udf2,
      hash: hash.substring(0, 20) + '...',
      hashLength: hash.length,
      testMode: this.config.testMode,
      baseUrl
    });

    const fields: Record<string, string> = {
      key: this.config.merchantKey,
      txnid,
      amount,
      productinfo,
      firstname,
      email,
      phone,
      surl,
      furl,
      curl,
      hash,
      service_provider: 'payu_paisa',
      udf1,
      udf2,
      udf3,
      udf4,
      udf5
    };

    // Add optional fields
    if (lastname) fields.lastname = lastname;
    if (address1) fields.address1 = address1;
    if (city) fields.city = city;
    if (state) fields.state = state;
    if (country) fields.country = country;
    if (zipcode) fields.zipcode = zipcode;

    return {
      action: baseUrl,
      method: 'POST' as const,
      fields
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

