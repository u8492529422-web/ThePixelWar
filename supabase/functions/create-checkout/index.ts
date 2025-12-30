import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from 'https://esm.sh/stripe@12.0.0?target=deno'

// On récupère la clé secrète depuis les paramètres Supabase
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') as string, {
  apiVersion: '2022-11-15',
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // 1. Gérer le CORS (pour autoriser ton site à parler à cette fonction)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 2. Lire les données envoyées par ton site (App.jsx)
    const { count, user_email, user_id } = await req.json()

    // 3. LOGIQUE DE PRIX (Doit être la même que sur ton site)
    // Stripe compte en centimes (100 = 1.00$)
    let unitPrice = 100; // 1.00$ par défaut
    
    if (count >= 10) unitPrice = 70;      // 0.70$
    else if (count >= 5) unitPrice = 85;  // 0.85$

    console.log(`Création paiement pour ${count} pixels à ${unitPrice} cents (User: ${user_email})`);

    // 4. Créer la session Stripe
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Pixel Blocks',
              description: `Pack of ${count} blocks on The Pixel War`,
            },
            unit_amount: unitPrice, 
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

    // 5. Renvoyer l'URL vers le site
    return new Response(
      JSON.stringify({ url: session.url }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error("Erreur Stripe:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})