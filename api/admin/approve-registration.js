import { createClient } from '@supabase/supabase-js';
import { json, getAuthenticatedProfile, activeProfile } from '../_lib/security.js';
import { enforceRateLimit } from '../_lib/rate-limit.js';
import { sendEmail, emailConfigured } from '../_lib/email.js';

function esc(value = '') {
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

  // v1.8 database trigger starts the 7-day trial on this status transition.
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

Your Teacher account has been approved and your 7-day trial is now active.

If you need help with access, resources, payment, or your account, simply reply privately to this message at any time.

Pawn to Professor Admin`;

      const fallbackLearner = `Hello {{name}},

Welcome to Pawn to Professor 👋

Your Learner account has been approved and your 7-day trial is now active.

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
                <div style="white-space:pre-wrap">${esc(body)}</div>
                <p style="margin-top:18px"><a href="${esc(portal)}" style="display:inline-block;padding:11px 16px;background:#0f5a42;color:#fff;text-decoration:none;border-radius:8px">Open Pawn to Professor</a></p>
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

  await admin.from('audit_log').insert({
    actor_id: auth.profile.id,
    action: 'registration_approved',
    entity_type: 'profile',
    entity_id: approved.id,
    details: {
      username: approved.username,
      member_type: approved.member_type || 'teacher',
      trial_days: 7,
      welcome_created: welcomeCreated,
      welcome_error: welcomeError
    }
  }).catch(() => {});

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
