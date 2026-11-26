// Supabase Edge Function: RevenueCat webhook handler syncing Premium entitlements to social.plus.
// Set REVENUECAT_WEBHOOK_SECRET in Supabase Function secrets and configure it as the Authorization header in RevenueCat.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ACTIVE_EVENTS = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE', 'NON_RENEWING_PURCHASE']);
const REVOKE_EVENTS = new Set(['EXPIRATION', 'BILLING_ISSUE', 'CANCELLATION']);

Deno.serve(async (req) => {
  const secret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET');
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey || !secret) {
    return new Response(JSON.stringify({ error: 'Server configuration incomplete.' }), { status: 500 });
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const payload = await req.json();
  const event = payload?.event;
  const userId: string | undefined = event?.app_user_id;
  const type: string | undefined = event?.type;
  const expiresMs: number | undefined = event?.expiration_at_ms;
  if (!userId || !type) {
    return new Response(JSON.stringify({ error: 'Invalid webhook payload.' }), { status: 400 });
  }

  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  if (ACTIVE_EVENTS.has(type)) {
    const expiresAt = expiresMs ? new Date(expiresMs).toISOString() : null;
    const { error } = await client.rpc('set_plus_entitlement', { target_user: userId, active: true, expires_at: expiresAt });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  } else if (REVOKE_EVENTS.has(type) && (!expiresMs || expiresMs <= Date.now())) {
    const { error } = await client.rpc('set_plus_entitlement', { target_user: userId, active: false, expires_at: null });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
});
