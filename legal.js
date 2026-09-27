/* Pawn to Professor v1.9.0
   Editable/versioned legal documents + registration acceptance + re-acceptance gate.
*/
(() => {
  if (typeof state === 'undefined' || typeof els === 'undefined') return;

  const TYPES = {
    common_terms: 'Common Terms of Use',
    teacher_terms: 'Teacher Terms of Use',
    learner_terms: 'Learner Terms of Use',
    privacy_policy: 'Privacy Policy'
  };
  const ORDER = ['common_terms','teacher_terms','learner_terms','privacy_policy'];
  let publishedCache = null;

  function esc(v='') {
    if (typeof escapeHtml === 'function') return escapeHtml(v);
    return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  async function waitForClient() {
    for (let i=0;i<100;i++) {
      if (state.client) return state.client;
      await new Promise(r=>setTimeout(r,50));
    }
    throw new Error('The Learning Hub connection is not ready.');
  }

  function bumpVersion(value='1.0') {
    const m=String(value).trim().match(/^(\d+)\.(\d+)$/);
    if (!m) return '1.1';
    return `${m[1]}.${Number(m[2])+1}`;
  }

  async function getPublishedDocuments(force=false) {
    if (publishedCache && !force) return publishedCache;
    const client=await waitForClient();
    const {data,error}=await client
      .from('legal_document_versions')
      .select('id,document_type,title,version,content,effective_at,published_at,require_reacceptance,published')
      .eq('published',true)
      .order('document_type');
    if (error) throw error;
    publishedCache=data||[];
    return publishedCache;
  }

  function requiredTypes(memberType) {
    return [
      'common_terms',
      memberType === 'learner' ? 'learner_terms' : 'teacher_terms',
      'privacy_policy'
    ];
  }

  async function requiredDocuments(memberType) {
    const docs=await getPublishedDocuments();
    const needed=requiredTypes(memberType);
    return needed.map(type=>docs.find(d=>d.document_type===type)).filter(Boolean);
  }

  function createModal({doc, blocking=false, actionHtml=''}) {
    document.querySelector('.v19-legal-overlay')?.remove();
    const overlay=document.createElement('div');
    overlay.className='v19-legal-overlay';
    overlay.innerHTML=`
      <section class="v19-legal-modal" role="dialog" aria-modal="true" aria-label="${esc(doc.title||TYPES[doc.document_type]||'Legal document')}">
        <header>
          <div>
            <h2>${esc(doc.title||TYPES[doc.document_type]||'Legal document')}</h2>
            <div class="v19-version">Version ${esc(doc.version||'')} ${doc.effective_at?`· Effective ${esc(new Date(doc.effective_at).toLocaleDateString())}`:''}</div>
          </div>
          ${blocking?'':'<button class="v19-legal-close" type="button" aria-label="Close">×</button>'}
        </header>
        <div class="v19-legal-document-text"></div>
        ${actionHtml}
      </section>
    `;
    overlay.querySelector('.v19-legal-document-text').textContent=doc.content||'';
    if(!blocking) {
      overlay.querySelector('.v19-legal-close').addEventListener('click',()=>overlay.remove());
      overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove();});
    }
    document.body.appendChild(overlay);
    return overlay;
  }

  async function openDocument(docOrType) {
    let doc=docOrType;
    if(typeof docOrType==='string') {
      const docs=await getPublishedDocuments();
      doc=docs.find(d=>d.document_type===docOrType);
    }
    if(!doc) return toast('This legal document is not available yet.');
    createModal({doc});
  }

  async function acceptMissingDocuments(rows) {
    if (!rows?.length) return;
    const userMinor = state.profile?.member_type === 'learner' && state.profile?.adult_confirmed !== true;
    let index=0;

    const showNext=()=>{
      if(index>=rows.length) {
        document.querySelector('.v19-legal-overlay')?.remove();
        toast('Updated legal terms accepted.');
        return;
      }
      const doc=rows[index];
      const privacy=doc.document_type==='privacy_policy';
      const label=userMinor
        ? (privacy
            ? 'I am the parent/legal guardian and acknowledge this Privacy Policy on behalf of the learner.'
            : `I am the parent/legal guardian and agree to this ${TYPES[doc.document_type]||'document'} on behalf of the learner.`)
        : (privacy
            ? 'I acknowledge this updated Privacy Policy.'
            : `I agree to this updated ${TYPES[doc.document_type]||'document'}.`);

      const guardianHtml=userMinor?`
        <div class="v19-guardian-reaccept">
          <label>Parent / guardian name<input id="v19ReacceptGuardianName" value="${esc(state.profile.guardian_name||'')}"></label>
          <label>Parent / guardian email<input id="v19ReacceptGuardianEmail" type="email" value="${esc(state.profile.guardian_email||'')}"></label>
        </div>`:'';

      const overlay=createModal({
        doc,
        blocking:true,
        actionHtml:`
          <div class="v19-legal-gate-actions">
            <div class="v19-legal-warning">This version was published as a material legal update. You must accept it before continuing to use the member portal.</div>
            ${guardianHtml}
            <label><input id="v19ReacceptCheck" type="checkbox"> <span>${esc(label)}</span></label>
            <button id="v19AcceptUpdatedLegal" class="btn btn-primary" type="button">Accept & Continue</button>
          </div>`
      });

      overlay.querySelector('#v19AcceptUpdatedLegal').addEventListener('click',async()=>{
        if(!overlay.querySelector('#v19ReacceptCheck').checked) return toast('Please confirm acceptance first.');
        let guardianName=null, guardianEmail=null;
        if(userMinor) {
          guardianName=overlay.querySelector('#v19ReacceptGuardianName').value.trim();
          guardianEmail=overlay.querySelector('#v19ReacceptGuardianEmail').value.trim();
          if(!guardianName||!guardianEmail) return toast('Parent/guardian name and email are required.');
        }
        const btn=overlay.querySelector('#v19AcceptUpdatedLegal');
        btn.disabled=true; btn.textContent='Saving…';
        const {error}=await state.client.rpc('accept_legal_document',{
          target_document:doc.id,
          guardian_name_input:guardianName,
          guardian_email_input:guardianEmail,
          guardian_confirmed:userMinor
        });
        if(error) {
          btn.disabled=false; btn.textContent='Accept & Continue';
          return toast(error.message);
        }
        index++;
        showNext();
      });
    };
    showNext();
  }

  async function checkReacceptance() {
    if(!state.profile || isStaff()) return;
    const {data,error}=await state.client.rpc('current_user_missing_legal_documents');
    if(error) {
      console.warn('Legal re-acceptance check failed:',error.message);
      return;
    }
    if(data?.length) await acceptMissingDocuments(data);
  }

  // Apply the re-acceptance gate after the normal portal/session checks complete.
  if(typeof enterPortal==='function') {
    const nativeEnterPortalV19=enterPortal;
    enterPortal=async function() {
      await nativeEnterPortalV19();
      if(state.profile && !isStaff()) await checkReacceptance();
    };
  }

  async function fetchAllVersions() {
    const {data,error}=await state.client
      .from('legal_document_versions')
      .select('*')
      .order('document_type')
      .order('created_at',{ascending:false});
    if(error) throw error;
    return data||[];
  }

  function editorHtml(type, versions) {
    const rows=versions.filter(v=>v.document_type===type);
    const current=rows.find(v=>v.published);
    const latest=rows[0]||current;
    const suggested=bumpVersion(current?.version||latest?.version||'1.0');
    const title=current?.title||TYPES[type];
    const content=current?.content||latest?.content||'';
    return `
      <section class="v19-legal-editor" data-legal-editor="${type}">
        <h3>${esc(TYPES[type])}</h3>
        <div class="v19-legal-current">Published: ${current?`v${esc(current.version)} · ${esc(new Date(current.published_at||current.created_at).toLocaleDateString())}`:'None'}</div>
        <div class="admin-form-grid">
          <label>New version<input data-version value="${esc(suggested)}" placeholder="1.1"></label>
          <label>Title<input data-title value="${esc(title)}"></label>
          <label class="wide">Document text<textarea data-content rows="14">${esc(content)}</textarea></label>
          <label class="checkbox-card wide"><input data-reaccept type="checkbox"> Require affected existing users to accept this version on next login</label>
        </div>
        <div class="v19-legal-editor-actions">
          <button class="btn btn-small btn-ghost" data-preview type="button">Preview</button>
          <button class="btn btn-small btn-ghost" data-save type="button">Save Draft</button>
          <button class="btn btn-small btn-accent" data-publish type="button">Publish New Version</button>
        </div>
        <div class="v19-legal-history">
          ${rows.slice(0,6).map(v=>`
            <div class="v19-legal-version-row">
              <div><strong>v${esc(v.version)}</strong> ${v.published?'<span class="v19-published-pill">PUBLISHED</span>':''}<small>${esc(v.title)}${v.require_reacceptance?' · re-acceptance required':''}</small></div>
              <div class="actions">
                <button class="btn btn-small btn-ghost" data-load-version="${v.id}" type="button">Load</button>
                ${v.published?'':`<button class="btn btn-small btn-accent" data-publish-version="${v.id}" type="button">Publish</button>`}
              </div>
            </div>`).join('') || '<p class="admin-note">No versions yet.</p>'}
        </div>
      </section>`;
  }

  async function saveEditor(editor,{publish=false}={}) {
    const type=editor.dataset.legalEditor;
    const version=editor.querySelector('[data-version]').value.trim();
    const title=editor.querySelector('[data-title]').value.trim();
    const content=editor.querySelector('[data-content]').value.trim();
    const requireReaccept=editor.querySelector('[data-reaccept]').checked;
    if(!version||!title||!content) return toast('Version, title and document text are required.');

    const {data:existing}=await state.client
      .from('legal_document_versions')
      .select('*')
      .eq('document_type',type)
      .eq('version',version)
      .maybeSingle();

    let id;
    if(existing) {
      if(existing.published) return toast('Published legal versions are immutable. Use a new version number.');
      const {data,error}=await state.client
        .from('legal_document_versions')
        .update({title,content,require_reacceptance:requireReaccept,effective_at:new Date().toISOString(),updated_at:new Date().toISOString()})
        .eq('id',existing.id)
        .select()
        .single();
      if(error) return toast(error.message);
      id=data.id;
    } else {
      const {data,error}=await state.client
        .from('legal_document_versions')
        .insert({
          document_type:type,version,title,content,
          effective_at:new Date().toISOString(),
          require_reacceptance:requireReaccept,
          published:false,
          created_by:state.session.user.id
        })
        .select()
        .single();
      if(error) return toast(error.message);
      id=data.id;
    }

    if(publish) {
      if(requireReaccept && !confirm('Publishing with re-acceptance ON will require affected existing users to accept this version at their next login. Publish now?')) return;
      const {error}=await state.client.rpc('publish_legal_document',{target_document:id});
      if(error) return toast(error.message);
      publishedCache=null;
      toast(`${TYPES[type]} v${version} published.`);
    } else {
      toast(`${TYPES[type]} v${version} saved as draft.`);
    }
    render();
  }

  async function renderLegalAdmin(panel) {
    panel.innerHTML='<h2>⚖️ Legal & Registration</h2><div class="empty-state" style="height:120px">Loading legal documents…</div>';
    try {
      const versions=await fetchAllVersions();
      if(state.adminTab!=='legal') return;
      panel.innerHTML=`
        <h2>⚖️ Legal & Registration</h2>
        <div class="v19-legal-admin-intro">
          <strong>Editable, versioned agreements</strong>
          <p class="admin-note">New registrations always accept the current Common Terms + the correct Teacher/Learner Terms + Privacy Policy. Published versions are kept as an audit trail. Turn on re-acceptance only for material changes.</p>
        </div>
        <div class="v19-legal-admin-grid">
          ${ORDER.map(type=>editorHtml(type,versions)).join('')}
        </div>`;

      panel.querySelectorAll('[data-legal-editor]').forEach(editor=>{
        const type=editor.dataset.legalEditor;
        editor.querySelector('[data-preview]').addEventListener('click',()=>{
          openDocument({
            document_type:type,
            title:editor.querySelector('[data-title]').value.trim()||TYPES[type],
            version:editor.querySelector('[data-version]').value.trim(),
            content:editor.querySelector('[data-content]').value,
            effective_at:new Date().toISOString()
          });
        });
        editor.querySelector('[data-save]').addEventListener('click',()=>saveEditor(editor,{publish:false}));
        editor.querySelector('[data-publish]').addEventListener('click',()=>saveEditor(editor,{publish:true}));

        editor.querySelectorAll('[data-load-version]').forEach(btn=>btn.addEventListener('click',()=>{
          const row=versions.find(v=>v.id===btn.dataset.loadVersion);
          if(!row)return;
          editor.querySelector('[data-title]').value=row.title;
          editor.querySelector('[data-content]').value=row.content;
          editor.querySelector('[data-reaccept]').checked=row.require_reacceptance;
          editor.querySelector('[data-version]').value=row.published?bumpVersion(row.version):row.version;
          toast(row.published?'Published text loaded. A new version number was suggested.':'Draft loaded for editing.');
        }));

        editor.querySelectorAll('[data-publish-version]').forEach(btn=>btn.addEventListener('click',async()=>{
          const row=versions.find(v=>v.id===btn.dataset.publishVersion);
          if(!row)return;
          if(row.require_reacceptance && !confirm(`Publish ${TYPES[type]} v${row.version}? Existing affected users will have to accept it on next login.`))return;
          const {error}=await state.client.rpc('publish_legal_document',{target_document:row.id});
          if(error)return toast(error.message);
          publishedCache=null;
          toast(`${TYPES[type]} v${row.version} published.`);
          render();
        }));
      });
    } catch(err) {
      panel.innerHTML=`<h2>⚖️ Legal & Registration</h2><div class="empty-state">${esc(err.message||'Could not load legal documents.')}</div>`;
    }
  }

  // Add a Legal tab without rewriting the existing Admin system.
  if(typeof renderAdmin==='function') {
    const nativeRenderAdminV19=renderAdmin;
    renderAdmin=function() {
      nativeRenderAdminV19();
      const tabs=els.content.querySelector('.admin-tabs');
      const panel=els.content.querySelector('#adminPanel');
      if(!tabs||!panel)return;

      const btn=document.createElement('button');
      btn.className=`btn btn-ghost ${state.adminTab==='legal'?'active':''}`;
      btn.textContent='⚖️ Legal & Registration';
      btn.addEventListener('click',()=>{state.adminTab='legal';render();});
      tabs.appendChild(btn);

      if(state.adminTab==='legal') renderLegalAdmin(panel);
    };
  }

  globalThis.PTPLegal={
    types:TYPES,
    requiredTypes,
    getPublishedDocuments,
    requiredDocuments,
    openDocument,
    clearCache:()=>{publishedCache=null;},
    checkReacceptance
  };
})();
