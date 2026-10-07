import { createClient } from '@supabase/supabase-js';
import { sendEmail, emailConfigured } from './email.js';
import { json, getAuthenticatedProfile, activeProfile } from './security.js';

function clean(v='', max=500) {
  return String(v || '').trim().slice(0,max);
}

function esc(v='') {
  return String(v).replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

async function requireStaff(admin, req, res) {
  const auth = await getAuthenticatedProfile(admin,req);
  if (auth.error) {
    json(res,401,{error:auth.error});
    return null;
  }
  if (!activeProfile(auth.profile) || !['admin','owner'].includes(auth.profile.role)) {
    json(res,403,{error:'Administrator or owner access required.'});
    return null;
  }
  return auth;
}

export default async function handler(req,res) {
  if (req.method !== 'POST') return json(res,405,{error:'Method not allowed'});

  const url=process.env.SUPABASE_URL;
  const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!secret) return json(res,500,{error:'Server configuration is incomplete.'});

  const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const auth = await requireStaff(admin,req,res);
  if (!auth) return;

  const mode = clean(req.body?.mode || '',30);

  if (mode === 'list') {
    const {data,error}=await admin.from('release_announcements')
      .select('*')
      .order('publish_at',{ascending:false})
      .limit(50);
    if (error) return json(res,500,{error:error.message});
    return json(res,200,{ok:true,announcements:data||[]});
  }

  if (mode === 'delete') {
    const id=clean(req.body?.id,100);
    if (!id) return json(res,400,{error:'Missing announcement.'});
    const {error}=await admin.from('release_announcements').delete().eq('id',id);
    if (error) return json(res,400,{error:error.message});
    return json(res,200,{ok:true});
  }

  if (mode !== 'save') {
    return json(res,400,{error:'Unknown announcement action.'});
  }

  const id=clean(req.body?.id,100);
  const title=clean(req.body?.title,80) || 'New release';
  const message=clean(req.body?.message,180);
  const publishAt=req.body?.publishAt ? new Date(req.body.publishAt).toISOString() : new Date().toISOString();
  const expiresAt=req.body?.expiresAt ? new Date(req.body.expiresAt).toISOString() : null;
  const published=req.body?.published !== false;
  const sendMail=req.body?.sendEmail === true;

  if (expiresAt && new Date(expiresAt) <= new Date(publishAt)) {
    return json(res,400,{error:'Expiry must be after the publish date.'});
  }

  const record={
    title,
    message,
    published,
    publish_at:publishAt,
    expires_at:expiresAt,
    created_by:auth.profile.id,
    released_at:publishAt,
    release_key:`manual-${Date.now()}`
  };

  let announcement;
  let dbError;

  if (id) {
    const update={...record};
    delete update.release_key;
    const result=await admin.from('release_announcements')
      .update(update)
      .eq('id',id)
      .select()
      .single();
    announcement=result.data;
    dbError=result.error;
  } else {
    const result=await admin.from('release_announcements')
      .insert(record)
      .select()
      .single();
    announcement=result.data;
    dbError=result.error;
  }

  if (dbError) return json(res,500,{error:dbError.message});

  let sent=0,failed=0;
  if (sendMail) {
    if (!emailConfigured()) {
      return json(res,503,{error:'Announcement saved, but email is not configured.'});
    }

    const {data:profiles,error:profileError}=await admin.from('profiles')
      .select('id,username,display_name,contact_email,status,expires_at')
      .eq('status','active');

    if (profileError) return json(res,500,{error:profileError.message});

    const recipients=(profiles||[]).filter(p=>{
      const email=String(p.contact_email||'').trim();
      const notExpired=!p.expires_at || new Date(p.expires_at)>new Date();
      return email.includes('@') && notExpired;
    });

    const portal=process.env.PORTAL_BASE_URL||'https://www.pawntoprofessor.com';

    for (let i=0;i<recipients.length;i+=5) {
      const chunk=recipients.slice(i,i+5);
      const results=await Promise.allSettled(chunk.map(async p=>{
        const name=p.display_name||p.username||'Teacher';
        await sendEmail({
          to:p.contact_email,
          subject:`Pawn to Professor — ${title}`,
          text:`Hello ${name},\n\n${title}\n${message}\n\nOpen Pawn to Professor: ${portal}`,
          html:`<div style="font-family:Arial,sans-serif;line-height:1.55;color:#1f2937">
            <h2>${esc(title)}</h2>
            <p>Hello ${esc(name)},</p>
            <p>${esc(message)}</p>
            <p><a href="${esc(portal)}" style="display:inline-block;padding:11px 16px;background:#0f5a42;color:#fff;text-decoration:none;border-radius:8px">Open Learning Hub</a></p>
          </div>`
        });
      }));
      results.forEach(r=>r.status==='fulfilled'?sent++:failed++);
    }
  }

  return json(res,200,{ok:true,announcement,sent,failed});
}
