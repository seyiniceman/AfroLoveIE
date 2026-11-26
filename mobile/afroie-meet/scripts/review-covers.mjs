import { createClient } from '@supabase/supabase-js';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

// Run on a trusted workstation. Never place this key in an EXPO_PUBLIC variable.
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for the reviewer session.');
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await client.from('cover_reviews').select('object_path').eq('status', 'pending').limit(20);
if (error) throw error;
const input = createInterface({ input: stdin, output: stdout });
try {
  for (const { object_path: path } of data) {
    const media = await client.storage.from('member-photos').createSignedUrl(path, 120);
    if (media.error) throw media.error;
    console.log('Open this private link to inspect the cover (expires in two minutes):', media.data.signedUrl);
    const decision = (await input.question('Is a face clearly visible? [approve/reject/skip] ')).trim();
    if (!['approve', 'reject'].includes(decision)) continue;
    const outcome = await client.from('cover_reviews').update({ status: decision === 'approve' ? 'approved' : 'rejected' })
      .eq('object_path', path).eq('status', 'pending').select('status').maybeSingle();
    if (outcome.error) throw outcome.error;
    console.log(outcome.data?.status ?? 'Another reviewer already handled this photo.');
  }
  if (!data.length) console.log('No cover photos are waiting for review.');
} finally { input.close(); }

