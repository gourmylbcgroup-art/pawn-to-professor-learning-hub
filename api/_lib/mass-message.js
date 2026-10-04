import { createClient } from '@supabase/supabase-js';
import { sendEmail, emailConfigured } from './email.js';
import { json, getAuthenticatedProfile, activeProfile } from './security.js';

function clean(v='',max=8000){return String(v||'').trim().slice(0,max);}
function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function validEmail(v=''){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||'').trim());}

async function requireStaff(admin,req){
  const auth=await getAuthenticatedProfile(admin,req);
  if(auth.error)return {error:auth.error,status:401};
  if(!activeProfile(auth.profile)||!['admin','owner'].includes(auth.profile.role)){
    return {error:'Administrator or owner access required.',status:403};
  }
  return {auth};
}

async function activeProfiles(admin){
  const {data,error}=await admin.from('profiles')
    .select('id,username,display_name,contact_email,member_type,role,status,expires_at,trial_started_at,trial_ends_at')
    .eq('role','user')
    .eq('status','active')
    .limit(500);
  if(error)throw error;
  const now=Date.now();
  return (data||[]).filter(p=>!p.expires_at||new Date(p.expires_at).getTime()>now);
}

async function activePaidIds(admin){
  const now=new Date().toISOString();
  const {data,error}=await admin.from('annual_access_periods')
    .select('user_id')
    .is('cancelled_at',null)
    .lte('starts_at',now)
    .gt('ends_at',now);
  if(error)return new Set();
  return new Set((data||[]).map(r=>r.user_id));
}

function trialActive(p){
  const now=Date.now();
  return !!p.trial_started_at && !!p.trial_ends_at &&
    new Date(p.trial_started_at).getTime()<=now &&
    new Date(p.trial_ends_at).getTime()>now;
}

async function membersWithUnitAccess(admin,members,gradeNumber,unitNumber){
  if(!gradeNumber||!unitNumber)throw new Error('Choose a Grade and Unit.');
  const {data:grades,error:gErr}=await admin.from('grades').select('id,name').ilike('name',`%${gradeNumber}%`);
  if(gErr)throw gErr;
  const gradeIds=(grades||[]).map(g=>g.id);
  if(!gradeIds.length)return [];

  const {data:units,error:uErr}=await admin.from('units')
    .select('id,grade_id,name,is_published')
    .in('grade_id',gradeIds)
    .eq('name',`Unit ${unitNumber}`)
    .eq('is_published',true);
  if(uErr)throw uErr;
  const unitIds=(units||[]).map(u=>u.id);
  if(!unitIds.length)return [];

  const matched=[];
  // Existing portal RPC already powers Preview Effective Access.
  for(const member of members){
    try{
      const {data,error}=await admin.rpc('effective_unit_ids_for_user',{target_user:member.id});
      if(error)continue;
      const ids=new Set((data||[]).map(x=>x.unit_id));
      if(unitIds.some(id=>ids.has(id)))matched.push(member);
    }catch{}
  }
  return matched;
}

async function resolveRecipients(admin,{audience,userIds,gradeNumber,unitNumber}){
  const all=await activeProfiles(admin);
  const ids=new Set(Array.isArray(userIds)?userIds.map(String):[]);
  if(audience==='all')return all;
  if(audience==='teachers')return all.filter(p=>p.member_type==='teacher');
  if(audience==='learners')return all.filter(p=>p.member_type==='learner');
  if(audience==='trial')return all.filter(trialActive);
  if(audience==='paid'){
    const paid=await activePaidIds(admin);
    return all.filter(p=>paid.has(p.id));
  }
  if(audience==='selected')return all.filter(p=>ids.has(String(p.id)));
  if(audience==='unit_access')return membersWithUnitAccess(admin,all,gradeNumber,unitNumber);
  throw new Error('Choose a valid audience.');
}

function audienceLabel(audience,grade,unit){
  const labels={
    all:'All active members',
    teachers:'All teachers',
    learners:'All learners',
    trial:'Active trial members',
    paid:'Active paid members',
    selected:'Selected members'
  };
  if(audience==='unit_access')return `Grade ${grade} / Unit ${unit} access`;
  return labels[audience]||audience;
}

async function notifyMember(member,subject,body,portal){
  if(!validEmail(member.contact_email))return {status:'skipped'};
  if(!emailConfigured())return {status:'skipped'};
  const name=member.display_name||member.username||'Member';
  const text=[
    `Hello ${name},`,'',
    `You have a new message from Pawn to Professor Admin.`,'',
    subject,'',body,'',
    `Open Pawn to Professor: ${portal}`
  ].join('\n');
  const html=`<div style="font-family:Arial,sans-serif;line-height:1.55;color:#1f2937">
    <h2>Pawn to Professor</h2>
    <p>Hello ${esc(name)},</p>
    <p>You have a new message from <strong>Pawn to Professor Admin</strong>.</p>
    <p><strong>${esc(subject)}</strong></p>
    <div style="padding:12px 14px;background:#f3f4f6;border-radius:8px;white-space:pre-wrap">${esc(body)}</div>
    <p style="margin-top:18px"><a href="${esc(portal)}" style="display:inline-block;padding:11px 16px;background:#0f5a42;color:#fff;text-decoration:none;border-radius:8px">Open My Messages</a></p>
  </div>`;
  try{await sendEmail({to:member.contact_email,subject:`Pawn to Professor — ${subject}`,text,html});return {status:'sent'};}
  catch(err){return {status:'failed',reason:String(err?.message||err)};}
}

export default async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
  const url=process.env.SUPABASE_URL;
  const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!secret)return json(res,500,{error:'Server configuration is incomplete.'});
  const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const access=await requireStaff(admin,req);
  if(access.error)return json(res,access.status,{error:access.error});

  const action=clean(req.body?.action,20);
  const audience=clean(req.body?.audience,30);
  const userIds=Array.isArray(req.body?.userIds)?req.body.userIds.slice(0,300):[];
  const gradeNumber=Number(req.body?.gradeNumber)||null;
  const unitNumber=Number(req.body?.unitNumber)||null;

  let members;
  try{members=await resolveRecipients(admin,{audience,userIds,gradeNumber,unitNumber});}
  catch(err){return json(res,400,{error:err.message||'Could not resolve recipients.'});}

  if(action==='preview'){
    return json(res,200,{
      ok:true,
      recipientCount:members.length,
      preview:members.slice(0,25).map(m=>({
        id:m.id,username:m.username,displayName:m.display_name,memberType:m.member_type
      }))
    });
  }

  if(action!=='send')return json(res,400,{error:'Invalid action.'});
  if(!members.length)return json(res,400,{error:'No active recipients matched this selection.'});

  const category=clean(req.body?.category||'general',40);
  const subject=clean(req.body?.subject,180);
  const body=clean(req.body?.body,8000);
  const sendEmailCopy=req.body?.sendEmail!==false;
  if(!['general','access_payment','technical','account','other'].includes(category)){
    return json(res,400,{error:'Choose a valid message category.'});
  }
  if(subject.length<3)return json(res,400,{error:'Add a short subject.'});
  if(!body)return json(res,400,{error:'Write a message before sending.'});

  const broadcastId=globalThis.crypto?.randomUUID?.()||`broadcast-${Date.now()}-${access.auth.profile.id}`;
  const now=new Date().toISOString();

  const threadRows=members.map(member=>({
    member_id:member.id,
    category,
    subject,
    status:'new',
    context:{
      admin_broadcast:true,
      broadcast_id:broadcastId,
      audience,
      audience_label:audienceLabel(audience,gradeNumber,unitNumber),
      grade_number:gradeNumber,
      unit_number:unitNumber
    },
    created_by:access.auth.profile.id,
    admin_unread_count:0,
    member_unread_count:1,
    last_message_at:now
  }));

  const {data:threads,error:threadError}=await admin.from('support_threads')
    .insert(threadRows).select('id,member_id');
  if(threadError)return json(res,400,{error:threadError.message});

  const messageRows=(threads||[]).map(t=>({
    thread_id:t.id,
    sender_id:access.auth.profile.id,
    sender_kind:'admin',
    body,
    delivered_at:now
  }));
  const {error:messageError}=await admin.from('support_messages').insert(messageRows);
  if(messageError){
    const ids=(threads||[]).map(t=>t.id);
    if(ids.length)await admin.from('support_threads').delete().in('id',ids);
    return json(res,400,{error:messageError.message});
  }

  let emailSent=0,emailFailed=0,emailSkipped=0;
  if(sendEmailCopy){
    const portal=process.env.PORTAL_BASE_URL||'https://www.pawntoprofessor.com';
    for(let i=0;i<members.length;i+=10){
      const batch=members.slice(i,i+10);
      const results=await Promise.all(batch.map(m=>notifyMember(m,subject,body,portal)));
      for(const r of results){
        if(r.status==='sent')emailSent++;
        else if(r.status==='failed')emailFailed++;
        else emailSkipped++;
      }
    }
  }else emailSkipped=members.length;

  const status=emailFailed? (emailSent?'partial':'mailbox_only') : 'sent';
  const history={
    broadcast_id:broadcastId,
    audience,
    audience_label:audienceLabel(audience,gradeNumber,unitNumber),
    grade_number:gradeNumber,
    unit_number:unitNumber,
    category,
    subject,
    recipient_count:members.length,
    mailbox_delivered:members.length,
    email_requested:sendEmailCopy,
    email_sent:emailSent,
    email_failed:emailFailed,
    email_skipped:emailSkipped,
    status,
    created_by:access.auth.profile.id
  };
  await admin.from('mass_message_history').insert(history);

  try{
    await admin.from('audit_log').insert({
      actor_id:access.auth.profile.id,
      action:'admin_mass_message_sent',
      entity_type:'support_broadcast',
      entity_id:null,
      details:{broadcast_id:broadcastId,audience,recipients:members.length,subject,emailSent,emailFailed,emailSkipped}
    });
  }catch{}

  return json(res,200,{
    ok:true,broadcastId,recipientCount:members.length,mailboxDelivered:members.length,
    emailSent,emailFailed,emailSkipped,status
  });
}
