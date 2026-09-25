import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { enforceRateLimit } from '../_lib/rate-limit.js';
import { json } from '../_lib/security.js';

function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) return json(res, 500, { error: 'Server configuration is incomplete.' });

  const token = String(req.body?.token || '').trim();
  const password = String(req.body?.password || '');

  if (token.length < 32 || token.length > 200) {
    return json(res, 400, { error: 'This password reset link is invalid.' });
  }
  if (password.length < 8 || password.length > 128) {
    return json(res, 400, { error: 'Password must be between 8 and 128 characters.' });
  }

  const admin = createClient(url, secret, { auth: { persistSession:false, autoRefreshToken:false } });
  const rate = await enforceRateLimit({
    admin, req, res, scope:'password-reset-complete', windowSeconds:600, maxHits:10
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
  if (updateError) return json(res, 500, { error: 'The password could not be changed. Please request a new reset link.' });

  await admin.from('password_reset_challenges')
    .update({ used_at: now })
    .eq('id', challenge.id);

  // A password reset also revokes trusted-device state for normal members.
  // Their next successful login must establish/verify the current device again.
  await Promise.all([
    admin.from('member_security').delete().eq('user_id', challenge.user_id),
    admin.from('device_verification_challenges').delete().eq('user_id', challenge.user_id),
    admin.from('password_reset_challenges').delete().eq('user_id', challenge.user_id).neq('id', challenge.id)
  ]).catch(() => {});

  await admin.from('audit_log').insert({
    actor_id: challenge.user_id,
    action: 'password_reset_completed',
    entity_type: 'profile',
    entity_id: challenge.user_id,
    details: { method:'secure_email_link' }
  }).catch(() => {});

  return json(res, 200, { ok:true });
}
