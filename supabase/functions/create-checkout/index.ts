// Checkout is DISABLED on purpose.
//
// The `stripe-webhook` function that was supposed to fulfil a paid order was
// never implemented — it is still the Supabase starter template. Nothing ever
// flipped a purchased block from `pending` to `paid`, so a completed payment
// delivered nothing. Rather than keep a checkout that can take money and give
// nothing back, the flow is turned off at the source.
//
// The original implementation is preserved in git history. To bring checkout
// back, restore it AND implement the webhook first.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  return new Response(
    JSON.stringify({
      error: 'Checkout is disabled. The Pixel War runs in demo mode: blocks can be placed and previewed, but nothing is for sale.',
      code: 'checkout_disabled',
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 503 },
  )
})
