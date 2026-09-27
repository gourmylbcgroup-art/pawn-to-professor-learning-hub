import { createClient } from '@supabase/supabase-js';
import { enforceRateLimit } from './_lib/rate-limit.js';

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

  const rate = await enforceRateLimit({ admin, req, res, scope: 'register', windowSeconds: 600, maxHits: 5 });
  if (!rate.allowed) return res.status(429).json({ error: 'Too many registration attempts. Please wait a few minutes and try again.' });

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
  const memberType = String(req.body?.memberType || '').trim().toLowerCase();
  const adultConfirmed = req.body?.adultConfirmed === true;
  const guardianName = String(req.body?.guardianName || '').trim();
  const guardianEmail = String(req.body?.guardianEmail || '').trim().toLowerCase();
  const guardianConsent = req.body?.guardianConsent === true;
  const termsAccepted = req.body?.termsAccepted === true;

  if (username.length < 3) return res.status(400).json({ error: 'Username must contain at least 3 valid characters.' });
  if (!displayName) return res.status(400).json({ error: 'Please add your full name.' });
  if (!validEmail(contactEmail)) return res.status(400).json({ error: 'Please use a valid email address.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must contain at least 8 characters.' });
  if (!['teacher','learner'].includes(memberType)) return res.status(400).json({ error: 'Please choose Teacher or Learner.' });
  if (!termsAccepted) return res.status(400).json({ error: 'You must accept the Terms of Use and Privacy Policy.' });

  if (memberType === 'teacher' && !adultConfirmed) {
    return res.status(400).json({ error: 'Teacher accounts require confirmation that the registrant is 18 or older.' });
  }

  if (memberType === 'learner' && !adultConfirmed) {
    if (!guardianName) return res.status(400).json({ error: 'A parent or guardian name is required for learners under 18.' });
    if (!validEmail(guardianEmail)) return res.status(400).json({ error: 'Please use a valid parent or guardian email address.' });
    if (!guardianConsent) return res.status(400).json({ error: 'Parent or guardian permission is required for learners under 18.' });
  }

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
    user_metadata: { username, display_name: displayName, member_type: memberType }
  });

  if (createError) return res.status(400).json({ error: createError.message });

  const nowIso = new Date().toISOString();
  const { error: profileError } = await admin.from('profiles').upsert({
    id: created.user.id,
    username,
    display_name: displayName,
    contact_email: contactEmail,
    role: 'user',
    status: 'pending',
    member_type: memberType,
    adult_confirmed: adultConfirmed,
    guardian_name: adultConfirmed ? null : guardianName,
    guardian_email: adultConfirmed ? null : guardianEmail,
    guardian_consent_at: adultConfirmed ? null : nowIso,
    terms_accepted_at: nowIso,
    registration_source: 'public',
    approved_at: null,
    trial_started_at: null,
    trial_ends_at: null
  }, { onConflict: 'id' });

  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return res.status(400).json({ error: profileError.message });
  }

  return res.status(200).json({ ok: true, username, status: 'pending', memberType });
}
