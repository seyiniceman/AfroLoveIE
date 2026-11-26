// Supabase Edge Function: delivers queued notification_events via Expo Push API.
// Deploy with: supabase functions deploy send-push
// Invoke periodically (pg_cron / scheduled webhook) with Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

Deno.serve(async (req) => {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) {
    return new Response(JSON.stringify({ error: 'Missing Supabase environment variables.' }), { status: 500 });
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: rows, error } = await client.rpc('pending_push_notifications');
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  if (!rows?.length) {
    return new Response(JSON.stringify({ sent: 0 }), { headers: { 'content-type': 'application/json' } });
  }

  const messages = rows.map((row: { push_token: string; title: string; body: string; kind: string; data: Record<string, unknown> }) => ({
    to: row.push_token,
    sound: 'default',
    title: row.title,
    body: row.body,
    data: { ...row.data, kind: row.kind },
  }));

  const pushRes = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(messages),
  });
  if (!pushRes.ok) {
    return new Response(JSON.stringify({ error: await pushRes.text() }), { status: 502 });
  }

  const ids = rows.map((r: { id: number }) => r.id);
  const marked = await client.rpc('mark_push_sent', { ids });
  if (marked.error) {
    return new Response(JSON.stringify({ error: marked.error.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ sent: ids.length }), { headers: { 'content-type': 'application/json' } });
});
