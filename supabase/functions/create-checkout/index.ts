// DANS : supabase/functions/create-checkout/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from 'https://esm.sh/stripe@12.0.0?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') as string, {
  apiVersion: '2022-11-15',
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { count, user_email, user_id } = await req.json()

    // LOGIQUE DE PRIX
    let unitPrice = 100; // 1.00$
    
    if (count >= 10) unitPrice = 70;      // 0.70$ (-30%)
    else if (count >= 5) unitPrice = 85;  // 0.85$ (-15%)

    // On crée la session Stripe
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              // J'ai changé le nom ici pour le test
              name: `Selection of ${count} Pixels`, 
              description: 'The Pixel War blocks',
            },
            unit_amount: unitPrice, // Le prix D'UN SEUL pixel (ex: 85 cents)
          },
          quantity: count, // C'EST CETTE LIGNE QUI MANQUAIT OU NE MARCHAIT PAS
        },
      ],
      mode: 'payment',
      success_url: `${req.headers.get('origin')}/?success=true`,
      cancel_url: `${req.headers.get('origin')}/?canceled=true`,
      customer_email: user_email,
      metadata: { user_id, pixel_count: count },
    })

    return new Response(JSON.stringify({ url: session.url }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
  }
})