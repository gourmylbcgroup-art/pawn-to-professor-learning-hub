import { createClient } from '@supabase/supabase-js';
import { enforceRateLimit } from './_lib/rate-limit.js';

function json(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

function normalizeUsername(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 80);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceKey) {
    return json(res, 500, { error: 'Server configuration is incomplete.' });
  }

  const identifier = String(req.body?.identifier || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (identifier.length < 2 || identifier.length > 254 || password.length < 1 || password.length > 256) {
    return json(res, 401, { error: 'Username or password is not correct.' });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const rate = await enforceRateLimit({
    admin,
    req,
    res,
    scope: 'login',
    windowSeconds: 600,
    maxHits: 20
  });

  if (!rate.allowed) {
    return json(res, 429, { error: 'Too many login attempts. Please wait and try again.' });
  }

  let authEmail = '';

  if (identifier.includes('@')) {
    // Full Auth email remains supported.
    authEmail = identifier;
  } else {
    const username = normalizeUsername(identifier);
    if (!username) {
      return json(res, 401, { error: 'Username or password is not correct.' });
    }

    // Resolve the portal username to the Supabase Auth user ID, then read that
    // Auth user's actual email. This supports both:
    //   newer users  -> username@portal.local
    //   legacy users -> their original real Auth email
    const { data: profile } = await admin
      .from('profiles')
      .select('id')
      .ilike('username', username)
      .limit(1)
      .maybeSingle();

    if (profile?.id) {
      const { data: authUserData } = await admin.auth.admin.getUserById(profile.id);
      authEmail = String(authUserData?.user?.email || '').trim().toLowerCase();
    }

    // Safe compatibility fallback for current portal.local accounts.
    // The error returned to the browser stays generic.
    if (!authEmail) {
      authEmail = `${username}@portal.local`;
    }
  }

  const publicAuth = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data, error } = await publicAuth.auth.signInWithPassword({
    email: authEmail,
    password
  });

  if (error || !data?.session) {
    return json(res, 401, { error: 'Username or password is not correct.' });
  }

  // Do not return the resolved Auth email. The browser only receives the
  // normal Supabase session tokens it would have received from direct login.
  return json(res, 200, {
    ok: true,
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      expires_in: data.session.expires_in,
      token_type: data.session.token_type
    }
  });
}
