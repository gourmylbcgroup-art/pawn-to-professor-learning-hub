import { createClient } from '@supabase/supabase-js';
import { enforceRateLimit } from '../_lib/rate-limit.js';
import { sendEmail } from '../_lib/email.js';
import {
  json, getAuthenticatedProfile, getSecuritySettings, activeProfile,
  hashValue, codeHash, generateSixDigitCode, requestIpHash, maskEmail
} from '../_lib/security.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) return json(res, 500, { error: 'Server configuration is incomplete.' });

  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const auth = await getAuthenticatedProfile(admin, req);
  if (auth.error) return json(res, 401, { error: auth.error });
  if (!activeProfile(auth.profile)) return json(res, 403, { error: 'This account is inactive or expired.' });
  if (['admin','owner'].includes(auth.profile.role)) return json(res, 200, { allowed: true, exempt: true });

  const settings = await getSecuritySettings(admin);
  if (!settings.member_device_security_enabled) return json(res, 200, { allowed: true, securityDisabled: true });

  const deviceId = String(req.body?.deviceId || '').trim();
  const deviceLabel = String(req.body?.deviceLabel || 'Browser').trim().slice(0, 180);
  const resend = Boolean(req.body?.resend);
  if (deviceId.length < 16 || deviceId.length > 200) return json(res, 400, { error: 'Device identifier is invalid.' });
  if (!auth.sessionId) return json(res, 401, { error: 'Session identifier is missing.' });

  const rate = await enforceRateLimit({ admin, req, res, scope: 'device-check', userId: auth.profile.id, windowSeconds: 600, maxHits: 12 });
  if (!rate.allowed) return json(res, 429, { error: 'Too many verification requests. Please wait and try again.' });

  const deviceHash = hashValue(deviceId);
  const ipHash = requestIpHash(req);
  const { data: security } = await admin.from('member_security').select('*').eq('user_id', auth.profile.id).maybeSingle();
  const trusted = security?.trusted_device_hash === deviceHash
    && security?.trusted_until
    && new Date(security.trusted_until) > new Date();

  if (trusted) {
    await admin.from('member_security').upsert({
      user_id: auth.profile.id,
      trusted_device_hash: deviceHash,
      trusted_device_label: deviceLabel,
      trusted_until: security.trusted_until,
      current_session_id: auth.sessionId,
      verified_at: security.verified_at || new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      last_ip_hash: ipHash
    }, { onConflict: 'user_id' });
    return json(res, 200, { allowed: true, trusted: true });
  }

  const email = String(auth.profile.contact_email || '').trim();
  if (!email || !email.includes('@')) return json(res, 409, { error: 'This member has no valid contact email. Ask an administrator to add one.' });

  if (!resend) {
    const { data: existing } = await admin.from('device_verification_challenges')
      .select('id,expires_at,sent_at')
      .eq('user_id', auth.profile.id)
      .eq('device_hash', deviceHash)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) {
      return json(res, 200, { allowed: false, challengeRequired: true, challengeId: existing.id, maskedEmail: maskEmail(email), expiresAt: existing.expires_at });
    }
  }

  const code = generateSixDigitCode();
  const signingSecret = process.env.DEVICE_CODE_SECRET || secret;
  const expiresAt = new Date(Date.now() + settings.device_code_minutes * 60 * 1000).toISOString();
  await admin.from('device_verification_challenges').delete().eq('user_id', auth.profile.id).is('used_at', null);
  const { data: challenge, error: challengeError } = await admin.from('device_verification_challenges').insert({
    user_id: auth.profile.id,
    device_hash: deviceHash,
    device_label: deviceLabel,
    session_id: auth.sessionId,
    code_hash: codeHash(code, signingSecret),
    expires_at: expiresAt
  }).select('id,expires_at').single();
  if (challengeError) return json(res, 500, { error: 'Could not create a verification challenge.' });

  try {
    const portal = process.env.PORTAL_BASE_URL || 'https://learn.pawntoprofessor.com';
    await sendEmail({
      to: email,
      subject: 'Pawn to Professor — New device verification',
      text: `Your Pawn to Professor verification code is ${code}. It expires in ${settings.device_code_minutes} minutes. If this was not you, do not approve the login. Portal: ${portal}`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.55"><h2>Pawn to Professor</h2><p>A login was requested from a new browser/device.</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>This code expires in ${settings.device_code_minutes} minutes.</p><p>If this was not you, do not approve the login.</p><p><a href="${portal}">Open Learning Hub</a></p></div>`
    });
  } catch (err) {
    await admin.from('device_verification_challenges').delete().eq('id', challenge.id);
    return json(res, 503, { error: err.message || 'Verification email could not be sent.' });
  }

  return json(res, 200, { allowed: false, challengeRequired: true, challengeId: challenge.id, maskedEmail: maskEmail(email), expiresAt: challenge.expires_at });
}
