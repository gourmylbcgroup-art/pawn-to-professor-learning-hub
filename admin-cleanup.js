/* Pawn to Professor v1.9.5 — Admin Cleanup Center
   ------------------------------------------------------------
   Adds Admin → 🗑 Cleanup without rewriting app.js.

   Safe workflow:
   - Rejected registrations can be permanently deleted -> username/email freed.
   - Activities and resources: Archive first, then typed permanent deletion.
   - Hidden Units: Owner-only impact preview + typed permanent deletion.
   - Audit Log: export any time; Owner can purge only OLD entries by retention.
   - Legal consent records are NOT exposed here.
*/
(() => {
  if (typeof state === 'undefined' || typeof renderAdmin === 'undefined' || typeof render === 'undefined') return;

  const VERSION = '1.9.5';

  function esc(v='') {
    if (typeof escapeHtml === 'function') return escapeHtml(v);
    return String(v).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function owner() {
    try { return typeof isOwner === 'function' && isOwner(); }
    catch { return state.profile?.role === 'owner'; }
  }

  async function cleanupApi(payload) {
    const headers = await authHeaders();
    const res = await fetch('/api/admin/cleanup', {
      method: 'POST',
      headers,
      cache: 'no-store',
      body: JSON.stringify(payload)
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'Cleanup request failed.');
    return body;
  }

  function fullUnitPath(unit, grades, years) {
    const grade = grades.find(g => g.id === unit.grade_id);
    const year = years.find(y => y.id === grade?.school_year_id);
    return [year?.name, grade?.name, unit?.name].filter(Boolean).join(' · ');
  }

  async function loadCleanupData() {
    const [
      rejectedResult,
      activitiesResult,
      resourcesResult,
      unitsResult,
      gradesResult,
      yearsResult
    ] = await Promise.all([
      state.client.from('profiles')
        .select('id,username,display_name,contact_email,status,role,created_at')
        .eq('status','rejected')
        .eq('role','user')
        .order('created_at',{ascending:false}),
      state.client.from('activities')
        .select('id,unit_id,title,type,published,sort_order,created_at')
        .order('created_at',{ascending:false}),
      state.client.from('resources')
        .select('id,unit_id,title,resource_type,published,sort_order,created_at')
        .order('created_at',{ascending:false}),
      state.client.from('units')
        .select('id,grade_id,name,title,sort_order,is_published,created_at')
        .order('sort_order'),
      state.client.from('grades')
        .select('id,school_year_id,name,sort_order,archived')
        .order('sort_order'),
      state.client.from('school_years')
        .select('id,name,sort_order,archived')
        .order('sort_order')
    ]);

    const firstError = [
      rejectedResult.error,
      activitiesResult.error,
      resourcesResult.error,
      unitsResult.error,
      gradesResult.error,
      yearsResult.error
    ].find(Boolean);

    if (firstError) throw firstError;

    return {
      rejected: rejectedResult.data || [],
      activities: activitiesResult.data || [],
      resources: resourcesResult.data || [],
      units: unitsResult.data || [],
      grades: gradesResult.data || [],
      years: yearsResult.data || []
    };
  }

  function section(title, note, body, className='') {
    return `
      <section class="cleanup-section ${className}">
        <div class="cleanup-section-head">
          <div>
            <h3>${title}</h3>
            <p class="admin-note">${note}</p>
          </div>
        </div>
        ${body}
      </section>`;
  }

  function rejectedHtml(rows) {
    if (!rows.length) return '<p class="admin-note">No rejected registrations.</p>';
    return `<div class="cleanup-list">${
      rows.map(u => `
        <div class="cleanup-row">
          <div>
            <strong>${esc(u.username)}</strong>
            <div class="meta">${esc(u.display_name || '')}${u.contact_email ? ` · ${esc(u.contact_email)}` : ''}</div>
            <small>Rejected registration</small>
          </div>
          <div class="actions">
            <button class="btn btn-small btn-danger"
                    data-delete-rejected="${u.id}"
                    data-username="${esc(u.username)}">
              Delete Registration
            </button>
          </div>
        </div>`).join('')
    }</div>`;
  }

  function activityHtml(rows, units, grades, years) {
    if (!rows.length) return '<p class="admin-note">No activities or interactive lessons.</p>';
    return `<div class="cleanup-list">${
      rows.map(a => {
        const unit = units.find(u => u.id === a.unit_id);
        const path = unit ? fullUnitPath(unit, grades, years) : 'Unknown Unit';
        return `
          <div class="cleanup-row ${a.published ? '' : 'cleanup-archived'}">
            <div>
              <strong>${esc(a.title)}</strong>
              <div class="meta">${esc(a.type || 'Activity')} · ${esc(path)}</div>
              <small>${a.published ? '🟢 Visible' : '📦 Archived / hidden'}</small>
            </div>
            <div class="actions">
              <button class="btn btn-small btn-ghost"
                      data-toggle-activity="${a.id}"
                      data-published="${a.published ? 'true' : 'false'}">
                ${a.published ? 'Archive' : 'Restore'}
              </button>
              ${a.published ? '' : `
                <button class="btn btn-small btn-danger"
                        data-delete-activity="${a.id}"
                        data-title="${esc(a.title)}">
                  Delete Permanently
                </button>`}
            </div>
          </div>`;
      }).join('')
    }</div>`;
  }

  function resourceHtml(rows, units, grades, years) {
    if (!rows.length) return '<p class="admin-note">No resources.</p>';
    return `<div class="cleanup-list">${
      rows.map(r => {
        const unit = units.find(u => u.id === r.unit_id);
        const path = unit ? fullUnitPath(unit, grades, years) : 'Unknown Unit';
        return `
          <div class="cleanup-row ${r.published ? '' : 'cleanup-archived'}">
            <div>
              <strong>${esc(r.title)}</strong>
              <div class="meta">${esc(r.resource_type || 'Resource')} · ${esc(path)}</div>
              <small>${r.published ? '🟢 Visible' : '📦 Archived / hidden'}</small>
            </div>
            <div class="actions">
              <button class="btn btn-small btn-ghost"
                      data-toggle-resource="${r.id}"
                      data-published="${r.published ? 'true' : 'false'}">
                ${r.published ? 'Archive' : 'Restore'}
              </button>
              ${r.published ? '' : `
                <button class="btn btn-small btn-danger"
                        data-delete-resource="${r.id}"
                        data-title="${esc(r.title)}">
                  Delete Permanently
                </button>`}
            </div>
          </div>`;
      }).join('')
    }</div>`;
  }

  function hiddenUnitHtml(rows, grades, years) {
    const hidden = rows.filter(u => !u.is_published);
    if (!hidden.length) return '<p class="admin-note">No hidden Units.</p>';

    return `<div class="cleanup-list">${
      hidden.map(u => `
        <div class="cleanup-row cleanup-danger-row">
          <div>
            <strong>${esc(fullUnitPath(u, grades, years))}</strong>
            <div class="meta">${esc(u.title || '')}</div>
            <small>Hidden Unit</small>
          </div>
          <div class="actions">
            ${owner()
              ? `<button class="btn btn-small btn-danger"
                         data-delete-unit="${u.id}"
                         data-unit-name="${esc(u.name)}">
                   Review & Delete
                 </button>`
              : '<span class="cleanup-owner-only">Owner only</span>'}
          </div>
        </div>`).join('')
    }</div>`;
  }

  function applySearch(panel) {
    const query = (panel.querySelector('#cleanupSearch')?.value || '').trim().toLowerCase();
    const show = panel.querySelector('#cleanupShow')?.value || 'all';

    panel.querySelectorAll('.cleanup-row').forEach(row => {
      const text = (row.textContent || '').toLowerCase();
      const archived = row.classList.contains('cleanup-archived');
      let visible = !query || text.includes(query);

      if (show === 'archived') visible = visible && archived;
      if (show === 'active') visible = visible && !archived;

      row.hidden = !visible;
    });
  }

  async function renderCleanup(panel) {
    panel.innerHTML = `
      <h2>🗑 Cleanup Center</h2>
      <p class="admin-note">
        Archive content first. Permanent deletion is deliberately harder and
        uses typed confirmation. Legal consent records are not deleted here.
      </p>
      <div class="cleanup-toolbar">
        <input id="cleanupSearch" class="admin-search" placeholder="Search username, lesson, resource or Unit">
        <select id="cleanupShow">
          <option value="all">Show all</option>
          <option value="active">Active / visible</option>
          <option value="archived">Archived / hidden</option>
        </select>
        <button id="cleanupRefresh" class="btn btn-small btn-ghost">Refresh</button>
      </div>
      <div id="cleanupBody"><div class="empty-state" style="height:120px">Loading cleanup data…</div></div>
    `;

    let data;
    try {
      data = await loadCleanupData();
    } catch (err) {
      panel.querySelector('#cleanupBody').innerHTML =
        `<div class="empty-state">${esc(err.message || 'Could not load cleanup data.')}</div>`;
      return;
    }

    if (state.adminTab !== 'cleanup') return;

    const body = panel.querySelector('#cleanupBody');

    body.innerHTML =
      section(
        'Rejected Registrations',
        'Permanent deletion removes the rejected Auth account and profile, which frees the username and contact email for future registration.',
        rejectedHtml(data.rejected)
      ) +
      section(
        'Activities & Interactive Lessons',
        'Normal action: Archive. Permanent deletion is available only after the item is archived.',
        activityHtml(data.activities, data.units, data.grades, data.years)
      ) +
      section(
        'Resources',
        'Archive first. Permanent deletion also removes the protected private resource target through database cascade.',
        resourceHtml(data.resources, data.units, data.grades, data.years)
      ) +
      section(
        'Hidden Units — Danger Zone',
        'A Unit must be hidden first. Permanent Unit deletion is Owner-only and shows dependency counts before deletion.',
        hiddenUnitHtml(data.units, data.grades, data.years),
        'cleanup-danger-section'
      ) +
      section(
        'Audit Log Retention',
        'Do not delete individual audit entries. Export the log whenever needed. Owner may purge only entries older than the selected retention period.',
        `
          <div class="cleanup-audit-controls">
            <button id="exportAudit" class="btn btn-small btn-ghost">Export Audit Log</button>
            ${owner() ? `
              <label>
                Keep recent audit history
                <select id="auditRetention">
                  <option value="30">30 days</option>
                  <option value="90">90 days</option>
                  <option value="180" selected>180 days</option>
                  <option value="365">365 days</option>
                  <option value="730">730 days</option>
                </select>
              </label>
              <button id="purgeAudit" class="btn btn-small btn-danger">
                Purge Older Audit Records
              </button>
            ` : '<span class="cleanup-owner-only">Audit purge: Owner only</span>'}
          </div>
        `,
        'cleanup-danger-section'
      );

    panel.querySelector('#cleanupSearch').addEventListener('input', () => applySearch(panel));
    panel.querySelector('#cleanupShow').addEventListener('change', () => applySearch(panel));
    panel.querySelector('#cleanupRefresh').addEventListener('click', () => renderCleanup(panel));

    // Rejected registrations.
    panel.querySelectorAll('[data-delete-rejected]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const username = btn.dataset.username;
        const typed = prompt(
          `Permanently delete rejected registration "${username}"?\n\n` +
          'This removes the Auth account and profile and frees the username/email.\n\n' +
          `Type the exact username to confirm: ${username}`
        );
        if (typed === null) return;
        if (typed !== username) return toast('Username did not match. Nothing was deleted.');

        btn.disabled = true;
        try {
          await cleanupApi({
            action: 'delete_rejected_user',
            targetId: btn.dataset.deleteRejected,
            confirmText: typed
          });
          toast(`Rejected registration ${username} deleted. Username/email are free again.`);
          state.selectedAdminUser = null;
          await loadAdminUsers();
          renderCleanup(panel);
        } catch (err) {
          toast(err.message);
          btn.disabled = false;
        }
      });
    });

    // Archive/restore activities.
    panel.querySelectorAll('[data-toggle-activity]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const published = btn.dataset.published === 'true';
        const { error } = await state.client
          .from('activities')
          .update({ published: !published })
          .eq('id', btn.dataset.toggleActivity);

        if (error) return toast(error.message);
        await logAudit(
          published ? 'activity_archived' : 'activity_restored',
          'activity',
          btn.dataset.toggleActivity,
          {}
        );
        toast(published ? 'Activity archived.' : 'Activity restored.');
        renderCleanup(panel);
      });
    });

    panel.querySelectorAll('[data-delete-activity]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const title = btn.dataset.title;
        const typed = prompt(
          `Permanently delete "${title}"?\n\nThis cannot be undone.\n\nType the exact title to confirm:`
        );
        if (typed === null) return;
        if (typed !== title) return toast('Title did not match. Nothing was deleted.');

        btn.disabled = true;
        try {
          await cleanupApi({
            action: 'delete_activity',
            targetId: btn.dataset.deleteActivity,
            confirmText: typed
          });
          toast('Activity permanently deleted.');
          renderCleanup(panel);
        } catch (err) {
          toast(err.message);
          btn.disabled = false;
        }
      });
    });

    // Archive/restore resources.
    panel.querySelectorAll('[data-toggle-resource]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const published = btn.dataset.published === 'true';
        const { error } = await state.client
          .from('resources')
          .update({ published: !published })
          .eq('id', btn.dataset.toggleResource);

        if (error) return toast(error.message);
        await logAudit(
          published ? 'resource_archived' : 'resource_restored',
          'resource',
          btn.dataset.toggleResource,
          {}
        );
        toast(published ? 'Resource archived.' : 'Resource restored.');
        renderCleanup(panel);
      });
    });

    panel.querySelectorAll('[data-delete-resource]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const title = btn.dataset.title;
        const typed = prompt(
          `Permanently delete resource "${title}"?\n\nThis cannot be undone.\n\nType the exact title to confirm:`
        );
        if (typed === null) return;
        if (typed !== title) return toast('Title did not match. Nothing was deleted.');

        btn.disabled = true;
        try {
          await cleanupApi({
            action: 'delete_resource',
            targetId: btn.dataset.deleteResource,
            confirmText: typed
          });
          toast('Resource permanently deleted.');
          renderCleanup(panel);
        } catch (err) {
          toast(err.message);
          btn.disabled = false;
        }
      });
    });

    // Unit deletion with impact preview.
    panel.querySelectorAll('[data-delete-unit]').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          const preview = await cleanupApi({
            action: 'unit_delete_preview',
            targetId: btn.dataset.deleteUnit
          });

          const c = preview.counts || {};
          const value = n => n === null ? '?' : Number(n || 0);

          const impact =
            `Delete ${preview.unit.name}?\n\n` +
            `This hidden Unit currently references:\n` +
            `• ${value(c.activities)} activities\n` +
            `• ${value(c.resources)} resources\n` +
            `• ${value(c.directAccess)} direct access assignments\n` +
            `• ${value(c.teachingPackages)} teaching packages\n` +
            `• ${value(c.curriculumMappings)} curriculum mappings\n` +
            `• ${value(c.accessGroupRules)} access-group rules\n` +
            `• ${value(c.forumTopics)} forum topics\n` +
            `• ${value(c.usageEvents)} usage records\n\n` +
            `Database cascade/SET NULL rules may affect these linked records.\n\n` +
            `Type exactly:\n${preview.requiredConfirmation}`;

          if (!preview.canDelete) {
            toast('Hide the Unit before permanently deleting it.');
            btn.disabled = false;
            return;
          }

          const typed = prompt(impact);
          if (typed === null) {
            btn.disabled = false;
            return;
          }
          if (typed !== preview.requiredConfirmation) {
            toast('Confirmation text did not match. Nothing was deleted.');
            btn.disabled = false;
            return;
          }

          await cleanupApi({
            action: 'delete_unit',
            targetId: btn.dataset.deleteUnit,
            confirmText: typed
          });

          toast(`${preview.unit.name} permanently deleted.`);
          await loadStructure();
          await loadOwnAccess();
          renderCleanup(panel);
        } catch (err) {
          toast(err.message);
          btn.disabled = false;
        }
      });
    });

    // Audit export.
    panel.querySelector('#exportAudit')?.addEventListener('click', async () => {
      const { data: rows, error } = await state.client
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending:false })
        .limit(5000);

      if (error) return toast(error.message);

      const payload = {
        exported_at: new Date().toISOString(),
        count: (rows || []).length,
        audit_log: rows || []
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json'
      });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `pawn-to-professor-audit-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);

      await logAudit('audit_log_exported', 'audit_log', null, {
        rows: (rows || []).length
      });
      toast('Audit Log exported.');
    });

    panel.querySelector('#purgeAudit')?.addEventListener('click', async () => {
      const days = Number(panel.querySelector('#auditRetention')?.value || 180);

      if (!confirm(
        `Purge Audit Log entries older than ${days} days?\n\n` +
        'Recent records are kept. Legal consent records are NOT affected.'
      )) return;

      const typed = prompt('Type exactly: PURGE AUDIT');
      if (typed !== 'PURGE AUDIT') {
        return toast('Confirmation text did not match. Nothing was deleted.');
      }

      try {
        const result = await cleanupApi({
          action: 'purge_audit',
          days,
          confirmText: typed
        });

        toast(`${result.deletedRows} old audit record${result.deletedRows===1?'':'s'} removed.`);
        renderCleanup(panel);
      } catch (err) {
        toast(err.message);
      }
    });
  }

  // Wrap whichever Admin renderer is currently final (including Legal patch).
  const nativeRenderAdminCleanup = renderAdmin;

  renderAdmin = function (...args) {
    nativeRenderAdminCleanup(...args);

    const tabs = els.content.querySelector('.admin-tabs');
    const panel = els.content.querySelector('#adminPanel');
    if (!tabs || !panel) return;

    let btn = [...tabs.querySelectorAll('button')].find(
      node => /Cleanup Center|🗑 Cleanup/i.test(node.textContent || '')
    );

    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-ghost';
      btn.textContent = '🗑 Cleanup';
      tabs.appendChild(btn);
    }

    const cleanBtn = btn.cloneNode(true);
    cleanBtn.classList.toggle('active', state.adminTab === 'cleanup');
    btn.replaceWith(cleanBtn);

    cleanBtn.addEventListener('click', () => {
      state.adminTab = 'cleanup';
      render();
    });

    if (state.adminTab === 'cleanup') {
      renderCleanup(panel);
    }
  };

  globalThis.PTP_ADMIN_CLEANUP_VERSION = VERSION;
})();
