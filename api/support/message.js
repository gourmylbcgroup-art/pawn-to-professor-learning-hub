import { createClient } from '@supabase/supabase-js';
import { json, getAuthenticatedProfile, activeProfile } from '../_lib/security.js';
import { enforceRateLimit } from '../_lib/rate-limit.js';
import { sendEmail, emailConfigured } from '../_lib/email.js';

const PRIMARY_ADMIN_EMAIL = 'stephane@alphagenus.com';

function clean(value, max = 8000) {
  return String(value || '').trim().slice(0, max);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
}

function labelCategory(category) {
  return {
    general: 'General',
    access_payment: 'Access / Payment',
    technical: 'Technical',
    account: 'Account',
    welcome: 'Welcome',
    other: 'Other'
  }[category] || 'General';
}

async function logEmail(admin, { threadId, userId = null, email, status, error = null, type = 'support_message' }) {
  try {
    await admin.from('email_notification_log').insert({
      content_type: type,
      content_id: threadId,
      user_id: userId,
      email,
      status,
      error_message: error ? String(error).slice(0, 500) : null
    });
  } catch {
    // Email logging must never break messaging.
  }
}

async function getSettings(admin) {
  const { data } = await admin
    .from('portal_settings')
    .select('support_email_notifications_enabled')
    .eq('id', 1)
    .maybeSingle();

  return {
    enabled: data?.support_email_notifications_enabled !== false
  };
}

async function adminRecipients(admin) {
  const map = new Map();

  map.set(PRIMARY_ADMIN_EMAIL.toLowerCase(), {
    id: null,
    email: PRIMARY_ADMIN_EMAIL,
    name: 'Stéphane'
  });

  const { data } = await admin
    .from('profiles')
    .select('id,username,display_name,contact_email,role,status,expires_at')
    .in('role', ['admin','owner'])
    .eq('status', 'active');

  for (const person of data || []) {
    const email = String(person.contact_email || '').trim().toLowerCase();
    if (!validEmail(email)) continue;
    if (person.expires_at && new Date(person.expires_at) <= new Date()) continue;

    map.set(email, {
      id: person.id,
      email,
      name: person.display_name || person.username || 'Administrator'
    });
  }

  return [...map.values()];
}

async function notifyAdmins(admin, thread, member, body) {
  const settings = await getSettings(admin);
  if (!settings.enabled) return;
  const recipients = await adminRecipients(admin);
  const portal = process.env.PORTAL_BASE_URL || 'https://learn.pawntoprofessor.com';
  const category = labelCategory(thread.category);
  const subject = `New Pawn to Professor message — ${category}`;

  const text = [
    'Pawn to Professor',
    '',
    'A member sent a private message to Admin.',
    '',
    `From: ${member.display_name || member.username}`,
    `Username: ${member.username}`,
    `Account type: ${member.member_type || 'Member'}`,
    `Category: ${category}`,
    `Subject: ${thread.subject}`,
    '',
    body,
    '',
    `Open Admin Messages: ${portal}`,
    '',
    'Go to Admin → Messages to reply.'
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#1f2937">
      <h2>New private member message</h2>
      <p><strong>From:</strong> ${esc(member.display_name || member.username)} (${esc(member.username)})</p>
      <p><strong>Account:</strong> ${esc(member.member_type || 'Member')}</p>
      <p><strong>Category:</strong> ${esc(category)}</p>
      <p><strong>Subject:</strong> ${esc(thread.subject)}</p>
      <div style="padding:12px 14px;background:#f3f4f6;border-radius:8px;white-space:pre-wrap">${esc(body)}</div>
      <p style="margin-top:18px"><a href="${esc(portal)}" style="display:inline-block;padding:11px 16px;background:#0f5a42;color:#fff;text-decoration:none;border-radius:8px">Open Admin Messages</a></p>
    </div>`;

  for (const recipient of recipients) {
    if (!emailConfigured()) {
      await logEmail(admin, {
        threadId: thread.id,
        userId: recipient.id,
        email: recipient.email,
        status: 'skipped',
        error: 'Email is not configured.'
      });
      continue;
    }

    try {
      await sendEmail({ to: recipient.email, subject, text, html });
      await logEmail(admin, {
        threadId: thread.id,
        userId: recipient.id,
        email: recipient.email,
        status: 'sent'
      });
    } catch (err) {
      await logEmail(admin, {
        threadId: thread.id,
        userId: recipient.id,
        email: recipient.email,
        status: 'failed',
        error: err?.message || err
      });
    }
  }
}

async function notifyMember(admin, thread, member, body) {
  const settings = await getSettings(admin);
  if (!settings.enabled) return;

  const email = String(member.contact_email || '').trim();
  if (!validEmail(email)) return;

  const portal = process.env.PORTAL_BASE_URL || 'https://learn.pawntoprofessor.com';
  const subject = `Pawn to Professor — Admin replied: ${thread.subject}`;

  const text = [
    `Hello ${member.display_name || member.username},`,
    '',
    'You have a new private reply from Pawn to Professor Admin.',
    '',
    body,
    '',
    `Read and reply: ${portal}`,
    '',
    'Open My Messages after signing in.'
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#1f2937">
      <p>Hello ${esc(member.display_name || member.username)},</p>
      <p>You have a new private reply from <strong>Pawn to Professor Admin</strong>.</p>
      <p><strong>${esc(thread.subject)}</strong></p>
      <div style="padding:12px 14px;background:#f3f4f6;border-radius:8px;white-space:pre-wrap">${esc(body)}</div>
      <p style="margin-top:18px"><a href="${esc(portal)}" style="display:inline-block;padding:11px 16px;background:#0f5a42;color:#fff;text-decoration:none;border-radius:8px">Open My Messages</a></p>
    </div>`;

  if (!emailConfigured()) {
    return logEmail(admin, {
      threadId: thread.id,
      userId: member.id,
      email,
      status: 'skipped',
      error: 'Email is not configured.'
    });
  }

  try {
    await sendEmail({ to: email, subject, text, html });
    await logEmail(admin, {
      threadId: thread.id,
      userId: member.id,
      email,
      status: 'sent'
    });
  } catch (err) {
    await logEmail(admin, {
      threadId: thread.id,
      userId: member.id,
      email,
      status: 'failed',
      error: err?.message || err
    });
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) return json(res, 500, { error: 'Server configuration is incomplete.' });

  const admin = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const auth = await getAuthenticatedProfile(admin, req);
  if (auth.error) return json(res, 401, { error: auth.error });
  if (!activeProfile(auth.profile)) return json(res, 403, { error: 'Active account required.' });

  const rate = await enforceRateLimit({
    admin,
    req,
    res,
    scope: 'support-message',
    userId: auth.profile.id,
    windowSeconds: 600,
    maxHits: 60
  });
  if (!rate.allowed) return json(res, 429, { error: 'Too many message actions. Please wait and try again.' });

  const action = clean(req.body?.action, 40);
  const staff = ['admin','owner'].includes(auth.profile.role);

  if (action === 'new_thread') {
    if (staff) return json(res, 400, { error: 'Use an existing member thread from Admin Messages.' });

    const category = clean(req.body?.category, 40);
    const subject = clean(req.body?.subject, 180);
    const body = clean(req.body?.body, 8000);
    const context = req.body?.context && typeof req.body.context === 'object' ? req.body.context : {};

    if (!['general','access_payment','technical','account','other'].includes(category)) {
      return json(res, 400, { error: 'Choose a valid message category.' });
    }
    if (subject.length < 3) return json(res, 400, { error: 'Add a short subject.' });
    if (!body) return json(res, 400, { error: 'Write a message before sending.' });

    const { data: thread, error: threadError } = await admin
      .from('support_threads')
      .insert({
        member_id: auth.profile.id,
        category,
        subject,
        status: 'new',
        context,
        created_by: auth.profile.id,
        admin_unread_count: 1,
        member_unread_count: 0,
        last_message_at: new Date().toISOString()
      })
      .select()
      .single();

    if (threadError) return json(res, 400, { error: threadError.message });

    const { error: messageError } = await admin
      .from('support_messages')
      .insert({
        thread_id: thread.id,
        sender_id: auth.profile.id,
        sender_kind: 'member',
        body
      });

    if (messageError) {
      await admin.from('support_threads').delete().eq('id', thread.id);
      return json(res, 400, { error: messageError.message });
    }

    await admin.from('audit_log').insert({
      actor_id: auth.profile.id,
      action: 'support_thread_created',
      entity_type: 'support_thread',
      entity_id: thread.id,
      details: { category, subject }
    }).catch(() => {});

    notifyAdmins(admin, thread, auth.profile, body).catch(() => {});

    return json(res, 200, { ok: true, threadId: thread.id });
  }

  if (action === 'reply') {
    const threadId = clean(req.body?.threadId, 80);
    const body = clean(req.body?.body, 8000);
    if (!threadId || !body) return json(res, 400, { error: 'Thread and message are required.' });

    const { data: thread, error: threadError } = await admin
      .from('support_threads')
      .select('*')
      .eq('id', threadId)
      .maybeSingle();

    if (threadError || !thread) return json(res, 404, { error: 'Message thread not found.' });
    if (!staff && thread.member_id !== auth.profile.id) return json(res, 403, { error: 'This conversation is private.' });

    const senderKind = staff ? 'admin' : 'member';
    const { error: messageError } = await admin
      .from('support_messages')
      .insert({
        thread_id: thread.id,
        sender_id: auth.profile.id,
        sender_kind: senderKind,
        body
      });

    if (messageError) return json(res, 400, { error: messageError.message });

    const patch = {
      last_message_at: new Date().toISOString()
    };

    if (staff) {
      patch.member_unread_count = Number(thread.member_unread_count || 0) + 1;
      patch.admin_unread_count = 0;
    } else {
      patch.admin_unread_count = Number(thread.admin_unread_count || 0) + 1;
      patch.member_unread_count = 0;
      if (thread.status === 'closed') patch.status = 'new';
    }

    await admin.from('support_threads').update(patch).eq('id', thread.id);

    const { data: member } = await admin
      .from('profiles')
      .select('id,username,display_name,contact_email,member_type')
      .eq('id', thread.member_id)
      .maybeSingle();

    if (staff && member) notifyMember(admin, thread, member, body).catch(() => {});
    if (!staff) notifyAdmins(admin, thread, auth.profile, body).catch(() => {});

    return json(res, 200, { ok: true });
  }

  if (action === 'mark_read') {
    const threadId = clean(req.body?.threadId, 80);
    if (!threadId) return json(res, 400, { error: 'Missing thread.' });

    const { data: thread } = await admin
      .from('support_threads')
      .select('id,member_id')
      .eq('id', threadId)
      .maybeSingle();

    if (!thread) return json(res, 404, { error: 'Message thread not found.' });
    if (!staff && thread.member_id !== auth.profile.id) return json(res, 403, { error: 'This conversation is private.' });

    await admin
      .from('support_threads')
      .update(staff ? { admin_unread_count: 0 } : { member_unread_count: 0 })
      .eq('id', thread.id);

    return json(res, 200, { ok: true });
  }

  if (action === 'set_status') {
    if (!staff) return json(res, 403, { error: 'Administrator access required.' });

    const threadId = clean(req.body?.threadId, 80);
    const status = clean(req.body?.status, 40);
    const allowed = ['new','awaiting_payment','payment_received','access_granted','closed'];

    if (!threadId || !allowed.includes(status)) {
      return json(res, 400, { error: 'Choose a valid message status.' });
    }

    const { error } = await admin
      .from('support_threads')
      .update({ status })
      .eq('id', threadId);

    if (error) return json(res, 400, { error: error.message });

    await admin.from('audit_log').insert({
      actor_id: auth.profile.id,
      action: 'support_status_changed',
      entity_type: 'support_thread',
      entity_id: threadId,
      details: { status }
    }).catch(() => {});

    return json(res, 200, { ok: true });
  }

  return json(res, 400, { error: 'Unknown message action.' });
}
