import { createClient } from '@supabase/supabase-js';
import { enforceRateLimit } from '../_lib/rate-limit.js';
import { json, getAuthenticatedProfile, getSecuritySettings, activeProfile, hashValue, codeHash, requestIpHash } from '../_lib/security.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) return json(res, 500, { error: 'Server configuration is incomplete.' });
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const auth = await getAuthenticatedProfile(admin, req);
  if (auth.error) return json(res, 401, { error: auth.error });
  if (!activeProfile(auth.profile)) return json(res, 403, { error: 'This account is inactive or expired.' });
  if (['admin','owner'].includes(auth.profile.role)) return json(res, 200, { ok: true, exempt: true });

  const rate = await enforceRateLimit({ admin, req, res, scope: 'device-verify', userId: auth.profile.id, windowSeconds: 600, maxHits: 12 });
  if (!rate.allowed) return json(res, 429, { error: 'Too many verification attempts. Please wait and try again.' });

  const challengeId = String(req.body?.challengeId || '').trim();
  const deviceId = String(req.body?.deviceId || '').trim();
  const deviceLabel = String(req.body?.deviceLabel || 'Browser').trim().slice(0, 180);
  const code = String(req.body?.code || '').trim();
  if (!challengeId || deviceId.length < 16 || !/^\d{6}$/.test(code)) return json(res, 400, { error: 'Enter the 6-digit verification code.' });

  const { data: challenge } = await admin.from('device_verification_challenges').select('*').eq('id', challengeId).eq('user_id', auth.profile.id).maybeSingle();
  if (!challenge || challenge.used_at) return json(res, 403, { error: 'This verification request is no longer valid.' });
  if (new Date(challenge.expires_at) <= new Date()) return json(res, 403, { error: 'The verification code has expired. Request a new code.' });
  if (challenge.device_hash !== hashValue(deviceId)) return json(res, 403, { error: 'The verification request belongs to a different device.' });
  if (challenge.session_id && String(challenge.session_id) !== String(auth.sessionId)) return json(res, 403, { error: 'The login session changed. Please sign in again.' });
  if (Number(challenge.attempts || 0) >= 6) return json(res, 429, { error: 'Too many incorrect codes. Request a new code.' });

  const signingSecret = process.env.DEVICE_CODE_SECRET || secret;
  if (challenge.code_hash !== codeHash(code, signingSecret)) {
    await admin.from('device_verification_challenges').update({ attempts: Number(challenge.attempts || 0) + 1 }).eq('id', challenge.id);
    return json(res, 403, { error: 'The verification code is not correct.' });
  }

  const settings = await getSecuritySettings(admin);
  const trustedUntil = new Date(Date.now() + settings.trusted_device_days * 86400000).toISOString();
  const now = new Date().toISOString();
  const { error: securityError } = await admin.from('member_security').upsert({
    user_id: auth.profile.id,
    trusted_device_hash: hashValue(deviceId),
    trusted_device_label: deviceLabel,
    trusted_until: trustedUntil,
    current_session_id: auth.sessionId,
    verified_at: now,
    last_seen_at: now,
    last_ip_hash: requestIpHash(req)
  }, { onConflict: 'user_id' });
  if (securityError) return json(res, 500, { error: 'Could not save the trusted device.' });

  await admin.from('device_verification_challenges').update({ used_at: now }).eq('id', challenge.id);
  await admin.from('device_verification_challenges').delete().eq('user_id', auth.profile.id).neq('id', challenge.id);
  await admin.from('audit_log').insert({ actor_id: auth.profile.id, action: 'member_device_verified', entity_type: 'profile', entity_id: auth.profile.id, details: { device_label: deviceLabel } });

  return json(res, 200, { ok: true, trustedUntil });
}
