import { createClient } from '@supabase/supabase-js';
import { json, getAuthenticatedProfile, activeProfile } from '../_lib/security.js';
import { enforceRateLimit } from '../_lib/rate-limit.js';

function cleanText(value) {
  return String(value || '').trim();
}

async function countWhere(admin, table, column, value) {
  try {
    const { count, error } = await admin
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq(column, value);
    if (error) return null;
    return Number(count || 0);
  } catch {
    return null;
  }
}

async function writeAudit(admin, actorId, action, entityType, entityId, details = {}) {
  try {
    await admin.from('audit_log').insert({
      actor_id: actorId,
      action,
      entity_type: entityType,
      entity_id: entityId ? String(entityId) : null,
      details
    });
  } catch {
    // Cleanup itself must not fail only because audit insertion failed.
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

  if (!activeProfile(auth.profile) || !['admin', 'owner'].includes(auth.profile.role)) {
    return json(res, 403, { error: 'Administrator or owner access required.' });
  }

  const rate = await enforceRateLimit({
    admin,
    req,
    res,
    scope: 'admin-cleanup',
    userId: auth.profile.id,
    windowSeconds: 600,
    maxHits: 80
  });

  if (!rate.allowed) {
    return json(res, 429, { error: 'Too many cleanup requests. Please wait and try again.' });
  }

  const action = cleanText(req.body?.action);
  const targetId = cleanText(req.body?.targetId);
  const confirmText = cleanText(req.body?.confirmText);

  // -------------------------------------------------------------------------
  // Permanently delete a REJECTED public/user account.
  // This removes Auth + profile cascade, which frees username/contact email.
  // -------------------------------------------------------------------------
  if (action === 'delete_rejected_user') {
    if (!targetId) return json(res, 400, { error: 'Missing user.' });
    if (targetId === auth.profile.id) return json(res, 400, { error: 'You cannot delete your own account here.' });

    const { data: target, error: targetError } = await admin
      .from('profiles')
      .select('id,username,display_name,contact_email,role,status')
      .eq('id', targetId)
      .maybeSingle();

    if (targetError || !target) return json(res, 404, { error: 'Rejected registration not found.' });
    if (target.role !== 'user') return json(res, 400, { error: 'Admin/Owner accounts cannot be deleted from Rejected Registrations.' });
    if (target.status !== 'rejected') return json(res, 400, { error: 'Only rejected registrations can be permanently deleted here.' });

    if (confirmText !== target.username) {
      return json(res, 409, { error: `Type the exact username "${target.username}" to confirm deletion.` });
    }

    const { error: authDeleteError } = await admin.auth.admin.deleteUser(target.id);
    if (authDeleteError) return json(res, 400, { error: authDeleteError.message });

    // Normally cascades from auth.users -> profiles. This removes any unusual
    // leftover profile row if the cascade did not fire for an older account.
    await admin.from('profiles').delete().eq('id', target.id);

    await writeAudit(
      admin,
      auth.profile.id,
      'rejected_registration_permanently_deleted',
      'profile',
      target.id,
      {
        username: target.username,
        display_name: target.display_name || null,
        contact_email: target.contact_email || null
      }
    );

    return json(res, 200, {
      ok: true,
      deleted: 'rejected_user',
      username: target.username
    });
  }

  // -------------------------------------------------------------------------
  // Delete archived Activity.
  // Must be hidden first, so there is always an Archive-before-delete step.
  // -------------------------------------------------------------------------
  if (action === 'delete_activity') {
    if (!targetId) return json(res, 400, { error: 'Missing activity.' });

    const { data: row, error } = await admin
      .from('activities')
      .select('id,title,type,unit_id,published')
      .eq('id', targetId)
      .maybeSingle();

    if (error || !row) return json(res, 404, { error: 'Activity not found.' });
    if (row.published) {
      return json(res, 409, { error: 'Archive/Hide this activity before permanently deleting it.' });
    }
    if (confirmText !== row.title) {
      return json(res, 409, { error: `Type the exact title "${row.title}" to confirm deletion.` });
    }

    const { error: deleteError } = await admin.from('activities').delete().eq('id', row.id);
    if (deleteError) return json(res, 400, { error: deleteError.message });

    await writeAudit(admin, auth.profile.id, 'activity_permanently_deleted', 'activity', row.id, {
      title: row.title,
      type: row.type,
      unit_id: row.unit_id
    });

    return json(res, 200, { ok: true, deleted: 'activity', title: row.title });
  }

  // -------------------------------------------------------------------------
  // Delete archived Resource.
  // Underlying private resource_target cascades with the resource.
  // -------------------------------------------------------------------------
  if (action === 'delete_resource') {
    if (!targetId) return json(res, 400, { error: 'Missing resource.' });

    const { data: row, error } = await admin
      .from('resources')
      .select('id,title,resource_type,unit_id,published')
      .eq('id', targetId)
      .maybeSingle();

    if (error || !row) return json(res, 404, { error: 'Resource not found.' });
    if (row.published) {
      return json(res, 409, { error: 'Archive/Hide this resource before permanently deleting it.' });
    }
    if (confirmText !== row.title) {
      return json(res, 409, { error: `Type the exact title "${row.title}" to confirm deletion.` });
    }

    const { error: deleteError } = await admin.from('resources').delete().eq('id', row.id);
    if (deleteError) return json(res, 400, { error: deleteError.message });

    await writeAudit(admin, auth.profile.id, 'resource_permanently_deleted', 'resource', row.id, {
      title: row.title,
      type: row.resource_type,
      unit_id: row.unit_id
    });

    return json(res, 200, { ok: true, deleted: 'resource', title: row.title });
  }

  // -------------------------------------------------------------------------
  // Preview Unit dependencies before permanent deletion.
  // Owner only.
  // -------------------------------------------------------------------------
  if (action === 'unit_delete_preview') {
    if (auth.profile.role !== 'owner') {
      return json(res, 403, { error: 'Only the Owner can permanently delete a Unit.' });
    }
    if (!targetId) return json(res, 400, { error: 'Missing Unit.' });

    const { data: unit, error } = await admin
      .from('units')
      .select('id,name,title,grade_id,is_published')
      .eq('id', targetId)
      .maybeSingle();

    if (error || !unit) return json(res, 404, { error: 'Unit not found.' });

    const [
      activities,
      resources,
      directAccess,
      teachingPackages,
      curriculumMappings,
      accessGroupRules,
      forumTopics,
      usageEvents
    ] = await Promise.all([
      countWhere(admin, 'activities', 'unit_id', unit.id),
      countWhere(admin, 'resources', 'unit_id', unit.id),
      countWhere(admin, 'user_unit_access', 'unit_id', unit.id),
      countWhere(admin, 'teaching_packages', 'primary_unit_id', unit.id),
      countWhere(admin, 'curriculum_mappings', 'unit_id', unit.id),
      countWhere(admin, 'access_group_rules', 'unit_id', unit.id),
      countWhere(admin, 'forum_topics', 'unit_id', unit.id),
      countWhere(admin, 'usage_events', 'unit_id', unit.id)
    ]);

    return json(res, 200, {
      ok: true,
      unit,
      canDelete: unit.is_published === false,
      requiredConfirmation: `DELETE UNIT ${unit.name}`,
      counts: {
        activities,
        resources,
        directAccess,
        teachingPackages,
        curriculumMappings,
        accessGroupRules,
        forumTopics,
        usageEvents
      }
    });
  }

  // -------------------------------------------------------------------------
  // Permanently delete a hidden Unit and its cascading dependent rows.
  // Owner only.
  // -------------------------------------------------------------------------
  if (action === 'delete_unit') {
    if (auth.profile.role !== 'owner') {
      return json(res, 403, { error: 'Only the Owner can permanently delete a Unit.' });
    }
    if (!targetId) return json(res, 400, { error: 'Missing Unit.' });

    const { data: unit, error } = await admin
      .from('units')
      .select('id,name,title,grade_id,is_published')
      .eq('id', targetId)
      .maybeSingle();

    if (error || !unit) return json(res, 404, { error: 'Unit not found.' });
    if (unit.is_published) {
      return json(res, 409, { error: 'Hide the Unit before permanently deleting it.' });
    }

    const required = `DELETE UNIT ${unit.name}`;
    if (confirmText !== required) {
      return json(res, 409, { error: `Type exactly: ${required}` });
    }

    const { error: deleteError } = await admin.from('units').delete().eq('id', unit.id);
    if (deleteError) return json(res, 400, { error: deleteError.message });

    await writeAudit(admin, auth.profile.id, 'unit_permanently_deleted', 'unit', unit.id, {
      name: unit.name,
      title: unit.title || null,
      grade_id: unit.grade_id
    });

    return json(res, 200, { ok: true, deleted: 'unit', name: unit.name });
  }

  // -------------------------------------------------------------------------
  // Purge OLD audit rows by retention window.
  // No single-entry deletion. Owner only.
  // -------------------------------------------------------------------------
  if (action === 'purge_audit') {
    if (auth.profile.role !== 'owner') {
      return json(res, 403, { error: 'Only the Owner can purge the Audit Log.' });
    }

    const days = Number(req.body?.days);
    const allowedDays = new Set([30, 90, 180, 365, 730]);

    if (!allowedDays.has(days)) {
      return json(res, 400, { error: 'Choose a supported retention period.' });
    }
    if (confirmText !== 'PURGE AUDIT') {
      return json(res, 409, { error: 'Type exactly: PURGE AUDIT' });
    }

    const cutoff = new Date(Date.now() - days * 86400000).toISOString();

    const { count } = await admin
      .from('audit_log')
      .select('*', { count: 'exact', head: true })
      .lt('created_at', cutoff);

    const { error: deleteError } = await admin
      .from('audit_log')
      .delete()
      .lt('created_at', cutoff);

    if (deleteError) return json(res, 400, { error: deleteError.message });

    await writeAudit(admin, auth.profile.id, 'audit_log_purged', 'audit_log', null, {
      retention_days: days,
      cutoff,
      deleted_rows: Number(count || 0)
    });

    return json(res, 200, {
      ok: true,
      deleted: 'audit_rows',
      deletedRows: Number(count || 0),
      retentionDays: days
    });
  }

  return json(res, 400, { error: 'Unknown cleanup action.' });
}
