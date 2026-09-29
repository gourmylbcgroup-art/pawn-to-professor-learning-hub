// Pawn to Professor v1.9.8g — Mailbox Admin Delete API
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedProfile, activeProfile, json } from './_lib/security.js';

function clean(value, max = 180) {
  return String(value ?? '').trim().slice(0, max);
}

async function audit(admin, actorId, action, entityType, entityId, details = {}) {
  try {
    await admin.from('audit_log').insert({
      actor_id: actorId,
      action,
      entity_type: entityType,
      entity_id: entityId || null,
      details
    });
  } catch {}
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });

  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) return json(res, 500, { error: 'Server configuration is incomplete.' });

  const admin = createClient(url, secret, {
    auth: { persistSession:false, autoRefreshToken:false }
  });

  const auth = await getAuthenticatedProfile(admin, req);
  if (auth.error) return json(res, 401, { error: auth.error });
  if (!activeProfile(auth.profile)) return json(res, 403, { error: 'Active account required.' });
  if (!['admin','owner'].includes(auth.profile.role)) {
    return json(res, 403, { error: 'Administrator access required.' });
  }

  const action = clean(req.body?.action, 50);

  if (action === 'delete_message') {
    const messageId = clean(req.body?.messageId, 80);
    if (!messageId) return json(res, 400, { error: 'Missing message.' });

    const { data: message, error: messageError } = await admin
      .from('support_messages')
      .select('id,thread_id,sender_id,sender_kind,body,created_at')
      .eq('id', messageId)
      .maybeSingle();

    if (messageError || !message) return json(res, 404, { error: 'Message not found.' });

    const { error: deleteError } = await admin
      .from('support_messages')
      .delete()
      .eq('id', messageId);

    if (deleteError) return json(res, 400, { error: deleteError.message });

    const { data: remaining, error: remainingError } = await admin
      .from('support_messages')
      .select('id,created_at')
      .eq('thread_id', message.thread_id)
      .order('created_at', { ascending:false })
      .limit(1);

    if (remainingError) {
      return json(res, 500, { error: 'Message was deleted, but the conversation could not be refreshed.' });
    }

    if (!remaining?.length) {
      await admin.from('support_threads').delete().eq('id', message.thread_id);
    } else {
      await admin
        .from('support_threads')
        .update({ last_message_at: remaining[0].created_at })
        .eq('id', message.thread_id);
    }

    await audit(admin, auth.profile.id, 'support_message_deleted', 'support_message', messageId, {
      thread_id:message.thread_id,
      sender_kind:message.sender_kind
    });

    return json(res, 200, {
      ok:true,
      deletedMessageId:messageId,
      threadDeleted:!remaining?.length
    });
  }

  if (action === 'delete_thread') {
    const threadId = clean(req.body?.threadId, 80);
    if (!threadId) return json(res, 400, { error: 'Missing conversation.' });

    const { data: thread, error: threadError } = await admin
      .from('support_threads')
      .select('id,member_id,subject,category')
      .eq('id', threadId)
      .maybeSingle();

    if (threadError || !thread) return json(res, 404, { error: 'Conversation not found.' });

    const { error: deleteError } = await admin
      .from('support_threads')
      .delete()
      .eq('id', threadId);

    if (deleteError) return json(res, 400, { error: deleteError.message });

    await audit(admin, auth.profile.id, 'support_thread_deleted', 'support_thread', threadId, {
      member_id:thread.member_id,
      subject:thread.subject,
      category:thread.category
    });

    return json(res, 200, { ok:true, deletedThreadId:threadId });
  }

  return json(res, 400, { error: 'Unknown mailbox action.' });
}
