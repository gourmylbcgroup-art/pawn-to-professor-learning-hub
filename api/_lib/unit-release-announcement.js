import { createClient } from '@supabase/supabase-js';
import { sendEmail, emailConfigured } from './email.js';
import { json, getAuthenticatedProfile, activeProfile } from './security.js';

function esc(v='') {
  return String(v).replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

export default async function handler(req,res) {
  if(req.method!=='POST') return json(res,405,{error:'Method not allowed'});

  const url=process.env.SUPABASE_URL;
  const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!secret) return json(res,500,{error:'Server configuration is incomplete.'});

  const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const auth=await getAuthenticatedProfile(admin,req);
  if(auth.error) return json(res,401,{error:auth.error});
  if(!activeProfile(auth.profile)||!['admin','owner'].includes(auth.profile.role)){
    return json(res,403,{error:'Administrator or owner access required.'});
  }

  const unitNumber=Number(req.body?.unitNumber);
  if(!Number.isInteger(unitNumber)||unitNumber<1||unitNumber>30){
    return json(res,400,{error:'Invalid Unit number.'});
  }

  const releaseKey=`paid-unit-${unitNumber}`;
  const {data:existing}=await admin.from('release_announcements')
    .select('*').eq('release_key',releaseKey).maybeSingle();

  if(existing){
    return json(res,200,{ok:true,alreadyAnnounced:true,announcement:existing,sent:0,failed:0});
  }

  const unitName=`Unit ${unitNumber}`;
  const {data:units}=await admin.from('units')
    .select('id,name,title,grade_id,is_published')
    .eq('name',unitName)
    .eq('is_published',true);

  const gradeIds=[...new Set((units||[]).map(u=>u.grade_id).filter(Boolean))];
  let grades=[];
  if(gradeIds.length){
    const {data:g}=await admin.from('grades').select('id,name').in('id',gradeIds);
    grades=g||[];
  }
  const gradeMap=new Map(grades.map(g=>[g.id,g.name]));
  const paths=(units||[]).map(u=>{
    const grade=gradeMap.get(u.grade_id)||'';
    const title=u.title ? `${u.name} — ${u.title}` : u.name;
    return `${grade}${grade?' · ':''}${title}`;
  });

  const title=`🆕 ${unitName} has been released`;
  const message=paths.length
    ? `New learning content is now being released: ${paths.join(' | ')}. Sign in to see what is available for your account.`
    : `${unitName} has been released on Pawn to Professor. Sign in to see what is available for your account.`;

  const {data:announcement,error:annError}=await admin.from('release_announcements')
    .insert({
      release_key:releaseKey,
      unit_number:unitNumber,
      title,
      message,
      created_by:auth.profile.id
    })
    .select()
    .single();

  if(annError) return json(res,500,{error:annError.message});

  // Everyone with an active account and a valid email gets the release announcement.
  // Unit entitlement is deliberately NOT checked here.
  const {data:profiles,error:profileError}=await admin.from('profiles')
    .select('id,username,display_name,contact_email,status,expires_at')
    .eq('status','active');

  if(profileError) return json(res,500,{error:profileError.message});

  const recipients=(profiles||[]).filter(p=>{
    const email=String(p.contact_email||'').trim();
    const notExpired=!p.expires_at || new Date(p.expires_at)>new Date();
    return email.includes('@') && notExpired;
  });

  const portal=process.env.PORTAL_BASE_URL||'https://www.pawntoprofessor.com';
  let sent=0,failed=0;

  if(emailConfigured()){
    for(let i=0;i<recipients.length;i+=5){
      const chunk=recipients.slice(i,i+5);
      const results=await Promise.allSettled(chunk.map(async p=>{
        const name=p.display_name||p.username||'Teacher';
        const subject=`Pawn to Professor — ${unitName} has been released`;
        const text=[
          `Hello ${name},`,
          '',
          `${unitName} has been released on Pawn to Professor.`,
          '',
          message,
          '',
          'This is a release announcement. Availability depends on your current account access.',
          '',
          `Open Pawn to Professor: ${portal}`
        ].join('\n');

        const html=`
          <div style="font-family:Arial,sans-serif;line-height:1.55;color:#1f2937">
            <h2>🆕 ${esc(unitName)} has been released</h2>
            <p>Hello ${esc(name)},</p>
            <p>${esc(message)}</p>
            <p><strong>This is a release announcement.</strong> Availability depends on your current account access.</p>
            <p><a href="${esc(portal)}" style="display:inline-block;padding:11px 16px;background:#0f5a42;color:#fff;text-decoration:none;border-radius:8px">Open Learning Hub</a></p>
          </div>`;
        await sendEmail({to:p.contact_email,subject,text,html});
        return p;
      }));

      for(let j=0;j<results.length;j++){
        const result=results[j];
        const p=chunk[j];
        if(result.status==='fulfilled') sent++; else failed++;
        try{
          await admin.from('email_notification_log').insert({
            content_type:'unit_release_announcement',
            content_id:announcement.id,
            user_id:p.id,
            email:p.contact_email,
            status:result.status==='fulfilled'?'sent':'failed',
            error_message:result.status==='rejected'?String(result.reason?.message||result.reason||'Email failed').slice(0,500):null
          });
        }catch{}
      }
    }
  }

  try{
    await admin.from('audit_log').insert({
      actor_id:auth.profile.id,
      action:'unit_release_announced',
      entity_type:'release_announcement',
      entity_id:announcement.id,
      details:{unit_number:unitNumber,sent,failed,total_recipients:recipients.length}
    });
  }catch{}

  return json(res,200,{
    ok:true,
    announcement,
    sent,
    failed,
    eligible:recipients.length,
    emailConfigured:emailConfigured()
  });
}
