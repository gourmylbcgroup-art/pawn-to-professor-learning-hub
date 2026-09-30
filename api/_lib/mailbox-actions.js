import { json, getAuthenticatedProfile, activeProfile } from './security.js';
import { enforceRateLimit } from './rate-limit.js';
import { sendEmail, emailConfigured } from './email.js';


const PRIMARY_ADMIN_EMAIL = 'stephane@alphagenus.com';
const MEMBER_MESSAGE_LIMIT = 100;

async function memberSentMessageCount(admin, userId) {
  const { count, error } = await admin
    .from('support_messages')
    .select('*', { count:'exact', head:true })
    .eq('sender_id', userId)
    .eq('sender_kind', 'member');

  if (error) throw error;
  return Number(count || 0);
}

async function enforceMemberMessageLimit(admin, userId) {
  const used = await memberSentMessageCount(admin, userId);
  return {
    used,
    limit: MEMBER_MESSAGE_LIMIT,
    allowed: used < MEMBER_MESSAGE_LIMIT
  };
}

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
  if (!settings.enabled) return { status: 'skipped', reason: 'Mailbox email notifications are disabled.' };

  const email = String(member.contact_email || '').trim();
  if (!validEmail(email)) return { status: 'skipped', reason: 'Member has no valid contact email.' };

  const portal = process.env.PORTAL_BASE_URL || 'https://learn.pawntoprofessor.com';
  const subject = `Pawn to Professor — Admin message: ${thread.subject}`;

  const text = [
    `Hello ${member.display_name || member.username},`,
    '',
    'You have a new private message from Pawn to Professor Admin.',
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
      <p>You have a new private message from <strong>Pawn to Professor Admin</strong>.</p>
      <p><strong>${esc(thread.subject)}</strong></p>
      <div style="padding:12px 14px;background:#f3f4f6;border-radius:8px;white-space:pre-wrap">${esc(body)}</div>
      <p style="margin-top:18px"><a href="${esc(portal)}" style="display:inline-block;padding:11px 16px;background:#0f5a42;color:#fff;text-decoration:none;border-radius:8px">Open My Messages</a></p>
    </div>`;

  if (!emailConfigured()) {
    await logEmail(admin, {
      threadId: thread.id,
      userId: member.id,
      email,
      status: 'skipped',
      error: 'Email is not configured.'
    });
    return { status: 'skipped', reason: 'Email is not configured.' };
  }

  try {
    await sendEmail({ to: email, subject, text, html });
    await logEmail(admin, {
      threadId: thread.id,
      userId: member.id,
      email,
      status: 'sent'
    });
    return { status: 'sent' };
  } catch (err) {
    await logEmail(admin, {
      threadId: thread.id,
      userId: member.id,
      email,
      status: 'failed',
      error: err?.message || err
    });
    return { status: 'failed', reason: err?.message || String(err) };
  }
}

export async function handleSupportMessage({ req, res, admin }) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

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


  if (action === 'admin_broadcast') {
    if (!staff) return json(res, 403, { error: 'Administrator access required.' });

    const audience = clean(req.body?.audience, 40);
    const category = clean(req.body?.category || 'general', 40);
    const subject = clean(req.body?.subject, 180);
    const body = clean(req.body?.body, 8000);
    const sendEmailCopy = req.body?.sendEmail !== false;
    const requestedIds = Array.isArray(req.body?.userIds)
      ? [...new Set(req.body.userIds.map(v => clean(v, 80)).filter(Boolean))]
      : [];

    if (!['one','selected','teachers','learners','all'].includes(audience)) {
      return json(res, 400, { error: 'Choose who should receive the message.' });
    }
    if (!['general','access_payment','technical','account','other'].includes(category)) {
      return json(res, 400, { error: 'Choose a valid message category.' });
    }
    if (subject.length < 3) return json(res, 400, { error: 'Add a short subject.' });
    if (!body) return json(res, 400, { error: 'Write a message before sending.' });

    let q = admin
      .from('profiles')
      .select('id,username,display_name,contact_email,member_type,role,status,expires_at')
      .eq('role', 'user')
      .eq('status', 'active');

    if (audience === 'teachers') q = q.eq('member_type', 'teacher');
    if (audience === 'learners') q = q.eq('member_type', 'learner');

    if (audience === 'one' || audience === 'selected') {
      if (!requestedIds.length) return json(res, 400, { error: 'Choose at least one member.' });
      q = q.in('id', audience === 'one' ? requestedIds.slice(0,1) : requestedIds.slice(0,200));
    }

    const { data: rawMembers, error: memberError } = await q.limit(200);
    if (memberError) return json(res, 400, { error: memberError.message });

    const now = new Date();
    const members = (rawMembers || []).filter(p =>
      !p.expires_at || new Date(p.expires_at) > now
    );

    if (!members.length) return json(res, 400, { error: 'No active recipients matched this selection.' });

    const broadcastId = globalThis.crypto?.randomUUID?.()
      || `broadcast-${Date.now()}-${auth.profile.id}`;

    const threadRows = members.map(member => ({
      member_id: member.id,
      category,
      subject,
      status: 'new',
      context: {
        admin_broadcast: true,
        broadcast_id: broadcastId,
        audience
      },
      created_by: auth.profile.id,
      admin_unread_count: 0,
      member_unread_count: 1,
      last_message_at: new Date().toISOString()
    }));

    const { data: threads, error: threadError } = await admin
      .from('support_threads')
      .insert(threadRows)
      .select('id,member_id,category,subject');

    if (threadError) return json(res, 400, { error: threadError.message });

    const messageRows = (threads || []).map(thread => ({
      thread_id: thread.id,
      sender_id: auth.profile.id,
      sender_kind: 'admin',
      body,
      delivered_at: new Date().toISOString()
    }));

    const { error: messageError } = await admin
      .from('support_messages')
      .insert(messageRows);

    if (messageError) {
      const ids = (threads || []).map(t => t.id);
      if (ids.length) await admin.from('support_threads').delete().in('id', ids);
      return json(res, 400, { error: messageError.message });
    }

    let emailSent = 0;
    let emailFailed = 0;
    let emailSkipped = 0;

    if (sendEmailCopy) {
      const memberMap = new Map(members.map(m => [m.id, m]));
      const threadList = threads || [];

      for (let i = 0; i < threadList.length; i += 10) {
        const batch = threadList.slice(i, i + 10);
        const results = await Promise.all(batch.map(async thread => {
          const member = memberMap.get(thread.member_id);
          if (!member) return { status: 'skipped' };
          return notifyMember(admin, thread, member, body);
        }));

        results.forEach(result => {
          if (result?.status === 'sent') emailSent += 1;
          else if (result?.status === 'failed') emailFailed += 1;
          else emailSkipped += 1;
        });
      }
    } else {
      emailSkipped = members.length;
    }

    try {
      await admin.from('audit_log').insert({
      actor_id: auth.profile.id,
      action: 'admin_private_message_sent',
      entity_type: 'support_broadcast',
      entity_id: null,
      details: {
        broadcast_id: broadcastId,
        audience,
        recipients: members.length,
        subject,
        email_requested: sendEmailCopy,
        email_sent: emailSent,
        email_failed: emailFailed,
        email_skipped: emailSkipped
      }
    });
    } catch {
      // Audit logging must never break the completed mailbox action.
    }

    return json(res, 200, {
      ok: true,
      broadcastId,
      recipientCount: members.length,
      mailboxDelivered: members.length,
      emailSent,
      emailFailed,
      emailSkipped
    });
  }

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

    const quota = await enforceMemberMessageLimit(admin, auth.profile.id);
    if (!quota.allowed) {
      return json(res, 429, {
        error: `You have used all ${MEMBER_MESSAGE_LIMIT} messages. Delete one of your sent messages to send another.`,
        messageLimit: MEMBER_MESSAGE_LIMIT,
        messagesUsed: quota.used
      });
    }

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

    try {
      await admin.from('audit_log').insert({
      actor_id: auth.profile.id,
      action: 'support_thread_created',
      entity_type: 'support_thread',
      entity_id: thread.id,
      details: { category, subject }
    });
    } catch {
      // Audit logging must never break the completed mailbox action.
    }

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

    if (!staff) {
      const quota = await enforceMemberMessageLimit(admin, auth.profile.id);
      if (!quota.allowed) {
        return json(res, 429, {
          error: `You have used all ${MEMBER_MESSAGE_LIMIT} messages. Delete one of your sent messages to send another.`,
          messageLimit: MEMBER_MESSAGE_LIMIT,
          messagesUsed: quota.used
        });
      }
    }

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

    const readAt = new Date().toISOString();

    await admin
      .from('support_threads')
      .update(staff ? { admin_unread_count: 0 } : { member_unread_count: 0 })
      .eq('id', thread.id);

    let messageQuery = admin
      .from('support_messages')
      .update({
        read_at: readAt,
        read_by: auth.profile.id
      })
      .eq('thread_id', thread.id)
      .is('read_at', null);

    if (staff) {
      messageQuery = messageQuery.eq('sender_kind', 'member');
    } else {
      messageQuery = messageQuery.in('sender_kind', ['admin','system']);
    }

    await messageQuery;

    return json(res, 200, { ok: true, readAt });
  }

  if (action === 'delete_message') {
    const messageId = clean(req.body?.messageId, 80);
    if (!messageId) return json(res, 400, { error: 'Missing message.' });

    const { data: message, error: messageError } = await admin
      .from('support_messages')
      .select('id,thread_id,sender_id,sender_kind,created_at,read_at')
      .eq('id', messageId)
      .maybeSingle();

    if (messageError || !message) {
      return json(res, 404, { error: 'Message not found.' });
    }

    const { data: thread, error: threadError } = await admin
      .from('support_threads')
      .select('id,member_id,subject,category')
      .eq('id', message.thread_id)
      .maybeSingle();

    if (threadError || !thread) {
      return json(res, 404, { error: 'Conversation not found.' });
    }

    // Admin/Owner may delete any mailbox message.
    // Normal members may delete ONLY a message that they personally sent.
    if (!staff) {
      const ownsThread = thread.member_id === auth.profile.id;
      const ownsMessage = message.sender_id === auth.profile.id && message.sender_kind === 'member';

      if (!ownsThread || !ownsMessage) {
        return json(res, 403, {
          error: 'You can delete only messages that you sent.'
        });
      }
    }

    const { error: deleteError } = await admin
      .from('support_messages')
      .delete()
      .eq('id', messageId);

    if (deleteError) return json(res, 400, { error: deleteError.message });

    const { data: remaining, error: remainingError } = await admin
      .from('support_messages')
      .select('id,created_at,sender_kind,read_at')
      .eq('thread_id', message.thread_id)
      .order('created_at', { ascending:false });

    if (remainingError) {
      return json(res, 500, {
        error: 'Message was deleted, but the conversation could not be refreshed.'
      });
    }

    let threadDeleted = false;

    if (!remaining?.length) {
      const { error: threadDeleteError } = await admin
        .from('support_threads')
        .delete()
        .eq('id', message.thread_id);

      if (threadDeleteError) {
        return json(res, 400, { error: threadDeleteError.message });
      }
      threadDeleted = true;
    } else {
      const adminUnread = remaining.filter(
        m => m.sender_kind === 'member' && !m.read_at
      ).length;

      const memberUnread = remaining.filter(
        m => ['admin','system'].includes(m.sender_kind) && !m.read_at
      ).length;

      await admin
        .from('support_threads')
        .update({
          last_message_at: remaining[0].created_at,
          admin_unread_count: adminUnread,
          member_unread_count: memberUnread
        })
        .eq('id', message.thread_id);
    }

    try {
      await admin.from('audit_log').insert({
        actor_id: auth.profile.id,
        action: staff ? 'support_message_deleted' : 'member_support_message_deleted',
        entity_type: 'support_message',
        entity_id: messageId,
        details: {
          thread_id: message.thread_id,
          sender_kind: message.sender_kind,
          deleted_by_role: auth.profile.role
        }
      });
    } catch {
      // Audit logging must never break a completed delete.
    }

    let messagesUsed = null;
    if (!staff) {
      try {
        messagesUsed = await memberSentMessageCount(admin, auth.profile.id);
      } catch {}
    }

    return json(res, 200, {
      ok: true,
      deletedMessageId: messageId,
      threadDeleted,
      messagesUsed,
      messageLimit: MEMBER_MESSAGE_LIMIT
    });
  }

  if (action === 'delete_thread') {
    if (!staff) return json(res, 403, { error: 'Administrator access required.' });

    const threadId = clean(req.body?.threadId, 80);
    if (!threadId) return json(res, 400, { error: 'Missing conversation.' });

    const { data: thread, error: threadError } = await admin
      .from('support_threads')
      .select('id,member_id,subject,category')
      .eq('id', threadId)
      .maybeSingle();

    if (threadError || !thread) {
      return json(res, 404, { error: 'Conversation not found.' });
    }

    const { error: deleteError } = await admin
      .from('support_threads')
      .delete()
      .eq('id', threadId);

    if (deleteError) return json(res, 400, { error: deleteError.message });

    try {
      await admin.from('audit_log').insert({
      actor_id: auth.profile.id,
      action: 'support_thread_deleted',
      entity_type: 'support_thread',
      entity_id: threadId,
      details: {
        member_id: thread.member_id,
        subject: thread.subject,
        category: thread.category
      }
    });
    } catch {
      // Audit logging must never break the completed mailbox action.
    }

    return json(res, 200, {
      ok: true,
      deletedThreadId: threadId
    });
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

    try {
      await admin.from('audit_log').insert({
      actor_id: auth.profile.id,
      action: 'support_status_changed',
      entity_type: 'support_thread',
      entity_id: threadId,
      details: { status }
    });
    } catch {
      // Audit logging must never break the completed mailbox action.
    }

    return json(res, 200, { ok: true });
  }

  return json(res, 400, { error: 'Unknown message action.' });
}

function approveEsc(value = '') {
  return String(value).replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
}

function fillTemplate(template, profile) {
  const name = profile.display_name || profile.username || 'Member';
  return String(template || '')
    .replace(/\{\{\s*name\s*\}\}/gi, name)
    .replace(/\{\{\s*username\s*\}\}/gi, profile.username || '');
}

async function logWelcomeEmail(admin, threadId, member, status, error = null) {
  try {
    await admin.from('email_notification_log').insert({
      content_type: 'support_welcome',
      content_id: threadId,
      user_id: member.id,
      email: member.contact_email,
      status,
      error_message: error ? String(error).slice(0, 500) : null
    });
  } catch {}
}

export async function handleApproveRegistration({ req, res, admin }) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const auth = await getAuthenticatedProfile(admin, req);
  if (auth.error) return json(res, 401, { error: auth.error });
  if (!activeProfile(auth.profile) || !['admin','owner'].includes(auth.profile.role)) {
    return json(res, 403, { error: 'Administrator or owner access required.' });
  }

  const rate = await enforceRateLimit({
    admin,
    req,
    res,
    scope: 'approve-registration',
    userId: auth.profile.id,
    windowSeconds: 600,
    maxHits: 50
  });
  if (!rate.allowed) return json(res, 429, { error: 'Too many approval requests. Please wait and try again.' });

  const userId = String(req.body?.userId || '').trim();
  if (!userId) return json(res, 400, { error: 'Missing registration.' });

  const { data: target, error: targetError } = await admin
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (targetError || !target) return json(res, 404, { error: 'Registration not found.' });
  if (target.role !== 'user') return json(res, 400, { error: 'This is not a normal member registration.' });
  if (target.status !== 'pending') return json(res, 409, { error: 'This registration is no longer pending.' });

  // v1.8 database trigger starts the 3-day trial on this status transition.
  const { error: approveError } = await admin
    .from('profiles')
    .update({ status: 'active' })
    .eq('id', target.id);

  if (approveError) return json(res, 400, { error: approveError.message });

  const { data: approved } = await admin
    .from('profiles')
    .select('*')
    .eq('id', target.id)
    .single();

  let welcomeCreated = false;
  let welcomeError = null;
  let threadId = null;

  try {
    const { data: existing } = await admin
      .from('support_threads')
      .select('id')
      .eq('member_id', approved.id)
      .eq('category', 'welcome')
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      threadId = existing.id;
    } else {
      const { data: settings } = await admin
        .from('portal_settings')
        .select('welcome_teacher_message,welcome_learner_message,support_email_notifications_enabled')
        .eq('id', 1)
        .maybeSingle();

      const fallbackTeacher = `Hello {{name}},

Welcome to Pawn to Professor 👋

Your Teacher account has been approved and your 3-day trial is now active.

If you need help with access, resources, payment, or your account, simply reply privately to this message at any time.

Pawn to Professor Admin`;

      const fallbackLearner = `Hello {{name}},

Welcome to Pawn to Professor 👋

Your Learner account has been approved and your 3-day trial is now active.

If you need help with a lesson, access, payment, or your account, simply reply privately to this message at any time.

Pawn to Professor Admin`;

      const template = approved.member_type === 'learner'
        ? (settings?.welcome_learner_message || fallbackLearner)
        : (settings?.welcome_teacher_message || fallbackTeacher);

      const body = fillTemplate(template, approved);

      const { data: thread, error: threadError } = await admin
        .from('support_threads')
        .insert({
          member_id: approved.id,
          category: 'welcome',
          subject: 'Welcome to Pawn to Professor 👋',
          status: 'new',
          context: { automatic_welcome: true },
          created_by: auth.profile.id,
          admin_unread_count: 0,
          member_unread_count: 1,
          last_message_at: new Date().toISOString()
        })
        .select()
        .single();

      if (threadError) throw threadError;
      threadId = thread.id;

      const { error: messageError } = await admin
        .from('support_messages')
        .insert({
          thread_id: thread.id,
          sender_id: auth.profile.id,
          sender_kind: 'admin',
          body
        });

      if (messageError) throw messageError;
      welcomeCreated = true;

      // Friendly approval email. Failure never reverses approval.
      const email = String(approved.contact_email || '').trim();
      const emailEnabled = settings?.support_email_notifications_enabled !== false;

      if (emailEnabled && email && email.includes('@')) {
        if (!emailConfigured()) {
          await logWelcomeEmail(admin, thread.id, approved, 'skipped', 'Email is not configured.');
        } else {
          try {
            const portal = process.env.PORTAL_BASE_URL || 'https://learn.pawntoprofessor.com';
            const subject = 'Welcome to Pawn to Professor — your account is approved';
            const text = `${body}

Open Pawn to Professor:
${portal}

You can reply privately through My Messages after signing in.`;

            const html = `
              <div style="font-family:Arial,sans-serif;line-height:1.55;color:#1f2937">
                <div style="white-space:pre-wrap">${approveEsc(body)}</div>
                <p style="margin-top:18px"><a href="${approveEsc(portal)}" style="display:inline-block;padding:11px 16px;background:#0f5a42;color:#fff;text-decoration:none;border-radius:8px">Open Pawn to Professor</a></p>
              </div>`;

            await sendEmail({ to: email, subject, text, html });
            await logWelcomeEmail(admin, thread.id, approved, 'sent');
          } catch (err) {
            await logWelcomeEmail(admin, thread.id, approved, 'failed', err?.message || err);
          }
        }
      }
    }
  } catch (err) {
    welcomeError = err?.message || 'Could not create the private welcome message.';
  }

  try {
    await admin.from('audit_log').insert({
    actor_id: auth.profile.id,
    action: 'registration_approved',
    entity_type: 'profile',
    entity_id: approved.id,
    details: {
      username: approved.username,
      member_type: approved.member_type || 'teacher',
      trial_days: 3,
      welcome_created: welcomeCreated,
      welcome_error: welcomeError
    }
  });
  } catch {
    // Audit logging must never break the completed mailbox action.
  }

  return json(res, 200, {
    ok: true,
    userId: approved.id,
    username: approved.username,
    trialStartedAt: approved.trial_started_at,
    trialEndsAt: approved.trial_ends_at,
    welcomeCreated,
    welcomeThreadId: threadId,
    welcomeWarning: welcomeError
  });
}
