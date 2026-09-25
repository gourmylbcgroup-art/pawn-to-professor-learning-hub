import { createClient } from '@supabase/supabase-js';
import { json, getAuthenticatedProfile, activeProfile, assertCurrentMemberDevice } from '../_lib/security.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) return json(res, 500, { error: 'Server configuration is incomplete.' });
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const auth = await getAuthenticatedProfile(admin, req);
  if (auth.error) return json(res, 401, { error: auth.error });
  if (!activeProfile(auth.profile)) return json(res, 403, { error: 'This account is inactive or expired.' });

  const resourceId = String(req.body?.resourceId || '').trim();
  const mode = String(req.body?.mode || 'view').trim().toLowerCase();
  const deviceId = String(req.body?.deviceId || '').trim();
  if (!resourceId || !['view','download'].includes(mode)) return json(res, 400, { error: 'Invalid resource request.' });

  const deviceCheck = await assertCurrentMemberDevice({ admin, profile: auth.profile, sessionId: auth.sessionId, deviceId });
  if (!deviceCheck.ok) return json(res, 409, { error: deviceCheck.reason });

  const [{ data: resource }, { data: target }] = await Promise.all([
    admin.from('resources').select('id,unit_id,title,resource_type,audience,allow_view,allow_download,published').eq('id', resourceId).maybeSingle(),
    admin.from('resource_targets').select('target_url,enabled').eq('resource_id', resourceId).maybeSingle()
  ]);
  if (!resource || !resource.published || !target?.enabled) return json(res, 404, { error: 'Resource is not available.' });
  if (resource.audience === 'staff' && !['admin','owner'].includes(auth.profile.role)) return json(res, 403, { error: 'This resource is for staff only.' });
  if (!['admin','owner'].includes(auth.profile.role)) {
    const { data: allowed, error } = await admin.rpc('user_has_effective_unit_access', { target_user: auth.profile.id, target_unit: resource.unit_id });
    if (error || !allowed) return json(res, 403, { error: 'This resource is not included in your account.' });
  }
  if (mode === 'view' && !resource.allow_view) return json(res, 403, { error: 'Viewing is disabled for this resource.' });
  if (mode === 'download' && !resource.allow_download) return json(res, 403, { error: 'Downloading is disabled for this resource.' });
  try { new URL(target.target_url); } catch { return json(res, 500, { error: 'The administrator configured an invalid file link.' }); }
  return json(res, 200, { ok: true, title: resource.title, url: target.target_url, mode });
}
