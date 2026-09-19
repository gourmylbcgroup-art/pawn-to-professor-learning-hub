import { createClient } from '@supabase/supabase-js';

function cleanUsername(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return res.status(500).json({ error: 'Server configuration is incomplete.' });

  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: settings, error: settingsError } = await admin
    .from('portal_settings')
    .select('registration_enabled')
    .eq('id', 1)
    .single();

  if (settingsError) return res.status(500).json({ error: 'Registration settings are not installed yet.' });
  if (!settings?.registration_enabled) return res.status(403).json({ error: 'Registration is currently closed.' });

  const username = cleanUsername(req.body?.username);
  const displayName = String(req.body?.displayName || '').trim();
  const contactEmail = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (username.length < 3) return res.status(400).json({ error: 'Username must contain at least 3 valid characters.' });
  if (!displayName) return res.status(400).json({ error: 'Please add your full name.' });
  if (!validEmail(contactEmail)) return res.status(400).json({ error: 'Please use a valid email address.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must contain at least 8 characters.' });

  const { data: existing } = await admin
    .from('profiles')
    .select('id,username,contact_email')
    .or(`username.eq.${username},contact_email.eq.${contactEmail}`)
    .limit(1);

  if (existing?.length) return res.status(409).json({ error: 'That username or email is already registered.' });

  const authEmail = `${username}@portal.local`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: authEmail,
    password,
    email_confirm: true,
    user_metadata: { username, display_name: displayName }
  });

  if (createError) return res.status(400).json({ error: createError.message });

  const { error: profileError } = await admin.from('profiles').upsert({
    id: created.user.id,
    username,
    display_name: displayName,
    contact_email: contactEmail,
    role: 'user',
    status: 'pending'
  }, { onConflict: 'id' });

  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return res.status(400).json({ error: profileError.message });
  }

  return res.status(200).json({ ok: true, username, status: 'pending' });
}
