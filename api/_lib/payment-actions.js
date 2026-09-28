import { json, getAuthenticatedProfile, activeProfile } from './security.js';
import { enforceRateLimit } from './rate-limit.js';
import { sendEmail, emailConfigured } from './email.js';

function clean(v='', max=1000) {
  return String(v || '').trim().slice(0,max);
}

function validEmail(v='') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
}

function esc(v='') {
  return String(v).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

function currencyAmount(amount, currency='TWD') {
  const n = Number(amount || 0);
  try {
    return new Intl.NumberFormat('en-US', {
      style:'currency',
      currency:String(currency || 'TWD').toUpperCase(),
      maximumFractionDigits:String(currency || '').toUpperCase()==='TWD' ? 0 : 2
    }).format(n);
  } catch {
    return `${String(currency || 'TWD').toUpperCase()} ${n.toFixed(2)}`;
  }
}

async function logEmail(admin, { contentType, contentId, userId, email, status, error=null }) {
  try {
    await admin.from('email_notification_log').insert({
      content_type: contentType,
      content_id: contentId,
      user_id: userId || null,
      email: email || null,
      status,
      error_message: error ? String(error).slice(0,500) : null
    });
  } catch {}
}

async function requireStaff(admin, req, res, scope) {
  const auth = await getAuthenticatedProfile(admin, req);
  if (auth.error) {
    json(res,401,{error:auth.error});
    return null;
  }
  if (!activeProfile(auth.profile) || !['admin','owner'].includes(auth.profile.role)) {
    json(res,403,{error:'Administrator or owner access required.'});
    return null;
  }

  const rate = await enforceRateLimit({
    admin, req, res,
    scope,
    userId:auth.profile.id,
    windowSeconds:600,
    maxHits:80
  });
  if (!rate.allowed) {
    json(res,429,{error:'Too many payment actions. Please wait and try again.'});
    return null;
  }
  return auth;
}

async function sendActivationEmail(admin, member, payment, period) {
  const email = String(member.contact_email || '').trim();
  if (!validEmail(email)) return;

  const portal = process.env.PORTAL_BASE_URL || 'https://learn.pawntoprofessor.com';
  const formattedAmount = currencyAmount(payment.amount, payment.currency);
  const start = new Date(period.starts_at).toLocaleDateString('en-GB');
  const end = new Date(period.ends_at).toLocaleDateString('en-GB');

  const subject = 'Pawn to Professor — your one-year access is active';
  const text = [
    `Hello ${member.display_name || member.username},`,
    '',
    'Thank you. Your Pawn to Professor annual access is now active.',
    '',
    `Plan: ${period.plan_name}`,
    `Payment recorded: ${formattedAmount}`,
    `Access starts: ${start}`,
    `Access valid until: ${end}`,
    '',
    'Your renewal price may be different next year. The current renewal price will be confirmed before any renewal payment.',
    '',
    `Open Pawn to Professor: ${portal}`
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#1f2937">
      <h2>✅ Your annual access is active</h2>
      <p>Hello ${esc(member.display_name || member.username)},</p>
      <p>Thank you. Your Pawn to Professor annual access is now active.</p>
      <table style="border-collapse:collapse;margin:14px 0">
        <tr><td style="padding:4px 16px 4px 0"><strong>Plan</strong></td><td>${esc(period.plan_name)}</td></tr>
        <tr><td style="padding:4px 16px 4px 0"><strong>Payment recorded</strong></td><td>${esc(formattedAmount)}</td></tr>
        <tr><td style="padding:4px 16px 4px 0"><strong>Starts</strong></td><td>${esc(start)}</td></tr>
        <tr><td style="padding:4px 16px 4px 0"><strong>Valid until</strong></td><td>${esc(end)}</td></tr>
      </table>
      <p>Your renewal price may be different next year. The current renewal price will be confirmed before any renewal payment.</p>
      <p><a href="${esc(portal)}" style="display:inline-block;padding:11px 16px;background:#0f5a42;color:#fff;text-decoration:none;border-radius:8px">Start Learning</a></p>
    </div>`;

  if (!emailConfigured()) {
    await logEmail(admin,{
      contentType:'annual_access_activation',
      contentId:payment.id,
      userId:member.id,
      email,
      status:'skipped',
      error:'Email is not configured.'
    });
    return;
  }

  try {
    await sendEmail({to:email,subject,text,html});
    await logEmail(admin,{
      contentType:'annual_access_activation',
      contentId:payment.id,
      userId:member.id,
      email,
      status:'sent'
    });
  } catch (err) {
    await logEmail(admin,{
      contentType:'annual_access_activation',
      contentId:payment.id,
      userId:member.id,
      email,
      status:'failed',
      error:err?.message || err
    });
  }
}

export async function handleRecordAnnualPayment({req,res,admin}) {
  if (req.method !== 'POST') return json(res,405,{error:'Method not allowed'});
  const auth = await requireStaff(admin,req,res,'record-annual-payment');
  if (!auth) return;

  const userId = clean(req.body?.userId,80);
  const amount = Number(req.body?.amount);
  const currency = clean(req.body?.currency || 'TWD',8).toUpperCase();
  const paymentMethod = clean(req.body?.paymentMethod || 'Other',120);
  const paidOn = clean(req.body?.paidOn,20);
  const paymentKind = clean(req.body?.paymentKind || 'new',20);
  const planName = clean(req.body?.planName || 'Annual Access',120);
  const startMode = clean(req.body?.startMode || 'now',30);
  const accessStartAt = clean(req.body?.accessStartAt,60) || null;
  const reference = clean(req.body?.reference,240) || null;
  const note = clean(req.body?.note,1000) || null;
  const supportThreadId = clean(req.body?.supportThreadId,80) || null;
  const sendEmailToMember = req.body?.sendEmail !== false;

  if (!userId) return json(res,400,{error:'Choose a member.'});
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000) {
    return json(res,400,{error:'Enter a valid payment amount greater than zero.'});
  }
  if (!['new','renewal'].includes(paymentKind)) {
    return json(res,400,{error:'Choose New payment or Renewal.'});
  }
  if (!['now','after_current'].includes(startMode)) {
    return json(res,400,{error:'Choose a valid access start mode.'});
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) {
    return json(res,400,{error:'Choose the payment date.'});
  }

  const {data:member,error:memberError} = await admin
    .from('profiles')
    .select('id,username,display_name,contact_email,member_type,role,status')
    .eq('id',userId)
    .maybeSingle();

  if (memberError || !member || member.role !== 'user') {
    return json(res,404,{error:'Member account not found.'});
  }

  const {data:rpcRows,error:rpcError} = await admin.rpc('record_annual_payment',{
    target_user:userId,
    amount_input:amount,
    currency_input:currency,
    payment_method_input:paymentMethod,
    paid_on_input:paidOn,
    payment_kind_input:paymentKind,
    plan_name_input:planName,
    start_mode_input:startMode,
    access_start_input:accessStartAt,
    reference_input:reference,
    note_input:note,
    actor_user:auth.profile.id,
    support_thread_input:supportThreadId
  });

  if (rpcError) return json(res,400,{error:rpcError.message});

  const row = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
  if (!row?.payment_id || !row?.access_period_id) {
    return json(res,500,{error:'Payment was recorded but access confirmation could not be read.'});
  }

  const [{data:payment},{data:period}] = await Promise.all([
    admin.from('payment_records').select('*').eq('id',row.payment_id).single(),
    admin.from('annual_access_periods').select('*').eq('id',row.access_period_id).single()
  ]);

  try {
    await admin.from('audit_log').insert({
      actor_id:auth.profile.id,
      action:'annual_payment_recorded',
      entity_type:'payment_record',
      entity_id:row.payment_id,
      details:{
        user_id:userId,
        username:member.username,
        payment_kind:paymentKind,
        amount,
        currency,
        access_starts_at:row.access_starts_at,
        access_ends_at:row.access_ends_at
      }
    });
  } catch {}

  if (sendEmailToMember && payment && period) {
    await sendActivationEmail(admin,member,payment,period);
  }

  return json(res,200,{
    ok:true,
    payment,
    accessPeriod:period
  });
}

export async function handlePaymentAdjustment({req,res,admin}) {
  if (req.method !== 'POST') return json(res,405,{error:'Method not allowed'});
  const auth = await requireStaff(admin,req,res,'payment-adjustment');
  if (!auth) return;
  if (auth.profile.role !== 'owner') {
    return json(res,403,{error:'Only the Owner can record a refund/correction.'});
  }

  const originalPaymentId = clean(req.body?.originalPaymentId,80);
  const adjustmentKind = clean(req.body?.adjustmentKind,30);
  let amount = Number(req.body?.amount);
  const paymentMethod = clean(req.body?.paymentMethod || 'Adjustment',120);
  const paidOn = clean(req.body?.paidOn,20);
  const reference = clean(req.body?.reference,240) || null;
  const note = clean(req.body?.note,1000) || null;
  const cancelAccess = req.body?.cancelAccess === true;

  if (!originalPaymentId) return json(res,400,{error:'Choose the original payment.'});
  if (!['refund','correction'].includes(adjustmentKind)) {
    return json(res,400,{error:'Choose Refund or Correction.'});
  }
  if (!Number.isFinite(amount) || amount === 0) {
    return json(res,400,{error:'Enter the adjustment amount.'});
  }
  amount = -Math.abs(amount);

  const {data,error} = await admin.rpc('record_payment_adjustment',{
    original_payment_input:originalPaymentId,
    adjustment_kind_input:adjustmentKind,
    amount_input:amount,
    payment_method_input:paymentMethod,
    paid_on_input:paidOn,
    reference_input:reference,
    note_input:note,
    actor_user:auth.profile.id,
    cancel_access_input:cancelAccess
  });

  if (error) return json(res,400,{error:error.message});

  try {
    await admin.from('audit_log').insert({
      actor_id:auth.profile.id,
      action:'payment_adjustment_recorded',
      entity_type:'payment_record',
      entity_id:data,
      details:{
        original_payment_id:originalPaymentId,
        adjustment_kind:adjustmentKind,
        amount,
        cancel_access:cancelAccess
      }
    });
  } catch {}

  return json(res,200,{ok:true,adjustmentId:data});
}

async function upsertReminderLog(admin,{period,user,days,status,email,error=null}) {
  const payload = {
    access_period_id:period.id,
    user_id:user.id,
    reminder_days:days,
    email:email || null,
    status,
    error_message:error ? String(error).slice(0,500) : null,
    last_attempt_at:new Date().toISOString(),
    sent_at:status==='sent' ? new Date().toISOString() : null
  };

  const {data:existing} = await admin
    .from('renewal_notifications')
    .select('id,attempts')
    .eq('access_period_id',period.id)
    .eq('reminder_days',days)
    .maybeSingle();

  if (existing) {
    payload.attempts = Number(existing.attempts || 0) + 1;
    return admin.from('renewal_notifications').update(payload).eq('id',existing.id);
  }
  return admin.from('renewal_notifications').insert(payload);
}

async function createRenewalMailboxMessage(admin,{period,user,days}) {
  const subject = 'Annual access renewal reminder';
  const body =
    `Your Pawn to Professor annual access expires in ${days <= 7 ? 'about 7 days' : 'about 30 days'}.\n\n` +
    `Current access end date: ${new Date(period.ends_at).toLocaleDateString('en-GB')}.\n\n` +
    `If you would like to continue, please contact Admin to renew. ` +
    `Your renewal price may differ from the amount you paid previously. ` +
    `The current renewal price will be confirmed before payment.`;

  const {data:thread} = await admin
    .from('support_threads')
    .select('id,member_unread_count')
    .eq('member_id',user.id)
    .eq('category','access_payment')
    .contains('context',{annual_access_id:period.id})
    .limit(1)
    .maybeSingle();

  if (thread?.id) {
    await admin.from('support_messages').insert({
      thread_id:thread.id,
      sender_id:null,
      sender_kind:'system',
      body
    });
    await admin.from('support_threads').update({
      member_unread_count:Number(thread.member_unread_count || 0)+1,
      last_message_at:new Date().toISOString(),
      status:'new'
    }).eq('id',thread.id);
    return thread.id;
  }

  const {data:newThread,error} = await admin
    .from('support_threads')
    .insert({
      member_id:user.id,
      category:'access_payment',
      subject,
      status:'new',
      context:{annual_access_id:period.id,renewal_reminder:true},
      created_by:null,
      admin_unread_count:0,
      member_unread_count:1,
      last_message_at:new Date().toISOString()
    })
    .select()
    .single();

  if (error) return null;

  await admin.from('support_messages').insert({
    thread_id:newThread.id,
    sender_id:null,
    sender_kind:'system',
    body
  });

  return newThread.id;
}

async function sendRenewalEmail(admin,{period,user,days}) {
  const email = String(user.contact_email || '').trim();
  if (!validEmail(email)) return {status:'skipped',error:'Member has no valid contact email.'};

  const portal = process.env.PORTAL_BASE_URL || 'https://learn.pawntoprofessor.com';
  const expiry = new Date(period.ends_at).toLocaleDateString('en-GB');
  const windowText = days <= 7 ? '7 days' : '30 days';
  const subject = `Pawn to Professor — annual access expires in about ${windowText}`;

  const text = [
    `Hello ${user.display_name || user.username},`,
    '',
    `Your Pawn to Professor annual access expires in about ${windowText}.`,
    `Current access end date: ${expiry}.`,
    '',
    'If you would like to continue, contact Admin to renew.',
    'Your renewal price may differ from the amount you paid previously. The current renewal price will be confirmed before payment.',
    '',
    `Open Pawn to Professor: ${portal}`
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#1f2937">
      <h2>Annual access renewal reminder</h2>
      <p>Hello ${esc(user.display_name || user.username)},</p>
      <p>Your Pawn to Professor annual access expires in about <strong>${esc(windowText)}</strong>.</p>
      <p><strong>Current access end date:</strong> ${esc(expiry)}</p>
      <p>If you would like to continue, contact Admin to renew.</p>
      <p><strong>Your renewal price may differ from the amount you paid previously.</strong> The current renewal price will be confirmed before payment.</p>
      <p><a href="${esc(portal)}" style="display:inline-block;padding:11px 16px;background:#0f5a42;color:#fff;text-decoration:none;border-radius:8px">Contact Admin to Renew</a></p>
    </div>`;

  if (!emailConfigured()) return {status:'skipped',error:'Email is not configured.'};

  try {
    await sendEmail({to:email,subject,text,html});
    return {status:'sent',error:null};
  } catch (err) {
    return {status:'failed',error:err?.message || String(err)};
  }
}

export async function handleRenewalReminders({req,res,admin}) {
  if (req.method !== 'GET') return json(res,405,{error:'Method not allowed'});

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = String(req.headers.authorization || '');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return json(res,401,{error:'Unauthorized cron request.'});
  }

  const now = new Date();
  const horizon = new Date(now.getTime() + 31*86400000).toISOString();

  const {data:periods,error} = await admin
    .from('annual_access_periods')
    .select('*')
    .is('cancelled_at',null)
    .gt('ends_at',now.toISOString())
    .lte('ends_at',horizon)
    .order('ends_at',{ascending:false});

  if (error) return json(res,500,{error:error.message});

  // Keep only the latest paid period per user. An early renewal therefore
  // suppresses reminders for the previous period.
  const latestByUser = new Map();
  for (const period of periods || []) {
    if (!latestByUser.has(period.user_id)) latestByUser.set(period.user_id,period);
  }

  let sent=0, failed=0, skipped=0;

  for (const period of latestByUser.values()) {
    const ms = new Date(period.ends_at).getTime() - now.getTime();
    const remainingDays = ms / 86400000;
    const reminderDays = remainingDays <= 7.5 ? 7 : 30;

    const {data:existing} = await admin
      .from('renewal_notifications')
      .select('id,status')
      .eq('access_period_id',period.id)
      .eq('reminder_days',reminderDays)
      .maybeSingle();

    if (existing?.status === 'sent' || existing?.status === 'skipped') continue;

    const {data:user} = await admin
      .from('profiles')
      .select('id,username,display_name,contact_email,status,role')
      .eq('id',period.user_id)
      .maybeSingle();

    if (!user || user.role !== 'user' || user.status !== 'active') continue;

    await createRenewalMailboxMessage(admin,{period,user,days:reminderDays}).catch(()=>{});
    const result = await sendRenewalEmail(admin,{period,user,days:reminderDays});

    await upsertReminderLog(admin,{
      period,user,days:reminderDays,
      status:result.status,
      email:user.contact_email,
      error:result.error
    });

    if (result.status === 'sent') sent++;
    else if (result.status === 'failed') failed++;
    else skipped++;
  }

  // Keep subscription_status informative without controlling login.
  try {
    const {data:expiredPeriods} = await admin
      .from('annual_access_periods')
      .select('user_id,ends_at')
      .is('cancelled_at',null)
      .lte('ends_at',now.toISOString());

    const candidateUsers = [...new Set((expiredPeriods || []).map(p=>p.user_id))];
    for (const uid of candidateUsers) {
      const {count} = await admin
        .from('annual_access_periods')
        .select('*',{count:'exact',head:true})
        .eq('user_id',uid)
        .is('cancelled_at',null)
        .lte('starts_at',now.toISOString())
        .gt('ends_at',now.toISOString());

      if (!count) {
        await admin.from('profiles').update({subscription_status:'expired'}).eq('id',uid);
      }
    }
  } catch {}

  return json(res,200,{ok:true,sent,failed,skipped});
}
