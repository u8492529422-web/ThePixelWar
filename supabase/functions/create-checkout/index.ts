import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from 'https://esm.sh/stripe@14.10.0?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') as string, {
  apiVersion: '2023-10-16',
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Gérer le CORS (pour que ton site ait le droit de parler à la fonction)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { count, user_email, user_id } = await req.json()

    // --- LOGIQUE DE PRIX MISE À JOUR ---
    // Prix en centimes (100 = 1.00$)
    let unitPrice = 100; // 1.00$ par défaut
    
    if (count >= 10) {
        unitPrice = 80; // 0.80$ (-20%)
    } else if (count >= 5) {
        unitPrice = 90; // 0.90$ (-10%)
    }

    // Création de la session Stripe
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Pixel Pack (${count} blocks)`,
              description: 'The Pixel War blocks',
            },
            unit_amount: unitPrice, // Le prix calculé juste au-dessus
          },
          quantity: count,
        },
      ],
      mode: 'payment',
      success_url: `${req.headers.get('origin')}/?success=true`,
      cancel_url: `${req.headers.get('origin')}/?canceled=true`,
      customer_email: user_email,
      metadata: {
        user_id: user_id,
        pixel_count: count
      },
    })

    return new Response(JSON.stringify({ url: session.url }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
  }
})