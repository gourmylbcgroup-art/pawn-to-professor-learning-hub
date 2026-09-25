import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { enforceRateLimit } from '../_lib/rate-limit.js';
import { emailConfigured, sendEmail } from '../_lib/email.js';
import { json, requestIpHash } from '../_lib/security.js';

const genericMessage = 'If an eligible account matches, a password reset email has been sent.';

function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) return json(res, 500, { error: 'Server configuration is incomplete.' });
  if (!emailConfigured()) return json(res, 503, { error: 'Password recovery email is not configured yet.' });

  const portalBase = String(process.env.PORTAL_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!portalBase || !/^https:\/\//i.test(portalBase)) {
    return json(res, 503, { error: 'PORTAL_BASE_URL must be configured with the live HTTPS Learning Hub URL.' });
  }

  const identifier = String(req.body?.identifier || '').trim().toLowerCase().slice(0, 254);
  if (identifier.length < 2) return json(res, 400, { error: 'Enter your username or registered email.' });

  const admin = createClient(url, secret, { auth: { persistSession:false, autoRefreshToken:false } });

  const generalRate = await enforceRateLimit({
    admin, req, res, scope:'password-reset-request', windowSeconds:900, maxHits:6
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

  // Deliberately do not reveal whether the account exists.
  if (!profile || profile.status !== 'active' || !profile.contact_email) {
    return json(res, 200, { ok:true, message:genericMessage });
  }

  const expiredAccount = profile.expires_at && new Date(profile.expires_at) <= new Date();
  if (expiredAccount) return json(res, 200, { ok:true, message:genericMessage });

  const userRate = await enforceRateLimit({
    admin, req, res, scope:'password-reset-user', userId:profile.id, windowSeconds:900, maxHits:3
  });
  if (!userRate.allowed) {
    return json(res, 200, { ok:true, message:genericMessage });
  }

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
        `<p>Hello ${String(name).replace(/[<>&"]/g, '')},</p>` +
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

  // Opportunistic cleanup of old reset records.
  await admin.from('password_reset_challenges')
    .delete()
    .lt('expires_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .catch(() => {});

  return json(res, 200, { ok:true, message:genericMessage });
}
