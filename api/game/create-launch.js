import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const json = (res, status, body) => {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
};

function activeProfile(profile) {
  if (!profile || profile.status !== 'active') return false;
  return !profile.expires_at || new Date(profile.expires_at) > new Date();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) return json(res, 500, { error: 'Server configuration is incomplete.' });

  const activityId = String(req.body?.activityId || '').trim();
  if (!activityId) return json(res, 400, { error: 'Missing activity.' });

  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

  const [{ data: activity, error: activityError }, { data: target, error: targetError }] = await Promise.all([
    admin.from('activities').select('id,unit_id,title,type,published').eq('id', activityId).maybeSingle(),
    admin.from('activity_targets').select('activity_id,target_url,security_mode,launch_ttl_seconds,enabled').eq('activity_id', activityId).maybeSingle()
  ]);

  if (activityError || !activity || !activity.published) return json(res, 404, { error: 'Activity is not available.' });
  if (targetError || !target || !target.enabled) return json(res, 404, { error: 'Secure game target is not configured.' });

  let user = null;
  let profile = null;
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();

  if (bearer) {
    const { data: authData } = await admin.auth.getUser(bearer);
    user = authData?.user || null;
    if (user) {
      const { data } = await admin.from('profiles').select('id,role,status,expires_at').eq('id', user.id).maybeSingle();
      profile = data || null;
    }
  }

  if (target.security_mode !== 'public') {
    if (!user || !activeProfile(profile)) return json(res, 401, { error: 'Please log in to open this activity.' });
  }

  if (target.security_mode === 'unit' && !['admin', 'owner'].includes(profile?.role)) {
    const { data: access } = await admin
      .from('user_unit_access')
      .select('unit_id,expires_at')
      .eq('user_id', user.id)
      .eq('unit_id', activity.unit_id)
      .maybeSingle();

    const allowed = access && (!access.expires_at || new Date(access.expires_at) > new Date());
    if (!allowed) return json(res, 403, { error: 'This activity is not included in your account.' });
  }

  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const ttl = Math.min(900, Math.max(60, Number(target.launch_ttl_seconds || 180)));
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

  // Opportunistic cleanup; failure should never block launch.
  await admin.from('game_launch_tokens').delete().lt('expires_at', new Date(Date.now() - 3600000).toISOString());

  const { error: tokenError } = await admin.from('game_launch_tokens').insert({
    token_hash: tokenHash,
    activity_id: activity.id,
    user_id: user?.id || null,
    expires_at: expiresAt
  });
  if (tokenError) return json(res, 500, { error: 'Could not create a secure launch.' });

  let embedUrl;
  try {
    const parsed = new URL(target.target_url);
    parsed.searchParams.set('ptp_token', rawToken);
    parsed.searchParams.set('ptp_activity', activity.id);
    embedUrl = parsed.toString();
  } catch {
    return json(res, 500, { error: 'The administrator configured an invalid game URL.' });
  }

  return json(res, 200, {
    activityId: activity.id,
    title: activity.title,
    type: activity.type,
    securityMode: target.security_mode,
    embedUrl,
    expiresAt
  });
}
