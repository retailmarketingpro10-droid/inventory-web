import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts"

// PayU Configuration - These should be set in Supabase Edge Function secrets
const PAYU_MERCHANT_KEY = Deno.env.get('PAYU_MERCHANT_KEY') || ''
const PAYU_MERCHANT_SALT = Deno.env.get('PAYU_MERCHANT_SALT') || ''

interface PayUHashRequest {
  txnid: string
  amount: string
  productinfo: string
  firstname: string
  email: string
  phone?: string
  udf1?: string // user_id
  udf2?: string // subscription_type
  udf3?: string
  udf4?: string
  udf5?: string
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
    // Verify authorization
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { 
          status: 401,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      )
    }

    // Verify the JWT token
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Get user from JWT
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { 
          status: 401,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      )
    }

    const body: PayUHashRequest = await req.json()

    // Validate required fields
    if (!body.txnid || !body.amount || !body.productinfo || !body.firstname || !body.email) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: txnid, amount, productinfo, firstname, email' }),
        { 
          status: 400,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      )
    }

    // PayU hash formula: sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||salt)
    const hashString = `${PAYU_MERCHANT_KEY}|${body.txnid}|${body.amount}|${body.productinfo}|${body.firstname}|${body.email}|${body.udf1 || ''}|${body.udf2 || ''}|${body.udf3 || ''}|${body.udf4 || ''}|${body.udf5 || ''}||||||${PAYU_MERCHANT_SALT}`
    
    console.log('Hash string (masked):', hashString.replace(PAYU_MERCHANT_SALT, '****'))

    const hash = await sha512(hashString)

    // Return the hash and merchant key (key is needed for the form submission)
    return new Response(
      JSON.stringify({ 
        hash,
        key: PAYU_MERCHANT_KEY,
        txnid: body.txnid
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
    console.error('Error generating PayU hash:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to generate payment hash' }),
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
