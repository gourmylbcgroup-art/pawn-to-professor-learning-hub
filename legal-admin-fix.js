/* Pawn to Professor v1.9.3a — Permanent Legal & Registration Admin Fix
   -------------------------------------------------------------------
   This file is deliberately loaded LAST.
   It guarantees a visible Admin → ⚖️ Legal & Registration tab and
   renders the legal editor directly, even if the older dynamic tab
   insertion in legal.js does not run correctly.

   No SQL changes.
   No registration/access/trial changes.
*/
(() => {
  if (typeof state === 'undefined' || typeof renderAdmin === 'undefined' || typeof render === 'undefined') return;

  const TYPES = {
    common_terms: 'Common Terms of Use',
    teacher_terms: 'Teacher Terms of Use',
    learner_terms: 'Learner Terms of Use',
    privacy_policy: 'Privacy Policy'
  };
  const ORDER = ['common_terms','teacher_terms','learner_terms','privacy_policy'];

  function esc(v='') {
    if (typeof escapeHtml === 'function') return escapeHtml(v);
    return String(v).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function bumpVersion(value='1.0') {
    const m = String(value).trim().match(/^(\d+)\.(\d+)$/);
    if (!m) return '1.1';
    return `${m[1]}.${Number(m[2]) + 1}`;
  }

  async function fetchAllVersions() {
    const { data, error } = await state.client
      .from('legal_document_versions')
      .select('*')
      .order('document_type')
      .order('created_at', { ascending:false });

    if (error) throw error;
    return data || [];
  }

  function editorHtml(type, versions) {
    const rows = versions.filter(v => v.document_type === type);
    const current = rows.find(v => v.published);
    const latest = rows[0] || current;
    const suggested = bumpVersion(current?.version || latest?.version || '1.0');
    const title = current?.title || TYPES[type];
    const content = current?.content || latest?.content || '';

    return `
      <section class="v19-legal-editor" data-legal-editor="${type}">
        <h3>${esc(TYPES[type])}</h3>

        <div class="v19-legal-current">
          Published:
          ${current
            ? `v${esc(current.version)} · ${esc(new Date(current.published_at || current.created_at).toLocaleDateString())}`
            : 'None'}
        </div>

        <div class="admin-form-grid">
          <label>
            New version
            <input data-version value="${esc(suggested)}" placeholder="1.1">
          </label>

          <label>
            Title
            <input data-title value="${esc(title)}">
          </label>

          <label class="wide">
            Document text
            <textarea data-content rows="14">${esc(content)}</textarea>
          </label>

          <label class="checkbox-card wide">
            <input data-reaccept type="checkbox">
            Require affected existing users to accept this version on next login
          </label>
        </div>

        <div class="v19-legal-editor-actions">
          <button class="btn btn-small btn-ghost" data-preview type="button">Preview</button>
          <button class="btn btn-small btn-ghost" data-save type="button">Save Draft</button>
          <button class="btn btn-small btn-accent" data-publish type="button">Publish New Version</button>
        </div>

        <div class="v19-legal-history">
          ${rows.slice(0,6).map(v => `
            <div class="v19-legal-version-row">
              <div>
                <strong>v${esc(v.version)}</strong>
                ${v.published ? '<span class="v19-published-pill">PUBLISHED</span>' : ''}
                <small>
                  ${esc(v.title)}
                  ${v.require_reacceptance ? ' · re-acceptance required' : ''}
                </small>
              </div>
              <div class="actions">
                <button class="btn btn-small btn-ghost" data-load-version="${v.id}" type="button">Load</button>
                ${v.published
                  ? ''
                  : `<button class="btn btn-small btn-accent" data-publish-version="${v.id}" type="button">Publish</button>`}
              </div>
            </div>
          `).join('') || '<p class="admin-note">No versions yet.</p>'}
        </div>
      </section>
    `;
  }

  async function previewDocument(editor) {
    const type = editor.dataset.legalEditor;
    const doc = {
      document_type: type,
      title: editor.querySelector('[data-title]').value.trim() || TYPES[type],
      version: editor.querySelector('[data-version]').value.trim(),
      content: editor.querySelector('[data-content]').value,
      effective_at: new Date().toISOString()
    };

    if (globalThis.PTPLegal?.openDocument) {
      return globalThis.PTPLegal.openDocument(doc);
    }

    // Fallback preview if legal.js did not expose its modal.
    const overlay = document.createElement('div');
    overlay.className = 'v19-legal-overlay';
    overlay.innerHTML = `
      <section class="v19-legal-modal" role="dialog" aria-modal="true">
        <header>
          <div>
            <h2>${esc(doc.title)}</h2>
            <div class="v19-version">Version ${esc(doc.version)}</div>
          </div>
          <button class="v19-legal-close" type="button">×</button>
        </header>
        <div class="v19-legal-document-text"></div>
      </section>
    `;
    overlay.querySelector('.v19-legal-document-text').textContent = doc.content || '';
    overlay.querySelector('.v19-legal-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  }

  async function publishExistingVersion(row) {
    if (row.require_reacceptance) {
      const ok = confirm(
        `Publish ${TYPES[row.document_type]} v${row.version}?\n\n` +
        'Affected existing users will have to accept it on next login.'
      );
      if (!ok) return;
    }

    const { error } = await state.client.rpc('publish_legal_document', {
      target_document: row.id
    });

    if (error) return toast(error.message);

    globalThis.PTPLegal?.clearCache?.();
    toast(`${TYPES[row.document_type]} v${row.version} published.`);
    render();
  }

  async function saveEditor(editor, { publish=false } = {}) {
    const type = editor.dataset.legalEditor;
    const version = editor.querySelector('[data-version]').value.trim();
    const title = editor.querySelector('[data-title]').value.trim();
    const content = editor.querySelector('[data-content]').value.trim();
    const requireReaccept = editor.querySelector('[data-reaccept]').checked;

    if (!version || !title || !content) {
      return toast('Version, title and document text are required.');
    }

    const { data:existing, error:existingError } = await state.client
      .from('legal_document_versions')
      .select('*')
      .eq('document_type', type)
      .eq('version', version)
      .maybeSingle();

    if (existingError) return toast(existingError.message);

    let id;

    if (existing) {
      if (existing.published) {
        return toast('Published legal versions are immutable. Use a new version number.');
      }

      const { data, error } = await state.client
        .from('legal_document_versions')
        .update({
          title,
          content,
          require_reacceptance: requireReaccept,
          effective_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) return toast(error.message);
      id = data.id;
    } else {
      const { data, error } = await state.client
        .from('legal_document_versions')
        .insert({
          document_type: type,
          version,
          title,
          content,
          effective_at: new Date().toISOString(),
          require_reacceptance: requireReaccept,
          published: false,
          created_by: state.session.user.id
        })
        .select()
        .single();

      if (error) return toast(error.message);
      id = data.id;
    }

    if (publish) {
      if (requireReaccept) {
        const ok = confirm(
          'Publishing with re-acceptance ON will require affected existing users ' +
          'to accept this version at their next login.\n\nPublish now?'
        );
        if (!ok) return;
      }

      const { error } = await state.client.rpc('publish_legal_document', {
        target_document: id
      });

      if (error) return toast(error.message);

      globalThis.PTPLegal?.clearCache?.();
      toast(`${TYPES[type]} v${version} published.`);
    } else {
      toast(`${TYPES[type]} v${version} saved as draft.`);
    }

    render();
  }

  async function renderLegalAdminFixed(panel) {
    panel.innerHTML = `
      <h2>⚖️ Legal & Registration</h2>
      <div class="empty-state" style="height:120px">
        Loading legal documents…
      </div>
    `;

    try {
      const versions = await fetchAllVersions();

      if (state.adminTab !== 'legal') return;

      panel.innerHTML = `
        <h2>⚖️ Legal & Registration</h2>

        <div class="v19-legal-admin-intro">
          <strong>Editable, versioned agreements</strong>
          <p class="admin-note">
            New registrations accept the current Common Terms plus the correct
            Teacher/Learner Terms and Privacy Policy. Published versions are
            preserved as an audit trail.
          </p>
        </div>

        <div class="v19-legal-admin-grid">
          ${ORDER.map(type => editorHtml(type, versions)).join('')}
        </div>
      `;

      panel.querySelectorAll('[data-legal-editor]').forEach(editor => {
        editor.querySelector('[data-preview]')
          .addEventListener('click', () => previewDocument(editor));

        editor.querySelector('[data-save]')
          .addEventListener('click', () => saveEditor(editor, { publish:false }));

        editor.querySelector('[data-publish]')
          .addEventListener('click', () => saveEditor(editor, { publish:true }));

        editor.querySelectorAll('[data-load-version]').forEach(btn => {
          btn.addEventListener('click', () => {
            const row = versions.find(v => v.id === btn.dataset.loadVersion);
            if (!row) return;

            editor.querySelector('[data-title]').value = row.title;
            editor.querySelector('[data-content]').value = row.content;
            editor.querySelector('[data-reaccept]').checked = row.require_reacceptance;
            editor.querySelector('[data-version]').value =
              row.published ? bumpVersion(row.version) : row.version;

            toast(
              row.published
                ? 'Published text loaded. A new version number was suggested.'
                : 'Draft loaded for editing.'
            );
          });
        });

        editor.querySelectorAll('[data-publish-version]').forEach(btn => {
          btn.addEventListener('click', () => {
            const row = versions.find(v => v.id === btn.dataset.publishVersion);
            if (row) publishExistingVersion(row);
          });
        });
      });
    } catch (err) {
      panel.innerHTML = `
        <h2>⚖️ Legal & Registration</h2>
        <div class="empty-state">
          ${esc(err.message || 'Could not load legal documents.')}
        </div>
      `;
    }
  }

  // Wrap the FINAL renderAdmin implementation because this file loads last.
  const nativeRenderAdminLegalFix = renderAdmin;

  renderAdmin = function (...args) {
    nativeRenderAdminLegalFix(...args);

    const tabs = els.content.querySelector('.admin-tabs');
    const panel = els.content.querySelector('#adminPanel');

    if (!tabs || !panel) return;

    // Use any existing Legal button if another script already created one.
    let btn = [...tabs.querySelectorAll('button')].find(
      node => /Legal\s*&\s*Registration/i.test(node.textContent || '')
    );

    // If it does not exist, make it permanent here.
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-ghost';
      btn.textContent = '⚖️ Legal & Registration';
      tabs.appendChild(btn);
    }

    btn.classList.toggle('active', state.adminTab === 'legal');

    // Replace all click handlers from older dynamic versions with one reliable handler.
    const cleanBtn = btn.cloneNode(true);
    cleanBtn.classList.toggle('active', state.adminTab === 'legal');
    btn.replaceWith(cleanBtn);

    cleanBtn.addEventListener('click', () => {
      state.adminTab = 'legal';
      render();
    });

    if (state.adminTab === 'legal') {
      renderLegalAdminFixed(panel);
    }
  };

  globalThis.PTP_LEGAL_ADMIN_FIX_VERSION = '1.9.3a';
})();
