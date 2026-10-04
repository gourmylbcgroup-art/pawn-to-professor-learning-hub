import { createClient } from '@supabase/supabase-js';
import { sendEmail, emailConfigured } from './email.js';
import { json, getAuthenticatedProfile, activeProfile } from './security.js';

const TZ = 'Asia/Taipei';
const START_DATE = '2026-09-07';

function esc(v='') {
  return String(v).replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

function taipeiParts(date=new Date()) {
  const parts=new Intl.DateTimeFormat('en-US',{
    timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short'
  }).formatToParts(date);
  const m=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return {ymd:`${m.year}-${m.month}-${m.day}`,weekday:m.weekday};
}

function utcMs(ymd) {
  const [y,m,d]=String(ymd).split('-').map(Number);
  return Date.UTC(y,m-1,d);
}

function daysBetween(a,b) {
  return Math.round((utcMs(b)-utcMs(a))/86400000);
}

function addDays(ymd,days) {
  return new Date(utcMs(ymd)+days*86400000).toISOString().slice(0,10);
}

function currentWeek(ymd) {
  const diff=daysBetween(START_DATE,ymd);
  return diff<0 ? 0 : Math.floor(diff/7)+1;
}

function weekRange(week) {
  if(!week||week<1)return '';
  const start=addDays(START_DATE,(week-1)*7);
  return `${start} to ${addDays(start,6)}`;
}

function unitName(n){return `Unit ${Number(n)}`;}

async function authorizedManualRun(admin,req) {
  const auth=await getAuthenticatedProfile(admin,req);
  if(auth.error)return {error:auth.error,status:401};
  if(!activeProfile(auth.profile)||!['admin','owner'].includes(auth.profile.role)){
    return {error:'Administrator or owner access required.',status:403};
  }
  return {auth};
}

async function reminderAlreadyLogged(admin,key) {
  const {data}=await admin.from('curriculum_reminder_history')
    .select('id').eq('reminder_key',key).maybeSingle();
  return Boolean(data?.id);
}

async function insertHistory(admin,event,sentTo,status,details={}) {
  await admin.from('curriculum_reminder_history').upsert({
    reminder_key:event.key,
    reminder_type:event.type,
    week_number:event.week||null,
    unit_number:event.unit||null,
    grade_number:event.grade||null,
    subject:event.subject,
    sent_to:sentTo,
    status,
    details,
    sent_at:new Date().toISOString()
  },{onConflict:'reminder_key'});
}

async function getReleasedUnits(admin) {
  const {data,error}=await admin.rpc('list_paid_unit_releases');
  if(error)return new Set();
  return new Set((data||[]).map(r=>String(r.unit_name||'').trim().toLowerCase()));
}

function globalReleaseRows(schedule) {
  const map=new Map();
  for(const row of schedule||[]){
    const n=Number(row.unit_number);
    if(n<=1)continue;
    if(!map.has(n))map.set(n,[]);
    map.get(n).push(row);
  }
  return [...map.entries()].map(([unit,rows])=>{
    rows.sort((a,b)=>String(a.unlock_date).localeCompare(String(b.unlock_date)));
    const earliestStart=[...rows].sort((a,b)=>String(a.start_date).localeCompare(String(b.start_date)))[0];
    return {
      unit,
      unlock_date:rows[0].unlock_date,
      start_date:earliestStart.start_date,
      grades:rows.map(r=>`G${r.grade_number}`).join(', ')
    };
  }).sort((a,b)=>a.unit-b.unit);
}

export default async function handler(req,res) {
  if(!['GET','POST'].includes(req.method))return json(res,405,{error:'Method not allowed'});

  const url=process.env.SUPABASE_URL;
  const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!secret)return json(res,500,{error:'Server configuration is incomplete.'});

  const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});

  if(req.method==='GET'){
    const cronSecret=process.env.CRON_SECRET;
    const authHeader=String(req.headers.authorization||'');
    if(!cronSecret||authHeader!==`Bearer ${cronSecret}`){
      return json(res,401,{error:'Unauthorized cron request.'});
    }
  }else{
    const check=await authorizedManualRun(admin,req);
    if(check.error)return json(res,check.status,{error:check.error});
  }

  const {data:settings}=await admin.from('curriculum_settings').select('*').eq('id',1).maybeSingle();
  if(settings?.email_reminders_enabled===false){
    return json(res,200,{ok:true,events:0,message:'Curriculum email reminders are disabled.'});
  }

  const {data:portalSettings}=await admin.from('portal_settings')
    .select('email_notifications_enabled').eq('id',1).maybeSingle();
  if(portalSettings?.email_notifications_enabled===false){
    return json(res,200,{ok:true,events:0,message:'Portal email notifications are disabled.'});
  }
  if(!emailConfigured()){
    return json(res,503,{error:'Email is not configured. Add RESEND_API_KEY and EMAIL_FROM in Vercel.'});
  }

  const todayInfo=taipeiParts();
  const today=todayInfo.ymd;
  const week=currentWeek(today);

  const {data:schedule,error:scheduleError}=await admin.from('curriculum_schedule')
    .select('*').eq('school_year_label','2026').eq('semester','fall');
  if(scheduleError)return json(res,500,{error:scheduleError.message});

  const released=await getReleasedUnits(admin);
  const events=[];

  // Sunday: next week is coming.
  if(todayInfo.weekday==='Sun'){
    const nextWeek=week+1;
    if(nextWeek>=1&&nextWeek<=16){
      events.push({
        key:`curriculum-upcoming-week-${nextWeek}`,
        type:'week_coming',
        week:nextWeek,
        subject:`Pawn to Professor — Curriculum Week ${nextWeek} starts tomorrow`,
        lines:[
          `Curriculum Week ${nextWeek} starts tomorrow.`,
          `Dates: ${weekRange(nextWeek)}.`
        ]
      });
    }
  }

  // Monday: current week begins.
  if(todayInfo.weekday==='Mon'&&week>=1&&week<=16){
    const active=(schedule||[]).filter(r=>week>=Number(r.start_week)&&week<=Number(r.end_week));
    events.push({
      key:`curriculum-week-start-${week}`,
      type:'week_start',
      week,
      subject:`Pawn to Professor — Curriculum Week ${week}`,
      lines:[
        `Curriculum Week ${week} starts today.`,
        `Dates: ${weekRange(week)}.`,
        '',
        ...active.map(r=>`Grade ${r.grade_number} — Unit ${r.unit_number}: ${r.unit_theme}`)
      ]
    });
  }

  // Paid releases: due on the recommended date, then daily overdue until released.
  for(const row of globalReleaseRows(schedule)){
    if(released.has(unitName(row.unit).toLowerCase()))continue;
    const diff=daysBetween(row.unlock_date,today);
    if(diff===0){
      events.push({
        key:`curriculum-release-due-unit-${row.unit}-${today}`,
        type:'unit_release_due',
        unit:row.unit,
        subject:`ACTION — Unlock ${unitName(row.unit)} today`,
        lines:[
          `${unitName(row.unit)} is due to be unlocked today.`,
          `Grades using this Unit: ${row.grades}.`,
          `Earliest teaching start: ${row.start_date}.`
        ]
      });
    }else if(diff>0){
      events.push({
        key:`curriculum-release-overdue-unit-${row.unit}-${today}`,
        type:'unit_release_overdue',
        unit:row.unit,
        subject:`OVERDUE — ${unitName(row.unit)} should be unlocked`,
        lines:[
          `${unitName(row.unit)} should already be unlocked.`,
          `Recommended unlock date: ${row.unlock_date}.`,
          `Earliest teaching start: ${row.start_date}.`,
          `Grades using this Unit: ${row.grades}.`
        ]
      });
    }
  }

  const fresh=[];
  for(const e of events){
    if(!(await reminderAlreadyLogged(admin,e.key)))fresh.push(e);
  }
  if(!fresh.length)return json(res,200,{ok:true,events:0});

  const {data:admins,error:adminsError}=await admin.from('profiles')
    .select('id,username,display_name,contact_email,role,status')
    .in('role',['admin','owner'])
    .eq('status','active');
  if(adminsError)return json(res,500,{error:adminsError.message});

  const recipients=(admins||[]).filter(a=>String(a.contact_email||'').includes('@'));
  if(!recipients.length)return json(res,409,{error:'No active Admin/Owner account has a valid contact email.'});

  const portal=process.env.PORTAL_BASE_URL||'https://www.pawntoprofessor.com';
  let processed=0;

  for(const event of fresh){
    const sentTo=[];
    const failures=[];

    for(const adminUser of recipients){
      const greeting=adminUser.display_name||adminUser.username||'Admin';
      const text=[
        `Hello ${greeting},`,
        '',
        ...event.lines,
        '',
        `Open Pawn to Professor: ${portal}`,
        'Admin → Curriculum Manager'
      ].join('\n');

      const html=`
        <div style="font-family:Arial,sans-serif;line-height:1.55;color:#1f2937">
          <h2>${esc(event.subject)}</h2>
          <p>Hello ${esc(greeting)},</p>
          ${event.lines.map(line=>line?`<p>${esc(line)}</p>`:'<br>').join('')}
          <p><a href="${esc(portal)}" style="display:inline-block;padding:11px 16px;background:#0f5a42;color:#fff;text-decoration:none;border-radius:8px">Open Curriculum Manager</a></p>
          <p style="font-size:12px;color:#666">Admin → Curriculum Manager</p>
        </div>`;

      try{
        await sendEmail({to:adminUser.contact_email,subject:event.subject,text,html});
        sentTo.push(adminUser.contact_email);
      }catch(err){
        failures.push({email:adminUser.contact_email,error:String(err?.message||err).slice(0,300)});
      }
    }

    const status=failures.length===0?'sent':sentTo.length?'partial':'failed';
    await insertHistory(admin,event,sentTo,status,{failures});
    processed++;
  }

  return json(res,200,{ok:true,events:processed});
}
