import { createClient } from '@supabase/supabase-js';
import { json, getAuthenticatedProfile, activeProfile } from '../_lib/security.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) return json(res, 500, { error: 'Server configuration is incomplete.' });
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const auth = await getAuthenticatedProfile(admin, req);
  if (auth.error) return json(res, 401, { error: auth.error });
  if (!activeProfile(auth.profile) || !['admin','owner'].includes(auth.profile.role)) return json(res, 403, { error: 'Administrator or owner access required.' });
  const userId = String(req.body?.userId || '').trim();
  if (!userId) return json(res, 400, { error: 'Missing user.' });
  const { data: target } = await admin.from('profiles').select('id,username,role').eq('id', userId).maybeSingle();
  if (!target) return json(res, 404, { error: 'User not found.' });
  if (['admin','owner'].includes(target.role)) return json(res, 400, { error: 'Admin/Owner accounts are exempt from member device security.' });
  await admin.from('member_security').delete().eq('user_id', userId);
  await admin.from('device_verification_challenges').delete().eq('user_id', userId);
  await admin.from('audit_log').insert({ actor_id: auth.profile.id, action: 'trusted_device_reset', entity_type: 'profile', entity_id: userId, details: { username: target.username } });
  return json(res, 200, { ok: true });
}
