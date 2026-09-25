import { createClient } from '@supabase/supabase-js';

const json = (res, status, body) => {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
};

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });

  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) return json(res, 500, { error: 'Server configuration is incomplete.' });

  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json(res, 401, { error: 'Missing login token.' });

  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData?.user) return json(res, 401, { error: 'Invalid session.' });

  const { data: caller, error: callerError } = await admin
    .from('profiles')
    .select('role,status,expires_at')
    .eq('id', authData.user.id)
    .maybeSingle();
  const expired = caller?.expires_at && new Date(caller.expires_at) <= new Date();
  if (callerError || !['admin','owner'].includes(caller?.role) || caller?.status !== 'active' || expired) {
    return json(res, 403, { error: 'Administrator or owner access required.' });
  }

  const dbStart = Date.now();
  const dbCheck = await admin.from('school_years').select('id', { count: 'exact', head: true });
  const databaseLatencyMs = Date.now() - dbStart;

  const nowIso = new Date().toISOString();
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [profiles, activities, resources, trustedDevices, forumTopics, activeLaunches, recentRateLimits] = await Promise.all([
    admin.from('profiles').select('id', { count: 'exact', head: true }),
    admin.from('activities').select('id', { count: 'exact', head: true }),
    admin.from('resources').select('id', { count: 'exact', head: true }),
    admin.from('member_security').select('user_id', { count: 'exact', head: true }).not('trusted_device_hash','is',null),
    admin.from('forum_topics').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    admin.from('game_launch_tokens').select('id', { count: 'exact', head: true }).gt('expires_at', nowIso),
    admin.from('api_rate_limits').select('bucket_key', { count: 'exact', head: true }).gte('updated_at', tenMinutesAgo)
  ]);

  // Opportunistic housekeeping. It is deliberately non-blocking.
  await Promise.all([
    admin.from('api_rate_limits').delete().lt('updated_at', sevenDaysAgo),
    admin.from('game_launch_tokens').delete().lt('expires_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
  ]).catch(()=>{});

  const queryErrors = [dbCheck, profiles, activities, resources, trustedDevices, forumTopics, activeLaunches, recentRateLimits]
    .map(x => x.error?.message)
    .filter(Boolean);

  return json(res, 200, {
    ok: queryErrors.length === 0,
    checkedAt: new Date().toISOString(),
    databaseLatencyMs,
    counts: {
      profiles: profiles.count || 0,
      activities: activities.count || 0,
      resources: resources.count || 0,
      trustedDevices: trustedDevices.count || 0,
      forumTopics: forumTopics.count || 0
    },
    activeLaunches: activeLaunches.count || 0,
    recentRateLimitRows: recentRateLimits.count || 0,
    config: {
      supabaseUrl: Boolean(url),
      serviceRoleKey: Boolean(secret),
      emailProvider: Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
      portalBaseUrl: Boolean(process.env.PORTAL_BASE_URL)
    },
    errors: queryErrors
  });
}
