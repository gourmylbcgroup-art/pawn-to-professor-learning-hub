import { createClient } from '@supabase/supabase-js';

function cleanUsername(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
}

function validEmail(value) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
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
  if (callerError || !['admin','owner'].includes(caller?.role) || caller?.status !== 'active' || expired) {
    return res.status(403).json({ error: 'Administrator or owner access required.' });
  }

  const username = cleanUsername(req.body?.username);
  const password = String(req.body?.password || '');
  const displayName = String(req.body?.displayName || username).trim();
  const contactEmail = String(req.body?.contactEmail || '').trim().toLowerCase() || null;

  if (username.length < 3) return res.status(400).json({ error: 'Username must contain at least 3 valid characters.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must contain at least 8 characters.' });
  if (!validEmail(contactEmail)) return res.status(400).json({ error: 'Contact email is not valid.' });

  const email = `${username}@portal.local`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username, display_name: displayName }
  });
  if (error) return res.status(400).json({ error: error.message });

  const { error: profileError } = await admin.from('profiles').upsert({
    id: data.user.id,
    username,
    display_name: displayName,
    contact_email: contactEmail,
    role: 'user',
    status: 'active'
  }, { onConflict: 'id' });

  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    return res.status(400).json({ error: profileError.message });
  }

  return res.status(200).json({ id: data.user.id, username, displayName });
}
