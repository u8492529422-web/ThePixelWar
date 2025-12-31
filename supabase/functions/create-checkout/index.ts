import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from 'https://esm.sh/stripe@14.10.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') as string, { apiVersion: '2023-10-16' })
const endpointSecret = Deno.env.get('STRIPE_WEBHOOK_SIGNING_SECRET')

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } })

  try {
    const signature = req.headers.get('stripe-signature')
    const body = await req.text()
    const event = stripe.webhooks.constructEvent(body, signature!, endpointSecret!)

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      const userId = session.metadata?.user_id || session.client_reference_id

      console.log(`🔎 Tentative de validation pour l'utilisateur : ${userId}`)

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
      console.log(`✅ Succès : Pixels mis à jour pour ${userId}`)
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 })
  } catch (err) {
    console.error(`🔥 Erreur Webhook : ${err.message}`)
    return new Response(err.message, { status: 400 })
  }
})