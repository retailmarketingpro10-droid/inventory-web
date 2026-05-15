# Email Setup Instructions

This project uses Supabase Edge Functions with Resend to send emails when contact forms are submitted.

## Setup Steps

### 1. Install Supabase CLI (if not already installed)
```bash
npm install -g supabase
```

### 2. Login to Supabase CLI
```bash
supabase login
```

### 3. Link Your Project
```bash
supabase link --project-ref YOUR_PROJECT_REF
```

### 4. Get Resend API Key
1. Go to https://resend.com and create an account
2. Navigate to API Keys section
3. Create a new API key
4. Copy the API key

### 5. Set Environment Variables in Supabase
```bash
# Set the Resend API key
supabase secrets set RESEND_API_KEY=your_resend_api_key_here

# Set recipient email (optional - defaults to retailmarketingpro1.0@gmail.com)
supabase secrets set RECIPIENT_EMAIL=retailmarketingpro1.0@gmail.com
```

### 6. Deploy the Edge Function
```bash
supabase functions deploy send-contact-email
```

### 7. Verify the Function
After deployment, test the function to ensure emails are being sent correctly.

## Alternative: Using Supabase Dashboard

If you prefer using the Supabase Dashboard:

1. Go to your Supabase project dashboard
2. Navigate to **Edge Functions**
3. Create a new function named `send-contact-email`
4. Copy the code from `supabase/functions/send-contact-email/index.ts`
5. Go to **Settings** > **Edge Functions** > **Secrets**
6. Add the following secrets:
   - `RESEND_API_KEY`: Your Resend API key
   - `RECIPIENT_EMAIL`: retailmarketingpro1.0@gmail.com (or leave blank to use default)

## Testing

Once set up, when users submit the contact form:
1. The form data is saved to the `contact_inquiries` table
2. An email is automatically sent to `retailmarketingpro1.0@gmail.com`
3. The email contains all the form details in a nicely formatted HTML email

## Email Content

The email will include:
- Full Name
- Email Address
- Mobile Number
- Business Type (if provided)
- Message

## Troubleshooting

If emails are not being sent:
1. Check the Supabase function logs for errors
2. Verify the Resend API key is correct
3. Ensure the Edge Function is deployed
4. Check that the recipient email is correct

## Notes

- The function uses Resend API for reliable email delivery
- Emails are sent asynchronously after form submission
- Form data is always saved even if email sending fails
- The recipient email is set to `retailmarketingpro1.0@gmail.com` by default


















