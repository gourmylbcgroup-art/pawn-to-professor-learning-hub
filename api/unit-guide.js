import { createClient } from '@supabase/supabase-js';
import {
  json,
  getAuthenticatedProfile,
  activeProfile,
  assertCurrentMemberDevice
} from './_lib/security.js';

const BUCKET = 'unit-guides';
const SIGNED_URL_SECONDS = 300;

function clean(v='', max=500) {
  return String(v || '').trim().slice(0,max);
}

function validStoragePath(path) {
  if (!path || path.length > 500) return false;
  if (path.startsWith('/') || path.includes('..') || /^https?:\/\//i.test(path)) return false;
  return /\.pdf$/i.test(path);
}

async function requireAuth(admin, req, res) {
  const auth = await getAuthenticatedProfile(admin, req);
  if (auth.error) {
    json(res,401,{error:auth.error});
    return null;
  }
  if (!activeProfile(auth.profile)) {
    json(res,403,{error:'This account is inactive or expired.'});
    return null;
  }
  return auth;
}

async function requireStaff(admin, req, res) {
  const auth = await requireAuth(admin,req,res);
  if (!auth) return null;
  if (!['admin','owner'].includes(auth.profile.role)) {
    json(res,403,{error:'Administrator or owner access required.'});
    return null;
  }
  return auth;
}

async function unitAllowed(admin, auth, unitId) {
  if (['admin','owner'].includes(auth.profile.role)) return true;
  const {data,error} = await admin.rpc('user_has_effective_unit_access',{
    target_user:auth.profile.id,
    target_unit:unitId
  });
  return !error && data === true;
}

export default async function handler(req,res) {
  if (req.method !== 'POST') return json(res,405,{error:'Method not allowed'});

  const mainUrl = process.env.SUPABASE_URL;
  const mainSecret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const docsUrl = process.env.DOCS_SUPABASE_URL;
  const docsSecret = process.env.DOCS_SUPABASE_SERVICE_ROLE_KEY;

  if (!mainUrl || !mainSecret) {
    return json(res,500,{error:'Main Supabase server configuration is incomplete.'});
  }
  if (!docsUrl || !docsSecret) {
    return json(res,500,{error:'Document Storage is not configured in Vercel.'});
  }

  const admin = createClient(mainUrl,mainSecret,{auth:{persistSession:false,autoRefreshToken:false}});
  const docs = createClient(docsUrl,docsSecret,{auth:{persistSession:false,autoRefreshToken:false}});
  const action = clean(req.body?.action,40);

  if (action === 'admin-list') {
    const auth = await requireStaff(admin,req,res);
    if (!auth) return;
    const {data,error}=await admin.from('unit_pdf_guides').select('*').order('updated_at',{ascending:false});
    if (error) return json(res,500,{error:error.message});
    return json(res,200,{ok:true,guides:data||[]});
  }

  if (action === 'admin-save') {
    const auth = await requireStaff(admin,req,res);
    if (!auth) return;

    const unitId=clean(req.body?.unitId,80);
    const title=clean(req.body?.title||'Unit Activity Guide',160);
    const description=clean(req.body?.description,300);
    const storagePath=clean(req.body?.storagePath,500);
    const published=req.body?.published !== false;

    if (!unitId) return json(res,400,{error:'Choose a Unit.'});
    if (!validStoragePath(storagePath)) {
      return json(res,400,{error:'Enter a private PDF path such as grade6/unit4-activity-guide.pdf. Do not paste a URL.'});
    }

    const {data:unit}=await admin.from('units').select('id').eq('id',unitId).maybeSingle();
    if (!unit) return json(res,404,{error:'Unit not found.'});

    const {data,error}=await admin.from('unit_pdf_guides').upsert({
      unit_id:unitId,
      title:title || 'Unit Activity Guide',
      description:description || null,
      storage_path:storagePath,
      published,
      updated_at:new Date().toISOString(),
      updated_by:auth.profile.id
    },{onConflict:'unit_id'}).select().single();

    if (error) return json(res,400,{error:error.message});
    try {
      await admin.from('audit_log').insert({
        actor_id:auth.profile.id,
        action:'unit_pdf_guide_saved',
        entity_type:'unit',
        entity_id:unitId,
        details:{storage_path:storagePath,published}
      });
    } catch {}
    return json(res,200,{ok:true,guide:data});
  }

  if (action === 'admin-delete') {
    const auth = await requireStaff(admin,req,res);
    if (!auth) return;
    const unitId=clean(req.body?.unitId,80);
    if (!unitId) return json(res,400,{error:'Choose a Unit.'});
    const {error}=await admin.from('unit_pdf_guides').delete().eq('unit_id',unitId);
    if (error) return json(res,400,{error:error.message});
    try {
      await admin.from('audit_log').insert({
        actor_id:auth.profile.id,
        action:'unit_pdf_guide_removed',
        entity_type:'unit',
        entity_id:unitId,
        details:{pdf_kept_in_storage:true}
      });
    } catch {}
    return json(res,200,{ok:true});
  }

  if (!['metadata','signed-url'].includes(action)) {
    return json(res,400,{error:'Unknown Unit guide action.'});
  }

  const auth=await requireAuth(admin,req,res);
  if (!auth) return;

  const unitId=clean(req.body?.unitId,80);
  const deviceId=clean(req.body?.deviceId,220);
  if (!unitId) return json(res,400,{error:'Missing Unit.'});

  const deviceCheck=await assertCurrentMemberDevice({
    admin,
    profile:auth.profile,
    sessionId:auth.sessionId,
    deviceId
  });
  if (!deviceCheck.ok) return json(res,409,{error:deviceCheck.reason});

  const allowed=await unitAllowed(admin,auth,unitId);
  if (!allowed) return json(res,403,{error:'This guide is not included in your Unit access.'});

  const {data:guide,error:guideError}=await admin.from('unit_pdf_guides')
    .select('unit_id,title,description,storage_path,published')
    .eq('unit_id',unitId)
    .maybeSingle();

  if (guideError) return json(res,500,{error:guideError.message});
  if (!guide || !guide.published) {
    if (action === 'metadata') return json(res,200,{ok:true,available:false});
    return json(res,404,{error:'No published Activity Guide is available for this Unit.'});
  }

  if (action === 'metadata') {
    return json(res,200,{ok:true,available:true,title:guide.title,description:guide.description});
  }

  if (!validStoragePath(guide.storage_path)) {
    return json(res,500,{error:'The administrator configured an invalid PDF Storage path.'});
  }

  const {data:signed,error:signedError}=await docs.storage
    .from(BUCKET)
    .createSignedUrl(guide.storage_path,SIGNED_URL_SECONDS);

  if (signedError || !signed?.signedUrl) {
    return json(res,404,{error:'The PDF could not be found in private Document Storage.'});
  }

  res.setHeader('Cache-Control','no-store, private');
  res.setHeader('Pragma','no-cache');
  return res.status(200).json({
    ok:true,
    title:guide.title,
    url:signed.signedUrl,
    expiresIn:SIGNED_URL_SECONDS
  });
}
