// supabase/functions/stripe-webhook/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from 'https://esm.sh/stripe@12.0.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') as string, {
  apiVersion: '2022-11-15',
})

// Clé secrète spécifique au Webhook (on la configurera après)
const endpointSecret = Deno.env.get('STRIPE_WEBHOOK_SIGNING_SECRET')

serve(async (req) => {
  const signature = req.headers.get('stripe-signature')

  try {
    if (!signature || !endpointSecret) {
      throw new Error("Missing signature or secret")
    }

    // 1. Lire le corps de la requête (ce que Stripe envoie)
    const body = await req.text()
    
    // 2. VÉRIFICATION DE SÉCURITÉ (Crucial !)
    // On vérifie que c'est bien Stripe qui nous parle et pas un hacker
    let event
    try {
      event = stripe.webhooks.constructEvent(body, signature, endpointSecret)
    } catch (err) {
      console.error(`Webhook signature verification failed: ${err.message}`)
      return new Response(err.message, { status: 400 })
    }

    // 3. On réagit seulement si le paiement est RÉUSSI
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      const userId = session.metadata.user_id // On récupère l'ID qu'on avait caché
      
      console.log(`💰 Paiement reçu pour l'utilisateur: ${userId}`)

      // 4. Connexion ADMIN à Supabase (Service Role)
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )

      // 5. VALIDATION DES PIXELS
      // On prend tous les pixels 'pending' de cet utilisateur et on les passe en 'paid'
      const { error } = await supabaseAdmin
        .from('pixels')
        .update({ status: 'paid' })
        .eq('owner_id', userId)
        .eq('status', 'pending')

      if (error) {
        console.error('Erreur Update DB:', error)
        return new Response('Error updating database', { status: 500 })
      }
      
      console.log('✅ Pixels validés avec succès !')
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error(err)
    return new Response(err.message, { status: 400 })
  }
})