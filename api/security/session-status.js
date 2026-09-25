import { createClient } from '@supabase/supabase-js';
import { enforceRateLimit } from '../_lib/rate-limit.js';
import { json, getAuthenticatedProfile, assertCurrentMemberDevice, requestIpHash } from '../_lib/security.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) return json(res, 500, { error: 'Server configuration is incomplete.' });
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const auth = await getAuthenticatedProfile(admin, req);
  if (auth.error) return json(res, 401, { error: auth.error });
  const rate = await enforceRateLimit({ admin, req, res, scope: 'session-status', userId: auth.profile.id, windowSeconds: 60, maxHits: 150 });
  if (!rate.allowed) return json(res, 429, { error: 'Too many session checks.' });
  const deviceId = String(req.body?.deviceId || '').trim();
  const check = await assertCurrentMemberDevice({ admin, profile: auth.profile, sessionId: auth.sessionId, deviceId });
  if (!check.ok) return json(res, 409, { current: false, error: check.reason });
  if (!check.exempt && !check.disabled) {
    await admin.from('member_security').update({ last_seen_at: new Date().toISOString(), last_ip_hash: requestIpHash(req) }).eq('user_id', auth.profile.id);
  }
  return json(res, 200, { current: true, exempt: Boolean(check.exempt) });
}
