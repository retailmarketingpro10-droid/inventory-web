import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts"

// PayU Configuration
const PAYU_MERCHANT_KEY = Deno.env.get('PAYU_MERCHANT_KEY') || ''
const PAYU_MERCHANT_SALT = Deno.env.get('PAYU_MERCHANT_SALT') || ''

interface PayUResponse {
  mihpayid: string
  mode: string
  status: string
  unmappedstatus: string
  key: string
  txnid: string
  amount: string
  cardCategory: string
  discount: string
  net_amount_debit: string
  addedon: string
  productinfo: string
  firstname: string
  lastname: string
  address1: string
  address2: string
  city: string
  state: string
  country: string
  zipcode: string
  email: string
  phone: string
  udf1: string  // user_id
  udf2: string  // subscription_type
  udf3: string
  udf4: string
  udf5: string
  udf6: string
  udf7: string
  udf8: string
  udf9: string
  udf10: string
  hash: string
  field1: string
  field2: string
  field3: string
  field4: string
  field5: string
  field6: string
  field7: string
  field8: string
  field9: string
  payment_source: string
  PG_TYPE: string
  bank_ref_num: string
  bankcode: string
  error: string
  error_Message: string
}

// SHA-512 hash function
async function sha512(message: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-512', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

serve(async (req) => {
  // Handle CORS preflight
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Parse the PayU response (form data)
    const formData = await req.formData()
    const payuResponse: Partial<PayUResponse> = {}
    
    for (const [key, value] of formData.entries()) {
      payuResponse[key as keyof PayUResponse] = value as string
    }

    console.log('PayU Response received:', {
      txnid: payuResponse.txnid,
      status: payuResponse.status,
      amount: payuResponse.amount,
      mihpayid: payuResponse.mihpayid,
    })

    // Verify the response hash (reverse hash)
    // Reverse hash formula: sha512(salt|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)
    const reverseHashString = `${PAYU_MERCHANT_SALT}|${payuResponse.status}||||||${payuResponse.udf5 || ''}|${payuResponse.udf4 || ''}|${payuResponse.udf3 || ''}|${payuResponse.udf2 || ''}|${payuResponse.udf1 || ''}|${payuResponse.email}|${payuResponse.firstname}|${payuResponse.productinfo}|${payuResponse.amount}|${payuResponse.txnid}|${PAYU_MERCHANT_KEY}`
    
    const calculatedHash = await sha512(reverseHashString)
    
    if (calculatedHash !== payuResponse.hash) {
      console.error('Hash verification failed!')
      // Redirect to failure page
      return new Response(null, {
        status: 302,
        headers: {
          'Location': `${Deno.env.get('SITE_URL') || 'https://inventory.retailmarketingpro.in'}/payment-failure?error=hash_mismatch&txnid=${payuResponse.txnid}`,
        },
      })
    }

    const userId = payuResponse.udf1
    const subscriptionType = payuResponse.udf2 || 'annual'
    const isSuccess = payuResponse.status === 'success'

    if (isSuccess && userId) {
      // Calculate subscription dates
      const startDate = new Date()
      const endDate = new Date()
      
      if (subscriptionType === 'annual') {
        endDate.setFullYear(endDate.getFullYear() + 1)
      } else if (subscriptionType === 'monthly') {
        endDate.setMonth(endDate.getMonth() + 1)
      }

      // Create or update subscription
      const { data: existingSubscription, error: fetchError } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .eq('transaction_id', payuResponse.txnid)
        .maybeSingle()

      if (existingSubscription) {
        // Update existing pending subscription
        const { error: updateError } = await supabase
          .from('subscriptions')
          .update({
            status: 'active',
            payment_status: 'paid',
            payment_method: 'payu',
            transaction_id: payuResponse.mihpayid || payuResponse.txnid,
            notes: `PayU Payment successful. Bank Ref: ${payuResponse.bank_ref_num || 'N/A'}, Mode: ${payuResponse.mode || 'N/A'}`,
            start_date: startDate.toISOString().split('T')[0],
            end_date: endDate.toISOString().split('T')[0],
            renewal_date: endDate.toISOString().split('T')[0],
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingSubscription.id)

        if (updateError) {
          console.error('Error updating subscription:', updateError)
        }
      } else {
        // Create new subscription
        const { error: insertError } = await supabase
          .from('subscriptions')
          .insert({
            user_id: userId,
            subscription_type: subscriptionType,
            status: 'active',
            amount_paid: parseFloat(payuResponse.amount || '0'),
            start_date: startDate.toISOString().split('T')[0],
            end_date: endDate.toISOString().split('T')[0],
            renewal_date: endDate.toISOString().split('T')[0],
            payment_status: 'paid',
            payment_method: 'payu',
            transaction_id: payuResponse.mihpayid || payuResponse.txnid,
            notes: `PayU Payment successful. Bank Ref: ${payuResponse.bank_ref_num || 'N/A'}, Mode: ${payuResponse.mode || 'N/A'}`,
          })

        if (insertError) {
          console.error('Error creating subscription:', insertError)
        }
      }

      // Update profile subscription status
      await supabase
        .from('profiles')
        .update({ subscription_status: 'active' })
        .eq('id', userId)

      // Redirect to success page
      return new Response(null, {
        status: 302,
        headers: {
          'Location': `${Deno.env.get('SITE_URL') || 'https://inventory.retailmarketingpro.in'}/payment-success?txnid=${payuResponse.txnid}&amount=${payuResponse.amount}`,
        },
      })
    } else {
      // Payment failed - update subscription if exists
      if (userId) {
        await supabase
          .from('subscriptions')
          .update({
            status: 'pending',
            payment_status: 'failed',
            notes: `PayU Payment failed. Error: ${payuResponse.error_Message || payuResponse.error || 'Unknown error'}`,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId)
          .eq('status', 'pending')
          .eq('transaction_id', payuResponse.txnid)
      }

      // Redirect to failure page
      return new Response(null, {
        status: 302,
        headers: {
          'Location': `${Deno.env.get('SITE_URL') || 'https://inventory.retailmarketingpro.in'}/payment-failure?error=${encodeURIComponent(payuResponse.error_Message || payuResponse.error || 'Payment failed')}&txnid=${payuResponse.txnid}`,
        },
      })
    }
  } catch (error) {
    console.error('Error processing PayU response:', error)
    return new Response(null, {
      status: 302,
      headers: {
        'Location': `${Deno.env.get('SITE_URL') || 'https://inventory.retailmarketingpro.in'}/payment-failure?error=processing_error`,
      },
    })
  }
})
