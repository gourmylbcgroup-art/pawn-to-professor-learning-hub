import { createClient } from '@supabase/supabase-js';
import { sendEmail, emailConfigured } from '../_lib/email.js';
import { json, getAuthenticatedProfile, activeProfile } from '../_lib/security.js';
import { enforceRateLimit } from '../_lib/rate-limit.js';

function esc(v='') { return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) return json(res, 500, { error: 'Server configuration is incomplete.' });
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const auth = await getAuthenticatedProfile(admin, req);
  if (auth.error) return json(res, 401, { error: auth.error });
  if (!activeProfile(auth.profile) || !['admin','owner'].includes(auth.profile.role)) return json(res, 403, { error: 'Administrator or owner access required.' });
  const rate = await enforceRateLimit({ admin, req, res, scope: 'notify-content', userId: auth.profile.id, windowSeconds: 600, maxHits: 30 });
  if (!rate.allowed) return json(res, 429, { error: 'Too many notification requests. Please wait.' });

  const { data: settings } = await admin.from('portal_settings').select('email_notifications_enabled').eq('id',1).maybeSingle();
  if (settings?.email_notifications_enabled === false) return json(res, 409, { error: 'Email notifications are disabled in Admin Settings.' });
  if (!emailConfigured()) return json(res, 503, { error: 'Email is not configured. Add RESEND_API_KEY and EMAIL_FROM in Vercel.' });

  const contentType = String(req.body?.contentType || '').trim();
  const contentId = String(req.body?.contentId || '').trim();
  if (!['activity','resource','unit'].includes(contentType) || !contentId) return json(res, 400, { error: 'Invalid notification request.' });

  let unitId = null;
  let title = '';
  let kind = '';
  if (contentType === 'activity') {
    const { data } = await admin.from('activities').select('id,unit_id,title,type,published').eq('id',contentId).maybeSingle();
    if (!data?.published) return json(res,404,{error:'Activity not found or hidden.'});
    unitId = data.unit_id; title = data.title; kind = data.type || 'Game';
  } else if (contentType === 'resource') {
    const { data } = await admin.from('resources').select('id,unit_id,title,resource_type,published').eq('id',contentId).maybeSingle();
    if (!data?.published) return json(res,404,{error:'Resource not found or hidden.'});
    unitId = data.unit_id; title = data.title; kind = data.resource_type || 'Resource';
  } else {
    const { data } = await admin.from('units').select('id,grade_id,name,title,is_published').eq('id',contentId).maybeSingle();
    if (!data?.is_published) return json(res,404,{error:'Unit not found or hidden.'});
    unitId = data.id; title = data.title ? `${data.name} — ${data.title}` : data.name; kind = 'New Unit';
  }

  const { data: unit } = await admin.from('units').select('id,name,grade_id').eq('id',unitId).maybeSingle();
  const { data: grade } = unit ? await admin.from('grades').select('id,name,school_year_id').eq('id',unit.grade_id).maybeSingle() : { data:null };
  const { data: year } = grade ? await admin.from('school_years').select('id,name').eq('id',grade.school_year_id).maybeSingle() : { data:null };
  const path = [year?.name, grade?.name, unit?.name].filter(Boolean).join(' / ');

  const { data: recipients, error: recipientError } = await admin.rpc('notification_recipients_for_unit', { target_unit: unitId });
  if (recipientError) return json(res,500,{error:recipientError.message});
  const portal = process.env.PORTAL_BASE_URL || 'https://learn.pawntoprofessor.com';
  let sent = 0, failed = 0;
  const list = recipients || [];

  for (let i = 0; i < list.length; i += 5) {
    const chunk = list.slice(i, i + 5);
    const results = await Promise.allSettled(chunk.map(async r => {
      const subject = `New ${kind} — ${path || 'Pawn to Professor'}`;
      const text = `Hello ${r.display_name || 'Teacher'},\n\n${title} has been added to ${path || 'your Learning Hub'}.\n\nOpen Pawn to Professor: ${portal}\n\nThe email does not contain the private game/file link. Sign in to access it.`;
      const html = `<div style="font-family:Arial,sans-serif;line-height:1.55"><h2>Pawn to Professor</h2><p>Hello ${esc(r.display_name || 'Teacher')},</p><p><strong>${esc(title)}</strong> has been added to:</p><p>${esc(path)}</p><p><a href="${portal}" style="display:inline-block;padding:12px 18px;background:#0f5a42;color:white;text-decoration:none;border-radius:8px">Open Learning Hub</a></p><p style="font-size:12px;color:#666">For security, this email does not contain the private game or file link.</p></div>`;
      await sendEmail({ to:r.contact_email, subject, text, html });
      return r;
    }));
    for (let j = 0; j < results.length; j++) {
      const result = results[j]; const recipient = chunk[j];
      if (result.status === 'fulfilled') {
        sent++;
        await admin.from('email_notification_log').insert({content_type:contentType,content_id:contentId,user_id:recipient.user_id,email:recipient.contact_email,status:'sent'});
      } else {
        failed++;
        await admin.from('email_notification_log').insert({content_type:contentType,content_id:contentId,user_id:recipient.user_id,email:recipient.contact_email,status:'failed',error_message:String(result.reason?.message||result.reason||'Email failed').slice(0,500)});
      }
    }
  }
  await admin.from('audit_log').insert({ actor_id: auth.profile.id, action:'content_notification_sent', entity_type:contentType, entity_id:contentId, details:{sent,failed,path,title} });
  return json(res,200,{ok:true,sent,failed,eligible:list.length});
}
