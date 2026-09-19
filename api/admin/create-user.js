import { createClient } from '@supabase/supabase-js';

function cleanUsername(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return res.status(500).json({ error: 'Server Supabase secrets are not configured.' });

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Missing login token.' });

  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData?.user) return res.status(401).json({ error: 'Invalid session.' });

  const { data: caller, error: callerError } = await admin
    .from('profiles')
    .select('role,status,expires_at')
    .eq('id', authData.user.id)
    .single();

  const expired = caller?.expires_at && new Date(caller.expires_at) <= new Date();
  if (callerError || caller?.role !== 'admin' || caller?.status !== 'active' || expired) {
    return res.status(403).json({ error: 'Administrator access required.' });
  }

  const username = cleanUsername(req.body?.username);
  const password = String(req.body?.password || '');
  const displayName = String(req.body?.displayName || username).trim();
  if (username.length < 3) return res.status(400).json({ error: 'Username must contain at least 3 valid characters.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must contain at least 8 characters.' });

  const email = `${username}@portal.local`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username, display_name: displayName }
  });
  if (error) return res.status(400).json({ error: error.message });

  // Trigger normally creates this row; upsert makes the endpoint resilient if the trigger is delayed.
  await admin.from('profiles').upsert({
    id: data.user.id,
    username,
    display_name: displayName,
    role: 'user',
    status: 'active'
  }, { onConflict: 'id' });

  return res.status(200).json({ id: data.user.id, username, displayName });
}
