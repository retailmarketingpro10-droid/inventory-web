import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const RECIPIENT_EMAIL = Deno.env.get('RECIPIENT_EMAIL') || 'retailmarketingpro1.0@gmail.com'

interface ContactFormData {
  full_name: string
  email: string
  mobile_number: string
  business_type?: string
  message: string
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    const { full_name, email, mobile_number, business_type, message } = await req.json() as ContactFormData

    if (!full_name || !email || !mobile_number || !message) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { 
          status: 400,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      )
    }

    // Prepare email content
    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .field { margin-bottom: 15px; }
            .label { font-weight: bold; color: #667eea; margin-bottom: 5px; display: block; }
            .value { background: white; padding: 10px; border-radius: 4px; border-left: 3px solid #667eea; }
            .message-box { background: white; padding: 15px; border-radius: 4px; border-left: 3px solid #667eea; min-height: 100px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>New Contact Form Submission</h2>
              <p>Inventory Manager - Contact Inquiry</p>
            </div>
            <div class="content">
              <div class="field">
                <span class="label">Full Name:</span>
                <div class="value">${full_name}</div>
              </div>
              <div class="field">
                <span class="label">Email Address:</span>
                <div class="value">${email}</div>
              </div>
              <div class="field">
                <span class="label">Mobile Number:</span>
                <div class="value">${mobile_number}</div>
              </div>
              ${business_type ? `
              <div class="field">
                <span class="label">Business Type:</span>
                <div class="value">${business_type}</div>
              </div>
              ` : ''}
              <div class="field">
                <span class="label">Message:</span>
                <div class="message-box">${message.replace(/\n/g, '<br>')}</div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `

    const emailText = `
New Contact Form Submission - Inventory Manager

Full Name: ${full_name}
Email Address: ${email}
Mobile Number: ${mobile_number}
${business_type ? `Business Type: ${business_type}\n` : ''}

Message:
${message}

---
This email was sent from the Inventory Manager contact form.
    `.trim()

    // Send email using Resend API
    if (RESEND_API_KEY) {
      const emailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Inventory Manager <noreply@inventorymanager.com>',
          to: [RECIPIENT_EMAIL],
          subject: `New Contact Form Submission from ${full_name}`,
          html: emailHtml,
          text: emailText,
        }),
      })

      if (!emailResponse.ok) {
        const errorData = await emailResponse.text()
        console.error('Resend API error:', errorData)
        throw new Error('Failed to send email')
      }
    } else {
      // Fallback: Log to console (for development)
      console.log('Email would be sent to:', RECIPIENT_EMAIL)
      console.log('Email content:', emailText)
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Contact form submitted and email sent successfully' 
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Failed to process contact form' 
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  }
})


















