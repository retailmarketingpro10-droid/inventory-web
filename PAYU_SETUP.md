# PayU Payment Gateway Setup Guide

This project uses PayU payment gateway for subscription renewals. PayU is integrated for secure online payments.

## Quick Setup (3 Steps)

### 1. Get Your PayU Test Credentials

1. Go to **https://www.payu.in** or **https://test.payu.in**
2. Sign up for a PayU merchant account (or log in if you already have one)
3. Navigate to **Merchant Dashboard** > **Integration** > **API Keys**
4. Copy your **Merchant Key** and **Merchant Salt** from the test environment

**For Testing:**
- Use PayU test credentials (available in test dashboard)
- Test Merchant Key: Usually starts with `gtKFFx` or similar
- Test Merchant Salt: Available in your PayU test dashboard

### 2. Add Credentials to Environment Variables

Create or update your `.env` file in the root of your project:

```env
VITE_PAYU_MERCHANT_KEY=your_merchant_key_here
VITE_PAYU_MERCHANT_SALT=your_merchant_salt_here
VITE_PAYU_TEST_MODE=true
```

**Important**: 
- Replace `your_merchant_key_here` with your actual PayU merchant key
- Replace `your_merchant_salt_here` with your actual PayU merchant salt
- Set `VITE_PAYU_TEST_MODE=true` for testing (use `false` for production)
- Never commit your `.env` file to git (it should already be in `.gitignore`)

### 3. Restart Your Development Server

After adding the environment variables, restart your development server:

```bash
npm run dev
# or
yarn dev
```

## How It Works

When a user renews their subscription:

1. **User clicks "Renew Subscription"** button
2. **Payment form is generated** with PayU payment gateway integration
3. **User is redirected** to PayU payment page (test.payu.in for testing)
4. **User completes payment** on PayU gateway
5. **PayU redirects back** to success/failure page
6. **Payment is verified** and subscription is activated

## Test Mode vs Production Mode

### Test Mode (`VITE_PAYU_TEST_MODE=true`)
- Uses PayU test environment: `https://test.payu.in/_payment`
- Test credentials from PayU test dashboard
- No real money transactions
- Perfect for development and testing

### Production Mode (`VITE_PAYU_TEST_MODE=false`)
- Uses PayU production environment: `https://secure.payu.in/_payment`
- Production credentials from PayU merchant dashboard
- Real money transactions
- Use only after thorough testing

## Testing

To test the payment functionality:

1. Ensure `VITE_PAYU_TEST_MODE=true` in your `.env` file
2. Set subscription amount to ₹10 for testing (already configured)
3. Click "Renew Subscription" button
4. You'll be redirected to PayU test payment page
5. Use PayU test card details:
   - **Card Number**: 5123456789012346
   - **CVV**: 123
   - **Expiry**: Any future date
   - **Name**: Any name

## Current Configuration

- **Payment Method**: PayU only (other methods removed)
- **Test Amount**: ₹10 INR (for testing purposes)
- **Production Amount**: ₹3,000 INR (to be changed after testing)

## Production Deployment

When deploying to production (Vercel, Netlify, etc.):

1. Add the environment variables in your hosting platform's dashboard
2. Go to **Settings** > **Environment Variables**
3. Add:
   - `VITE_PAYU_MERCHANT_KEY` with your production merchant key
   - `VITE_PAYU_MERCHANT_SALT` with your production merchant salt
   - `VITE_PAYU_TEST_MODE` set to `false` for production
4. **Important**: Change subscription amount back to ₹3,000 in code
5. Redeploy your application

## Changing Subscription Amount

### For Testing (Current):
The subscription amount is set to ₹10 in:
- `src/components/subscription/SubscriptionManager.tsx` (line 252)
- `src/components/subscription/PaymentRequired.tsx` (line 90)

### For Production:
After testing is complete, change the amount back to ₹3,000:
1. Search for all occurrences of `10` (subscription amount)
2. Replace with `3000` in:
   - `SubscriptionManager.tsx`: `const renewalAmount = 3000;`
   - `PaymentRequired.tsx`: `formatIndianCurrency(3000)`
   - All other places where subscription amount is displayed

## Security Notes

- ✅ Merchant Key and Salt are used only for payment form generation
- ✅ Payment verification uses hash-based security
- ✅ Never expose your Merchant Salt in client-side code (it's already in env vars)
- ✅ Use test mode during development
- ✅ Switch to production mode only after thorough testing

## Troubleshooting

### Payment Not Redirecting?
1. **Check your credentials**: Verify Merchant Key and Salt are correct
2. **Verify environment variables**: Ensure `VITE_PAYU_MERCHANT_KEY` and `VITE_PAYU_MERCHANT_SALT` are set
3. **Check test mode**: Ensure `VITE_PAYU_TEST_MODE=true` for testing
4. **Check browser console**: Look for any error messages
5. **Verify PayU account**: Log in to PayU dashboard and check your API key status

### Hash Verification Failed?
- Ensure Merchant Key and Salt are correct
- Check that the hash generation format matches PayU requirements
- Verify transaction ID format (max 30 characters)

### Payment Success but Subscription Not Updated?
- Check payment success callback URL
- Verify database permissions for subscription updates
- Check browser console for errors

## PayU Documentation

For more information, visit:
- **PayU Developer Docs**: https://devguide.payu.in/
- **PayU Test Environment**: https://test.payu.in
- **PayU Support**: Contact PayU support for merchant account issues

---

**Need Help?** Contact support at retailmarketingpro1.0@gmail.com for payment-related assistance.
