import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { enforceRateLimit } from './_lib/rate-limit.js';
import { emailConfigured, sendEmail } from './_lib/email.js';
import {
  json,
  getAuthenticatedProfile,
  getSecuritySettings,
  activeProfile,
  hashValue,
  codeHash,
  generateSixDigitCode,
  requestIpHash,
  maskEmail,
  assertCurrentMemberDevice
} from './_lib/security.js';

const genericResetMessage = 'If an eligible account matches, a password reset email has been sent.';

function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function actionFromRequest(req) {
  const explicit = String(req.query?.action || req.body?.action || '').trim();
  if (explicit) return explicit;
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    return String(url.searchParams.get('action') || '').trim();
  } catch {
    return '';
  }
}

async function checkDevice({ req, res, admin, secret }) {
  const auth = await getAuthenticatedProfile(admin, req);
  if (auth.error) return json(res, 401, { error: auth.error });
  if (!activeProfile(auth.profile)) return json(res, 403, { error: 'This account is inactive or expired.' });
  if (['admin', 'owner'].includes(auth.profile.role)) return json(res, 200, { allowed: true, exempt: true });

  const settings = await getSecuritySettings(admin);
  if (!settings.member_device_security_enabled) return json(res, 200, { allowed: true, securityDisabled: true });

  const deviceId = String(req.body?.deviceId || '').trim();
  const deviceLabel = String(req.body?.deviceLabel || 'Browser').trim().slice(0, 180);
  const resend = Boolean(req.body?.resend);
  if (deviceId.length < 16 || deviceId.length > 200) return json(res, 400, { error: 'Device identifier is invalid.' });
  if (!auth.sessionId) return json(res, 401, { error: 'Session identifier is missing.' });

  const rate = await enforceRateLimit({
    admin, req, res, scope: 'device-check', userId: auth.profile.id,
    windowSeconds: 600, maxHits: 12
  });
  if (!rate.allowed) return json(res, 429, { error: 'Too many verification requests. Please wait and try again.' });

  const deviceHash = hashValue(deviceId);
  const ipHash = requestIpHash(req);
  const { data: security } = await admin
    .from('member_security')
    .select('*')
    .eq('user_id', auth.profile.id)
    .maybeSingle();

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
  if (!email || !email.includes('@')) {
    return json(res, 409, { error: 'This member has no valid contact email. Ask an administrator to add one.' });
  }

  if (!resend) {
    const { data: existing } = await admin
      .from('device_verification_challenges')
      .select('id,expires_at,sent_at')
      .eq('user_id', auth.profile.id)
      .eq('device_hash', deviceHash)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      return json(res, 200, {
        allowed: false,
        challengeRequired: true,
        challengeId: existing.id,
        maskedEmail: maskEmail(email),
        expiresAt: existing.expires_at
      });
    }
  }

  const code = generateSixDigitCode();
  const signingSecret = process.env.DEVICE_CODE_SECRET || secret;
  const expiresAt = new Date(Date.now() + settings.device_code_minutes * 60 * 1000).toISOString();

  await admin.from('device_verification_challenges')
    .delete()
    .eq('user_id', auth.profile.id)
    .is('used_at', null);

  const { data: challenge, error: challengeError } = await admin
    .from('device_verification_challenges')
    .insert({
      user_id: auth.profile.id,
      device_hash: deviceHash,
      device_label: deviceLabel,
      session_id: auth.sessionId,
      code_hash: codeHash(code, signingSecret),
      expires_at: expiresAt
    })
    .select('id,expires_at')
    .single();

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

  return json(res, 200, {
    allowed: false,
    challengeRequired: true,
    challengeId: challenge.id,
    maskedEmail: maskEmail(email),
    expiresAt: challenge.expires_at
  });
}

async function verifyDevice({ req, res, admin, secret }) {
  const auth = await getAuthenticatedProfile(admin, req);
  if (auth.error) return json(res, 401, { error: auth.error });
  if (!activeProfile(auth.profile)) return json(res, 403, { error: 'This account is inactive or expired.' });
  if (['admin', 'owner'].includes(auth.profile.role)) return json(res, 200, { ok: true, exempt: true });

  const rate = await enforceRateLimit({
    admin, req, res, scope: 'device-verify', userId: auth.profile.id,
    windowSeconds: 600, maxHits: 12
  });
  if (!rate.allowed) return json(res, 429, { error: 'Too many verification attempts. Please wait and try again.' });

  const challengeId = String(req.body?.challengeId || '').trim();
  const deviceId = String(req.body?.deviceId || '').trim();
  const deviceLabel = String(req.body?.deviceLabel || 'Browser').trim().slice(0, 180);
  const code = String(req.body?.code || '').trim();

  if (!challengeId || deviceId.length < 16 || !/^\d{6}$/.test(code)) {
    return json(res, 400, { error: 'Enter the 6-digit verification code.' });
  }

  const { data: challenge } = await admin
    .from('device_verification_challenges')
    .select('*')
    .eq('id', challengeId)
    .eq('user_id', auth.profile.id)
    .maybeSingle();

  if (!challenge || challenge.used_at) return json(res, 403, { error: 'This verification request is no longer valid.' });
  if (new Date(challenge.expires_at) <= new Date()) return json(res, 403, { error: 'The verification code has expired. Request a new code.' });
  if (challenge.device_hash !== hashValue(deviceId)) return json(res, 403, { error: 'The verification request belongs to a different device.' });
  if (challenge.session_id && String(challenge.session_id) !== String(auth.sessionId)) return json(res, 403, { error: 'The login session changed. Please sign in again.' });
  if (Number(challenge.attempts || 0) >= 6) return json(res, 429, { error: 'Too many incorrect codes. Request a new code.' });

  const signingSecret = process.env.DEVICE_CODE_SECRET || secret;
  if (challenge.code_hash !== codeHash(code, signingSecret)) {
    await admin.from('device_verification_challenges')
      .update({ attempts: Number(challenge.attempts || 0) + 1 })
      .eq('id', challenge.id);
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
  await admin.from('audit_log').insert({
    actor_id: auth.profile.id,
    action: 'member_device_verified',
    entity_type: 'profile',
    entity_id: auth.profile.id,
    details: { device_label: deviceLabel }
  });

  return json(res, 200, { ok: true, trustedUntil });
}

async function sessionStatus({ req, res, admin }) {
  const auth = await getAuthenticatedProfile(admin, req);
  if (auth.error) return json(res, 401, { error: auth.error });

  const rate = await enforceRateLimit({
    admin, req, res, scope: 'session-status', userId: auth.profile.id,
    windowSeconds: 60, maxHits: 150
  });
  if (!rate.allowed) return json(res, 429, { error: 'Too many session checks.' });

  const deviceId = String(req.body?.deviceId || '').trim();
  const check = await assertCurrentMemberDevice({
    admin,
    profile: auth.profile,
    sessionId: auth.sessionId,
    deviceId
  });

  if (!check.ok) return json(res, 409, { current: false, error: check.reason });

  if (!check.exempt && !check.disabled) {
    await admin.from('member_security')
      .update({ last_seen_at: new Date().toISOString(), last_ip_hash: requestIpHash(req) })
      .eq('user_id', auth.profile.id);
  }

  return json(res, 200, { current: true, exempt: Boolean(check.exempt) });
}

async function requestPasswordReset({ req, res, admin }) {
  if (!emailConfigured()) return json(res, 503, { error: 'Password recovery email is not configured yet.' });

  const portalBase = String(process.env.PORTAL_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!portalBase || !/^https:\/\//i.test(portalBase)) {
    return json(res, 503, { error: 'PORTAL_BASE_URL must be configured with the live HTTPS Learning Hub URL.' });
  }

  const identifier = String(req.body?.identifier || '').trim().toLowerCase().slice(0, 254);
  if (identifier.length < 2) return json(res, 400, { error: 'Enter your username or registered email.' });

  const generalRate = await enforceRateLimit({
    admin, req, res, scope: 'password-reset-request', windowSeconds: 900, maxHits: 6
  });
  if (!generalRate.allowed) {
    return json(res, 429, { error: 'Too many password reset requests. Please wait and try again.' });
  }

  let query = admin
    .from('profiles')
    .select('id,username,display_name,contact_email,status,expires_at')
    .limit(1);

  query = identifier.includes('@')
    ? query.ilike('contact_email', identifier)
    : query.ilike('username', identifier);

  const { data: profile } = await query.maybeSingle();

  if (!profile || profile.status !== 'active' || !profile.contact_email) {
    return json(res, 200, { ok: true, message: genericResetMessage });
  }

  const expiredAccount = profile.expires_at && new Date(profile.expires_at) <= new Date();
  if (expiredAccount) return json(res, 200, { ok: true, message: genericResetMessage });

  const userRate = await enforceRateLimit({
    admin, req, res, scope: 'password-reset-user', userId: profile.id,
    windowSeconds: 900, maxHits: 3
  });
  if (!userRate.allowed) return json(res, 200, { ok: true, message: genericResetMessage });

  const token = crypto.randomBytes(32).toString('base64url');
  const hash = tokenHash(token);
  const expiresAt = new Date(Date.now() + 20 * 60 * 1000).toISOString();

  await admin.from('password_reset_challenges')
    .delete()
    .eq('user_id', profile.id)
    .is('used_at', null);

  const { data: challenge, error: challengeError } = await admin
    .from('password_reset_challenges')
    .insert({
      user_id: profile.id,
      token_hash: hash,
      expires_at: expiresAt,
      requested_ip_hash: requestIpHash(req)
    })
    .select('id')
    .single();

  if (challengeError) return json(res, 500, { error: 'Could not create a password reset request.' });

  const resetUrl = `${portalBase}/?reset_token=${encodeURIComponent(token)}`;
  const name = profile.display_name || profile.username || 'Teacher';
  const safeName = String(name).replace(/[<>&"]/g, '');

  try {
    await sendEmail({
      to: String(profile.contact_email),
      subject: 'Pawn to Professor — Reset your password',
      text:
        `Hello ${name},\n\n` +
        `Use this secure link to create a new Pawn to Professor password:\n${resetUrl}\n\n` +
        `The link expires in 20 minutes and can be used only once.\n\n` +
        `If you did not request this, ignore this email.`,
      html:
        `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#173d32">` +
        `<h2>Pawn to Professor</h2>` +
        `<p>Hello ${safeName},</p>` +
        `<p>Use the button below to create a new password.</p>` +
        `<p><a href="${resetUrl}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#176f52;color:#fff;text-decoration:none;font-weight:700">Reset my password</a></p>` +
        `<p>This link expires in <strong>20 minutes</strong> and can be used only once.</p>` +
        `<p>If you did not request this, you can safely ignore this email.</p>` +
        `</div>`
    });
  } catch (error) {
    await admin.from('password_reset_challenges').delete().eq('id', challenge.id);
    return json(res, 503, { error: error.message || 'Password recovery email could not be sent.' });
  }

  try {
    await admin.from('password_reset_challenges')
      .delete()
      .lt('expires_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  } catch {
    // Cleanup failure must not block a successful reset-email request.
  }

  return json(res, 200, { ok: true, message: genericResetMessage });
}

async function resetPassword({ req, res, admin }) {
  const token = String(req.body?.token || '').trim();
  const password = String(req.body?.password || '');

  if (token.length < 32 || token.length > 200) {
    return json(res, 400, { error: 'This password reset link is invalid.' });
  }
  if (password.length < 8 || password.length > 128) {
    return json(res, 400, { error: 'Password must be between 8 and 128 characters.' });
  }

  const rate = await enforceRateLimit({
    admin, req, res, scope: 'password-reset-complete', windowSeconds: 600, maxHits: 10
  });
  if (!rate.allowed) return json(res, 429, { error: 'Too many reset attempts. Please wait and try again.' });

  const hash = tokenHash(token);
  const now = new Date().toISOString();

  const { data: challenge, error: challengeError } = await admin
    .from('password_reset_challenges')
    .select('id,user_id,expires_at,used_at')
    .eq('token_hash', hash)
    .maybeSingle();

  if (challengeError || !challenge || challenge.used_at || new Date(challenge.expires_at) <= new Date()) {
    return json(res, 403, { error: 'This password reset link is invalid or has expired. Request a new one.' });
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(challenge.user_id, { password });
  if (updateError) {
    return json(res, 500, { error: 'The password could not be changed. Please request a new reset link.' });
  }

  await admin.from('password_reset_challenges')
    .update({ used_at: now })
    .eq('id', challenge.id);

  try {
    await Promise.all([
      admin.from('member_security').delete().eq('user_id', challenge.user_id),
      admin.from('device_verification_challenges').delete().eq('user_id', challenge.user_id),
      admin.from('password_reset_challenges').delete().eq('user_id', challenge.user_id).neq('id', challenge.id)
    ]);
  } catch {
    // Password reset already succeeded; cleanup can be retried later.
  }

  try {
    await admin.from('audit_log').insert({
      actor_id: challenge.user_id,
      action: 'password_reset_completed',
      entity_type: 'profile',
      entity_id: challenge.user_id,
      details: { method: 'secure_email_link' }
    });
  } catch {
    // Audit logging failure must not invalidate a completed password reset.
  }

  return json(res, 200, { ok: true });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) return json(res, 500, { error: 'Server configuration is incomplete.' });

  const action = actionFromRequest(req);
  const admin = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  switch (action) {
    case 'check-device':
      return checkDevice({ req, res, admin, secret });
    case 'verify-device':
      return verifyDevice({ req, res, admin, secret });
    case 'session-status':
      return sessionStatus({ req, res, admin });
    case 'request-password-reset':
      return requestPasswordReset({ req, res, admin });
    case 'reset-password':
      return resetPassword({ req, res, admin });
    default:
      return json(res, 404, { error: 'Unknown security action.' });
  }
}
