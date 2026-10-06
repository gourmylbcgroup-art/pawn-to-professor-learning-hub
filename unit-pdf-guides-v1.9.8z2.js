/* Pawn to Professor v1.9.8z2 — PDF Guides through existing /api/security function */
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

  async function injectGuide() {
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
    const native=renderActivities;
    renderActivities=async function(...args){
      const result=await native(...args);
      await injectGuide();
      return result;
    };
  }

  async function renderAdminUnitGuides(panel) {
    const list=await guideApi({action:'admin-list'});
    const rows=list.guides||[];
    panel.innerHTML=`<h2>📘 Unit Guides</h2>
      <p class="admin-note">PDF files stay in your separate private Supabase Storage bucket <strong>unit-guides</strong>.</p>
      <div class="admin-form-grid">
        <label>Unit<select id="ugUnit">${state.units.map(u=>`<option value="${u.id}">${escapeHtml(typeof unitPath==='function'?unitPath(u.id):u.name)}</option>`).join('')}</select></label>
        <label>Title<input id="ugTitle" value="Unit Activity Guide"></label>
        <label class="wide">Private PDF path<input id="ugPath" placeholder="grade6/unit4-activity-guide.pdf"></label>
        <label class="wide">Description<input id="ugDescription" value="View the activity list and teaching guide for this Unit."></label>
        <label class="checkbox-card wide"><input id="ugPublished" type="checkbox" checked> Published</label>
      </div>
      <div class="button-row">
        <button id="ugSave" class="btn btn-accent">Save Guide</button>
        <button id="ugDelete" class="btn btn-danger">Remove Guide</button>
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
      listEl.innerHTML=rows.length?rows.map(r=>`<div class="package-card"><strong>${escapeHtml(typeof unitPath==='function'?unitPath(r.unit_id):r.unit_id)}</strong><div class="meta">${escapeHtml(r.storage_path)}</div></div>`).join(''):'<p class="admin-note">No Unit guides configured yet.</p>';
    }
    unit.addEventListener('change',sync);
    panel.querySelector('#ugSave').addEventListener('click',async()=>{
      if(!path.value.trim())return toast('Enter the private PDF path.');
      await guideApi({action:'admin-save',unitId:unit.value,title:title.value.trim(),description:desc.value.trim(),storagePath:path.value.trim(),published:published.checked});
      toast('Unit Guide saved. Refresh Admin to see the updated list.');
    });
    panel.querySelector('#ugDelete').addEventListener('click',async()=>{
      if(!current())return toast('No saved guide for this Unit.');
      if(!confirm('Remove this guide from the website?'))return;
      await guideApi({action:'admin-delete',unitId:unit.value});
      toast('Guide removed. Refresh Admin.');
    });
    paint();sync();
  }

  if (typeof renderAdmin==='function') {
    const nativeAdmin=renderAdmin;
    renderAdmin=function(...args){
      const result=nativeAdmin(...args);
      if(typeof isStaff==='function'&&!isStaff())return result;
      const tabs=els.content.querySelector('.admin-tabs');
      const panel=els.content.querySelector('#adminPanel');
      if(!tabs||!panel)return result;

      let btn=[...tabs.querySelectorAll('button')].find(b=>b.dataset.unitGuides==='true');
      if(!btn){
        btn=document.createElement('button');
        btn.type='button';
        btn.className='btn btn-ghost';
        btn.dataset.unitGuides='true';
        btn.textContent='📘 Unit Guides';
        tabs.appendChild(btn);
      }
      const clean=btn.cloneNode(true);
      clean.classList.toggle('active',state.adminTab==='unitGuides');
      btn.replaceWith(clean);
      clean.addEventListener('click',()=>{state.adminTab='unitGuides';render();});
      if(state.adminTab==='unitGuides')renderAdminUnitGuides(panel).catch(e=>{panel.innerHTML=`<div class="empty-state">${escapeHtml(e.message)}</div>`;});
      return result;
    };
  }
})();
