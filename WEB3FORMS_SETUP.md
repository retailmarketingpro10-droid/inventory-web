# Web3Forms Email Setup Guide

This project uses Web3Forms to send emails when contact forms are submitted. Web3Forms is a free, simple form-to-email service that requires no backend setup.

## Quick Setup (3 Steps)

### 1. Get Your Web3Forms Access Key

1. Go to **https://web3forms.com**
2. Sign up for a free account (or log in if you already have one)
3. Navigate to **API Keys** section
4. Create a new access key or copy your existing one
5. Copy the access key (it looks like: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)

### 2. Add Access Key to Environment Variables

Create or update your `.env` file in the root of your project:

```env
VITE_WEB3FORMS_ACCESS_KEY=your_access_key_here
```

**Important**: 
- Replace `your_access_key_here` with your actual Web3Forms access key
- Never commit your `.env` file to git (it should already be in `.gitignore`)

### 3. Restart Your Development Server

After adding the environment variable, restart your development server:

```bash
npm run dev
# or
yarn dev
```

## How It Works

When a user submits the contact form:

1. **Form data is saved** to the `contact_inquiries` database table
2. **Admin email is sent** immediately to `retailmarketingpro1.0@gmail.com` with all form details
3. **User confirmation email is sent** immediately to the user's email address

## Email Details

### Admin Email
- **To**: retailmarketingpro1.0@gmail.com
- **Subject**: "New Contact Form Submission from [User Name]"
- **Content**: All form fields (Name, Email, Mobile, Business Type, Message)

### User Confirmation Email
- **To**: User's email address
- **Subject**: "Thank You for Contacting Us - Inventory Manager"
- **Content**: Confirmation message with their submission details

## Free Tier Limits

Web3Forms free tier includes:
- **250 emails per month** (more than enough for most use cases)
- No credit card required
- Instant setup
- Reliable delivery

## Testing

To test the email functionality:

1. Fill out the contact form on your site
2. Submit the form
3. Check your inbox at `retailmarketingpro1.0@gmail.com` for the admin email
4. Check the user's email inbox for the confirmation email

## Troubleshooting

### Emails Not Sending?

1. **Check your access key**: Make sure it's correct in your `.env` file
2. **Verify environment variable**: Ensure `VITE_WEB3FORMS_ACCESS_KEY` is set correctly
3. **Check browser console**: Look for any error messages
4. **Verify Web3Forms account**: Log in to web3forms.com and check your API key status
5. **Check email limits**: Make sure you haven't exceeded the free tier limit

### Access Key Not Working?

- Make sure there are no extra spaces in your `.env` file
- Verify the key is correctly copied (no missing characters)
- Ensure you're using the access key, not the API endpoint

## Production Deployment

When deploying to production (Vercel, Netlify, etc.):

1. Add the environment variable in your hosting platform's dashboard
2. Go to **Settings** > **Environment Variables**
3. Add: `VITE_WEB3FORMS_ACCESS_KEY` with your access key value
4. Redeploy your application

## Security Notes

- ✅ The access key is safe to use in frontend code (it's designed for client-side use)
- ✅ Web3Forms handles spam protection automatically
- ✅ No sensitive credentials are exposed
- ✅ Rate limiting is built-in to prevent abuse

## Alternative: Hardcode Access Key (Not Recommended)

If you prefer not to use environment variables, you can directly replace the constant in `src/pages/Auth.tsx`:

```typescript
const WEB3FORMS_ACCESS_KEY = 'your_access_key_here';
```

**Warning**: This approach is less secure and not recommended for production.

---

**Need Help?** Visit https://web3forms.com/docs for more information.






