import crypto from 'node:crypto';

export function json(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

export function bearerToken(req) {
  return String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
}

export function decodeJwtPayload(jwt) {
  try {
    const part = String(jwt || '').split('.')[1];
    if (!part) return {};
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  } catch {
    return {};
  }
}

export function sessionIdFromJwt(jwt) {
  const sid = decodeJwtPayload(jwt)?.session_id;
  return typeof sid === 'string' ? sid : null;
}

export function hashValue(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

export function codeHash(code, secret) {
  return crypto.createHmac('sha256', String(secret || '')).update(String(code || '')).digest('hex');
}

export function generateSixDigitCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

export function requestIpHash(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = forwarded || String(req.headers['x-real-ip'] || 'unknown');
  return hashValue(ip);
}

export function maskEmail(email) {
  const value = String(email || '').trim();
  const [local, domain] = value.split('@');
  if (!local || !domain) return 'your registered email';
  const visible = local.length <= 2 ? local[0] || '*' : `${local[0]}${'*'.repeat(Math.min(7, local.length - 1))}`;
  return `${visible}@${domain}`;
}

export function activeProfile(profile) {
  if (!profile || profile.status !== 'active') return false;
  return !profile.expires_at || new Date(profile.expires_at) > new Date();
}

export async function getAuthenticatedProfile(admin, req) {
  const token = bearerToken(req);
  if (!token) return { token: '', user: null, profile: null, sessionId: null, error: 'Missing login token.' };
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData?.user) return { token, user: null, profile: null, sessionId: null, error: 'Invalid session.' };
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id,username,display_name,contact_email,role,status,expires_at')
    .eq('id', authData.user.id)
    .maybeSingle();
  if (profileError || !profile) return { token, user: authData.user, profile: null, sessionId: sessionIdFromJwt(token), error: 'Profile not found.' };
  return { token, user: authData.user, profile, sessionId: sessionIdFromJwt(token), error: null };
}

export async function getSecuritySettings(admin) {
  const { data } = await admin.from('portal_settings')
    .select('member_device_security_enabled,trusted_device_days,device_code_minutes,email_notifications_enabled')
    .eq('id', 1)
    .maybeSingle();
  return {
    member_device_security_enabled: data?.member_device_security_enabled !== false,
    trusted_device_days: Math.min(365, Math.max(1, Number(data?.trusted_device_days || 90))),
    device_code_minutes: Math.min(30, Math.max(5, Number(data?.device_code_minutes || 10))),
    email_notifications_enabled: data?.email_notifications_enabled !== false
  };
}

export async function assertCurrentMemberDevice({ admin, profile, sessionId, deviceId }) {
  if (!profile) return { ok: false, reason: 'Profile not found.' };
  if (['admin','owner'].includes(profile.role)) return { ok: true, exempt: true };
  const settings = await getSecuritySettings(admin);
  if (!settings.member_device_security_enabled) return { ok: true, disabled: true };
  if (!activeProfile(profile)) return { ok: false, reason: 'Account is inactive or expired.' };
  if (!deviceId || !sessionId) return { ok: false, reason: 'Trusted device verification required.' };
  const deviceHash = hashValue(deviceId);
  const { data: security } = await admin.from('member_security')
    .select('trusted_device_hash,trusted_until,current_session_id')
    .eq('user_id', profile.id)
    .maybeSingle();
  const trusted = security?.trusted_device_hash === deviceHash
    && security?.trusted_until
    && new Date(security.trusted_until) > new Date();
  const currentSession = security?.current_session_id && String(security.current_session_id) === String(sessionId);
  if (!trusted || !currentSession) return { ok: false, reason: 'This session is no longer the trusted device.' };
  return { ok: true };
}
