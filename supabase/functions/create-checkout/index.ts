import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from 'https://esm.sh/stripe@14.10.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') as string, {
  apiVersion: '2023-10-16',
})

const endpointSecret = Deno.env.get('STRIPE_WEBHOOK_SIGNING_SECRET')

serve(async (req) => {
  // 1. Gérer le CORS (Indispensable pour Supabase)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { 
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
      } 
    })
  }

  // 2. Sécurité : On n'accepte QUE le POST (Stripe envoie toujours du POST)
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const signature = req.headers.get('stripe-signature')
    if (!signature) {
      return new Response('No signature', { status: 400 })
    }

    const body = await req.text()
    let event

    
    try {
      // Vérification que le message vient bien de Stripe
      event = stripe.webhooks.constructEvent(body, signature, endpointSecret!)
    } catch (err) {
      console.error(`❌ Erreur Signature: ${err.message}`)
      return new Response(`Webhook Error: ${err.message}`, { status: 400 })
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      const userId = session.metadata?.user_id

      console.log(`💰 Validation pixels pour l'user: ${userId}`)

      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )

      const { error } = await supabaseAdmin
        .from('pixels')
        .update({ status: 'paid' })
        .eq('owner_id', userId)
        .eq('status', 'pending')

      if (error) throw error
      console.log('✅ Succès !')
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 })
  } catch (err) {
    console.error('🔥 Erreur critique:', err.message)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})