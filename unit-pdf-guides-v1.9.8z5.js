/* Pawn to Professor v1.9.8z5 — Unit Guides crash fix
   Fixes the z4 MutationObserver re-render loop.
*/
(() => {
  if (typeof state === 'undefined' || typeof els === 'undefined') return;

  async function guideApi(payload) {
    const headers = await authHeaders();
    const res = await fetch('/api/security?action=unit-guide', {
      method:'POST',
      headers,
      cache:'no-store',
      body:JSON.stringify({guideAction:payload.action,...payload})
    });
    const body = await res.json().catch(()=>({}));
    if (!res.ok) throw new Error(body.error || 'Unit guide request failed.');
    return body;
  }

  async function openUnitGuide(unitId,title='Unit Activity Guide') {
    try {
      const result = await guideApi({
        action:'signed-url',
        unitId,
        deviceId:typeof getOrCreateDeviceId==='function'?getOrCreateDeviceId():''
      });
      window.open(result.url,'_blank','noopener,noreferrer');
    } catch (err) {
      toast(err.message || 'Could not open Unit Activity Guide.');
    }
  }

  async function injectGuideCard() {
    if (state.view!=='activities' || !state.unit?.id) return;
    try {
      const meta = await guideApi({
        action:'metadata',
        unitId:state.unit.id,
        deviceId:typeof getOrCreateDeviceId==='function'?getOrCreateDeviceId():''
      });
      if (!meta.available || state.view!=='activities') return;
      if (els.content.querySelector('[data-unit-guide-card]')) return;

      const card=document.createElement('section');
      card.dataset.unitGuideCard='true';
      card.className='ptp-unit-guide-card';
      card.innerHTML=`<div class="ptp-unit-guide-card-icon">📘</div>
      <div class="ptp-unit-guide-card-copy">
        <h2>${escapeHtml(meta.title||'Unit Activity Guide')}</h2>
        <p>${escapeHtml(meta.description||'View the activity list for this Unit.')}</p>
        <small>Private PDF · Unit access required</small>
      </div>
      <button class="btn btn-accent" data-open-guide type="button">VIEW GUIDE 🔐</button>`;
      card.querySelector('[data-open-guide]').addEventListener('click',()=>openUnitGuide(state.unit.id,meta.title));
      els.content.prepend(card);
    } catch {}
  }

  if (typeof renderActivities==='function') {
    const nativeActivities=renderActivities;
    renderActivities=async function(...args){
      const result=await nativeActivities(...args);
      await injectGuideCard();
      return result;
    };
  }

  async function renderAdminUnitGuides(panel) {
    if (!panel || panel.dataset.unitGuidesLoading === 'true') return;
    panel.dataset.unitGuidesLoading = 'true';
    panel.dataset.unitGuidesRendered = 'true';
    panel.innerHTML='<h2>📘 Unit Guides</h2><div class="empty-state" style="height:100px">Loading…</div>';

    let rows=[];
    try{
      const list=await guideApi({action:'admin-list'});
      rows=list.guides||[];
    }catch(err){
      panel.innerHTML=`<h2>📘 Unit Guides</h2><div class="empty-state">${escapeHtml(err.message)}</div>`;
      panel.dataset.unitGuidesLoading = 'false';
      return;
    }

    const units = Array.isArray(state.units) ? state.units : [];
    if (!units.length) {
      panel.innerHTML = `<h2>📘 Unit Guides</h2>
        <div class="empty-state">No published Units are loaded yet.</div>`;
      panel.dataset.unitGuidesLoading = 'false';
      return;
    }

    panel.innerHTML=`<h2>📘 Unit Guides</h2>
      <p class="admin-note">PDF files stay in your separate private Supabase Storage bucket <strong>unit-guides</strong>.</p>
      <div class="admin-form-grid">
        <label>Unit<select id="ugUnit">${units.map(u=>`<option value="${u.id}">${escapeHtml(typeof unitPath==='function'?unitPath(u.id):u.name)}</option>`).join('')}</select></label>
        <label>Title<input id="ugTitle" value="Unit Activity Guide"></label>
        <label class="wide">Private PDF path<input id="ugPath" placeholder="Grade 1/20 Mats en 1.pdf"></label>
        <label class="wide">Description<input id="ugDescription" value="View the activity list and teaching guide for this Unit."></label>
        <label class="checkbox-card wide"><input id="ugPublished" type="checkbox" checked> Published</label>
      </div>
      <div class="button-row">
        <button id="ugSave" class="btn btn-accent" type="button">Save Guide</button>
        <button id="ugDelete" class="btn btn-danger" type="button">Remove Guide</button>
      </div>
      <hr class="soft">
      <div id="ugList"></div>`;

    const unit=panel.querySelector('#ugUnit');
    const title=panel.querySelector('#ugTitle');
    const path=panel.querySelector('#ugPath');
    const desc=panel.querySelector('#ugDescription');
    const published=panel.querySelector('#ugPublished');
    const listEl=panel.querySelector('#ugList');

    function current(){ return rows.find(r=>r.unit_id===unit.value); }
    function sync(){
      const r=current();
      title.value=r?.title||'Unit Activity Guide';
      path.value=r?.storage_path||'';
      desc.value=r?.description||'View the activity list and teaching guide for this Unit.';
      published.checked=r?r.published!==false:true;
    }
    function paint(){
      listEl.innerHTML=rows.length
        ? rows.map(r=>`<div class="package-card"><strong>${escapeHtml(typeof unitPath==='function'?unitPath(r.unit_id):r.unit_id)}</strong><div class="meta">${escapeHtml(r.storage_path)}</div></div>`).join('')
        : '<p class="admin-note">No Unit guides configured yet.</p>';
    }

    unit.addEventListener('change',sync);

    panel.querySelector('#ugSave').addEventListener('click',async()=>{
      if(!path.value.trim()) return toast('Enter the private PDF path.');
      try{
        await guideApi({
          action:'admin-save',
          unitId:unit.value,
          title:title.value.trim(),
          description:desc.value.trim(),
          storagePath:path.value.trim(),
          published:published.checked
        });
        toast('Unit Guide saved.');
        const list=await guideApi({action:'admin-list'});
        rows=list.guides||[];
        paint(); sync();
      }catch(err){ toast(err.message); }
    });

    panel.querySelector('#ugDelete').addEventListener('click',async()=>{
      if(!current()) return toast('No saved guide for this Unit.');
      if(!confirm('Remove this guide from the website?')) return;
      try{
        await guideApi({action:'admin-delete',unitId:unit.value});
        toast('Guide removed.');
        const list=await guideApi({action:'admin-list'});
        rows=list.guides||[];
        paint(); sync();
      }catch(err){ toast(err.message); }
    });

    paint();
    sync();
    panel.dataset.unitGuidesLoading = 'false';
  }

  function ensureAdminMenu() {
    if (state.view !== 'admin') return;

    const tabs = els.content?.querySelector('.admin-tabs');
    const panel = els.content?.querySelector('#adminPanel');
    if (!tabs || !panel) return;

    let btn=tabs.querySelector('[data-unit-guides-native="true"]');
    if(!btn){
      btn=document.createElement('button');
      btn.type='button';
      btn.className='btn btn-ghost';
      btn.dataset.unitGuidesNative='true';
      btn.textContent='📘 Unit Guides';

      const resources=[...tabs.querySelectorAll('button')].find(b=>/Resources/i.test(b.textContent||''));
      if(resources) resources.insertAdjacentElement('afterend',btn);
      else tabs.prepend(btn);

      btn.addEventListener('click',()=>{
        state.adminTab='unitGuides';
        [...tabs.querySelectorAll('button')].forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');

        // Render directly; do NOT call render(), which would rebuild Admin.
        if (panel.dataset.unitGuidesRendered !== 'true') {
          void renderAdminUnitGuides(panel);
        }
      });
    }

    if(state.adminTab==='unitGuides'){
      [...tabs.querySelectorAll('button')].forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');

      // Critical z5 fix: render only once per newly-created Admin panel.
      if (panel.dataset.unitGuidesRendered !== 'true') {
        void renderAdminUnitGuides(panel);
      }
    }
  }

  // Observe only enough to re-add the menu after the Admin DOM is rebuilt.
  let scheduled=false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled=true;
    requestAnimationFrame(() => {
      scheduled=false;
      ensureAdminMenu();
    });
  });
  observer.observe(document.getElementById('contentArea') || document.body,{
    childList:true,
    subtree:true
  });

  document.addEventListener('click',()=>setTimeout(ensureAdminMenu,0),true);
  setTimeout(ensureAdminMenu,250);

  globalThis.PTP_UNIT_GUIDES_MENU_FIX='1.9.8z5';
})();
