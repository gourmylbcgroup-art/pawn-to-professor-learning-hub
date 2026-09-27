import { createClient } from '@supabase/supabase-js';
import { enforceRateLimit } from './_lib/rate-limit.js';
import { sendEmail, emailConfigured } from './_lib/email.js';

const PRIMARY_ADMIN_EMAIL = 'stephane@alphagenus.com';

function cleanUsername(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function esc(v='') {
  return String(v).replace(/[&<>"']/g, c => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  }[c]));
}

async function logRegistrationEmail(admin, {
  registrationId,
  recipientUserId = null,
  email,
  status,
  errorMessage = null
}) {
  try {
    await admin.from('email_notification_log').insert({
      content_type: 'registration',
      content_id: registrationId,
      user_id: recipientUserId,
      email,
      status,
      error_message: errorMessage ? String(errorMessage).slice(0, 500) : null
    });
  } catch {
    // Notification logging must never break registration.
  }
}

async function notifyRegistrationAdmins(admin, registration) {
  const portal = process.env.PORTAL_BASE_URL || 'https://learn.pawntoprofessor.com';

  // Start with Stéphane as the guaranteed primary notification address.
  const recipientMap = new Map();
  recipientMap.set(PRIMARY_ADMIN_EMAIL.toLowerCase(), {
    user_id: null,
    display_name: 'Stéphane',
    contact_email: PRIMARY_ADMIN_EMAIL
  });

  // Add every active Admin / Owner that has a valid contact email.
  const { data: staff, error: staffError } = await admin
    .from('profiles')
    .select('id,username,display_name,contact_email,role,status,expires_at')
    .in('role', ['admin','owner'])
    .eq('status', 'active');

  if (!staffError) {
    for (const person of staff || []) {
      const email = String(person.contact_email || '').trim().toLowerCase();
      if (!validEmail(email)) continue;
      if (person.expires_at && new Date(person.expires_at) <= new Date()) continue;

      // If this is the primary email, enrich it with the real profile id/name.
      recipientMap.set(email, {
        user_id: person.id,
        display_name: person.display_name || person.username || 'Administrator',
        contact_email: email
      });
    }
  }

  const recipients = [...recipientMap.values()];
  const accountLabel = registration.memberType === 'learner' ? 'Learner' : 'Teacher';
  const ageLabel = registration.memberType === 'teacher'
    ? '18+ confirmed'
    : registration.isMinorLearner
      ? 'Under 18 · guardian consent received'
      : '18+';

  const subject = `New Pawn to Professor registration — ${accountLabel}`;

  const text = [
    'Pawn to Professor',
    '',
    'A new registration request is waiting for review.',
    '',
    `Name: ${registration.displayName}`,
    `Username: ${registration.username}`,
    `Account type: ${accountLabel}`,
    `Email: ${registration.contactEmail}`,
    `Age status: ${ageLabel}`,
    'Status: Pending',
    `Registration time: ${registration.nowIso}`,
    '',
    'Open Pawn to Professor:',
    portal,
    '',
    'Go to Admin → Requests to approve or reject the registration.',
    '',
    'For security, this email never contains the user password.'
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#1f2937">
      <h2 style="margin-bottom:8px">Pawn to Professor</h2>
      <p><strong>A new registration request is waiting for review.</strong></p>

      <table style="border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:5px 14px 5px 0"><strong>Name</strong></td><td>${esc(registration.displayName)}</td></tr>
        <tr><td style="padding:5px 14px 5px 0"><strong>Username</strong></td><td>${esc(registration.username)}</td></tr>
        <tr><td style="padding:5px 14px 5px 0"><strong>Account type</strong></td><td>${esc(accountLabel)}</td></tr>
        <tr><td style="padding:5px 14px 5px 0"><strong>Email</strong></td><td>${esc(registration.contactEmail)}</td></tr>
        <tr><td style="padding:5px 14px 5px 0"><strong>Age status</strong></td><td>${esc(ageLabel)}</td></tr>
        <tr><td style="padding:5px 14px 5px 0"><strong>Status</strong></td><td>Pending</td></tr>
      </table>

      <p>
        <a href="${esc(portal)}"
           style="display:inline-block;padding:12px 18px;background:#0f5a42;color:white;text-decoration:none;border-radius:8px">
          Open Learning Hub
        </a>
      </p>

      <p>Then open <strong>Admin → Requests</strong> to approve or reject the account.</p>

      <p style="font-size:12px;color:#666">
        For security, the registration email never contains the user's password.
        For an under-18 Learner, guardian contact details remain inside the secure
        Admin/database record and are not copied into this notification email.
      </p>
    </div>
  `;

  if (!emailConfigured()) {
    for (const recipient of recipients) {
      await logRegistrationEmail(admin, {
        registrationId: registration.userId,
        recipientUserId: recipient.user_id,
        email: recipient.contact_email,
        status: 'skipped',
        errorMessage: 'Email is not configured. Add RESEND_API_KEY and EMAIL_FROM in Vercel.'
      });
    }
    return { sent:0, failed:0, skipped:recipients.length };
  }

  let sent = 0;
  let failed = 0;

  // Small batches avoid hammering the email provider if there are many Admins.
  for (let i = 0; i < recipients.length; i += 5) {
    const chunk = recipients.slice(i, i + 5);

    const results = await Promise.allSettled(
      chunk.map(async recipient => {
        await sendEmail({
          to: recipient.contact_email,
          subject,
          text,
          html
        });
        return recipient;
      })
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      const recipient = chunk[j];

      if (result.status === 'fulfilled') {
        sent++;
        await logRegistrationEmail(admin, {
          registrationId: registration.userId,
          recipientUserId: recipient.user_id,
          email: recipient.contact_email,
          status: 'sent'
        });
      } else {
        failed++;
        await logRegistrationEmail(admin, {
          registrationId: registration.userId,
          recipientUserId: recipient.user_id,
          email: recipient.contact_email,
          status: 'failed',
          errorMessage: result.reason?.message || result.reason || 'Email failed'
        });
      }
    }
  }

  return { sent, failed, skipped:0 };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return res.status(500).json({ error: 'Server configuration is incomplete.' });

  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const rate = await enforceRateLimit({ admin, req, res, scope: 'register', windowSeconds: 600, maxHits: 5 });
  if (!rate.allowed) return res.status(429).json({ error: 'Too many registration attempts. Please wait a few minutes and try again.' });

  const { data: settings, error: settingsError } = await admin
    .from('portal_settings')
    .select('registration_enabled')
    .eq('id', 1)
    .single();

  if (settingsError) return res.status(500).json({ error: 'Registration settings are not installed yet.' });
  if (!settings?.registration_enabled) return res.status(403).json({ error: 'Registration is currently closed.' });

  const username = cleanUsername(req.body?.username);
  const displayName = String(req.body?.displayName || '').trim();
  const contactEmail = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const memberType = String(req.body?.memberType || '').trim().toLowerCase();
  const adultConfirmed = req.body?.adultConfirmed === true;
  const guardianName = String(req.body?.guardianName || '').trim();
  const guardianEmail = String(req.body?.guardianEmail || '').trim().toLowerCase();
  const guardianConsent = req.body?.guardianConsent === true;
  const acceptedDocumentIds = Array.isArray(req.body?.acceptedDocumentIds)
    ? [...new Set(req.body.acceptedDocumentIds.map(v => String(v || '').trim()).filter(Boolean))]
    : [];

  if (username.length < 3) return res.status(400).json({ error: 'Username must contain at least 3 valid characters.' });
  if (!displayName) return res.status(400).json({ error: 'Please add your full name.' });
  if (!validEmail(contactEmail)) return res.status(400).json({ error: 'Please use a valid email address.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must contain at least 8 characters.' });
  if (!['teacher','learner'].includes(memberType)) return res.status(400).json({ error: 'Please choose Teacher or Learner.' });

  if (memberType === 'teacher' && !adultConfirmed) {
    return res.status(400).json({ error: 'Teacher accounts require confirmation that the registrant is 18 or older.' });
  }

  const isMinorLearner = memberType === 'learner' && !adultConfirmed;
  if (isMinorLearner) {
    if (!guardianName) return res.status(400).json({ error: 'A parent or guardian name is required for learners under 18.' });
    if (!validEmail(guardianEmail)) return res.status(400).json({ error: 'Please use a valid parent or guardian email address.' });
    if (!guardianConsent) return res.status(400).json({ error: 'Parent or guardian permission is required for learners under 18.' });
  }

  // Validate the exact CURRENT published legal versions on the server.
  const requiredTypes = [
    'common_terms',
    memberType === 'learner' ? 'learner_terms' : 'teacher_terms',
    'privacy_policy'
  ];

  const { data: legalDocs, error: legalError } = await admin
    .from('legal_document_versions')
    .select('id,document_type,version,title,published')
    .eq('published', true)
    .in('document_type', requiredTypes);

  if (legalError) return res.status(500).json({ error: 'Legal registration documents are not installed yet.' });
  if ((legalDocs || []).length !== requiredTypes.length) {
    return res.status(503).json({ error: 'Registration is temporarily unavailable because the current legal documents are incomplete.' });
  }

  const accepted = new Set(acceptedDocumentIds);
  const missing = (legalDocs || []).filter(d => !accepted.has(d.id));
  if (missing.length) {
    return res.status(409).json({ error: 'The Terms or Privacy Policy changed. Please reload, review the current versions, and accept them again.' });
  }

  const { data: existing } = await admin
    .from('profiles')
    .select('id,username,contact_email')
    .or(`username.eq.${username},contact_email.eq.${contactEmail}`)
    .limit(1);

  if (existing?.length) return res.status(409).json({ error: 'That username or email is already registered.' });

  const authEmail = `${username}@portal.local`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: authEmail,
    password,
    email_confirm: true,
    user_metadata: { username, display_name: displayName, member_type: memberType }
  });

  if (createError) return res.status(400).json({ error: createError.message });

  const nowIso = new Date().toISOString();

  const { error: profileError } = await admin.from('profiles').upsert({
    id: created.user.id,
    username,
    display_name: displayName,
    contact_email: contactEmail,
    role: 'user',
    status: 'pending',
    member_type: memberType,
    adult_confirmed: adultConfirmed,
    guardian_name: isMinorLearner ? guardianName : null,
    guardian_email: isMinorLearner ? guardianEmail : null,
    guardian_consent_at: isMinorLearner ? nowIso : null,
    terms_accepted_at: nowIso,
    registration_source: 'public',
    approved_at: null,
    trial_started_at: null,
    trial_ends_at: null
  }, { onConflict: 'id' });

  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return res.status(400).json({ error: profileError.message });
  }

  const consentRows = (legalDocs || []).map(doc => ({
    user_id: created.user.id,
    document_version_id: doc.id,
    document_type: doc.document_type,
    version: doc.version,
    member_type_at_acceptance: memberType,
    accepted_by: isMinorLearner ? 'guardian' : 'user',
    guardian_name: isMinorLearner ? guardianName : null,
    guardian_email: isMinorLearner ? guardianEmail : null,
    accepted_at: nowIso
  }));

  const { error: consentError } = await admin
    .from('user_legal_consents')
    .insert(consentRows);

  if (consentError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return res.status(400).json({
      error: `Could not record legal acceptance: ${consentError.message}`
    });
  }

  // IMPORTANT:
  // The account is already safely registered at this point.
  // Notification failure must NOT cancel or delete the registration.
  let notification = { sent:0, failed:0, skipped:0 };

  try {
    notification = await notifyRegistrationAdmins(admin, {
      userId: created.user.id,
      username,
      displayName,
      contactEmail,
      memberType,
      isMinorLearner,
      nowIso
    });
  } catch (notificationError) {
    await logRegistrationEmail(admin, {
      registrationId: created.user.id,
      recipientUserId: null,
      email: PRIMARY_ADMIN_EMAIL,
      status: 'failed',
      errorMessage: notificationError?.message || 'Registration notification failed'
    });
  }

  return res.status(200).json({
    ok: true,
    username,
    status: 'pending',
    memberType,
    acceptedVersions: Object.fromEntries(
      (legalDocs || []).map(d => [d.document_type, d.version])
    ),
    adminNotification: notification
  });
}
