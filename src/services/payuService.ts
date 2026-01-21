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
  lastName?: string; // Add optional lastname
  email: string;
  phone: string;
  transactionId: string;
  successUrl: string;
  failureUrl: string;
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
   * Format: key|txnid|amount|productinfo|firstname|email|||||||||||salt
   */
  generateHash(params: {
    key: string;
    txnid: string;
    amount: string;
    productinfo: string;
    firstname: string;
    email: string;
    salt: string;
  }): string {
    const hashString = `${params.key}|${params.txnid}|${params.amount}|${params.productinfo}|${params.firstname}|${params.email}|||||||||||${params.salt}`;
    return CryptoJS.SHA512(hashString).toString();
  }

  /**
   * Verify payment response hash from PayU
   * Format: salt|status|||||||||||email|firstname|productinfo|amount|txnid|key
   */
  verifyPaymentResponse(response: {
    status: string;
    txnid: string;
    amount: string;
    productinfo: string;
    firstname: string;
    email: string;
    hash: string;
  }): boolean {
    const hashString = `${this.config.merchantSalt}|${response.status}|||||||||||${response.email}|${response.firstname}|${response.productinfo}|${response.amount}|${response.txnid}|${this.config.merchantKey}`;
    const calculatedHash = CryptoJS.SHA512(hashString).toString();
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

    // Generate hash (PayU format: key|txnid|amount|productinfo|firstname|email|||||||||||salt)
    // Note: lastname and address fields are NOT in the hash for basic integration
    const hash = this.generateHash({
      key: this.config.merchantKey,
      txnid,
      amount,
      productinfo,
      firstname,
      email,
      salt: this.config.merchantSalt
    });

    // Debug logging (remove in production)
    console.log('PayU Payment Request:', {
      key: this.config.merchantKey,
      txnid,
      amount,
      productinfo,
      firstname,
      lastname,
      email,
      phone,
      hash: hash.substring(0, 20) + '...',
      testMode: this.config.testMode
    });

    const fields: Record<string, string> = {
      key: this.config.merchantKey,
      txnid,
      amount,
      productinfo,
      firstname,
      email,
      phone,
      surl: params.successUrl,
      furl: params.failureUrl,
      hash,
      service_provider: 'payu_paisa'
    };

    // Add optional fields that PayU might require
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
