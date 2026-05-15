/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { purchase, platform, userId } = await req.json()
    
    if (!purchase || !platform || !userId) {
      return new Response(JSON.stringify({ error: 'Missing parameters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    let isValid = false;
    let expiryDate = new Date();
    let planType = 'annual';
    let amount = 6000; // Default yearly INR price

    // Verification Logic (MOCK for now, as it requires real Store API keys)
    // In production, use libraries like node-google-play and apple-iap-verify
    // or call the store endpoints directly.
    
    if (platform === 'ios') {
      // Validate with Apple Verify Receipt endpoint
      // https://buy.itunes.apple.com/verifyReceipt (production)
      // https://sandbox.itunes.apple.com/verifyReceipt (sandbox)
      console.log('Verifying Apple Receipt:', purchase.transactionReceipt);
      
      // MOCK VALIDATION: Assuming valid if receipt is present
      isValid = !!purchase.transactionReceipt;
      
      // In a real implementation, you'd parse more info here
      expiryDate.setFullYear(expiryDate.getFullYear() + 1); // Mock 1 year duration
    } else if (platform === 'android') {
      // Validate with Google Play Developer API
      // GET https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{packageName}/purchases/subscriptions/{subscriptionId}/tokens/{token}
      console.log('Verifying Google Play Token:', purchase.purchaseToken);
      
      // MOCK VALIDATION: Assuming valid if token is present
      isValid = !!purchase.purchaseToken;
      
      expiryDate.setFullYear(expiryDate.getFullYear() + 1); // Mock 1 year duration
    }

    if (!isValid) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid receipt' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Determine if it's a trial based on purchase info (if available)
    // For now, since the user wants 11 months free trial handled by store:
    // If it's a new subscription with price 0, it's a trial.
    // In reality, the store receipt will indicate 'is_trial_period'.

    const isTrial = false; // Mock - we assume the store handled the intro offer

    // Update Subscriptions table
    const { data: subData, error: subError } = await supabase
      .from('subscriptions')
      .insert({
        user_id: userId,
        subscription_type: isTrial ? 'trial' : 'annual',
        status: 'active',
        amount_paid: isTrial ? 0 : amount,
        start_date: new Date().toISOString().split('T')[0],
        end_date: expiryDate.toISOString().split('T')[0],
        payment_status: 'paid',
        payment_method: platform,
        transaction_id: purchase.transactionId || purchase.purchaseToken,
        notes: `Verified via ${platform} IAP`
      })
      .select('id')
      .single()

    if (subError) throw subError;

    // Update Profile status
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        subscription_id: subData.id,
        subscription_status: 'active'
      })
      .eq('id', userId)

    if (profileError) throw profileError;

    return new Response(JSON.stringify({ 
      success: true, 
      expiryDate: expiryDate.toISOString(), 
      planType: isTrial ? 'trial' : 'annual' 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
