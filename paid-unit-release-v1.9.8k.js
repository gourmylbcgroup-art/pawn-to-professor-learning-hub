/* Pawn to Professor v1.9.8k — Manual Paid Unit Release
   Load AFTER payments-accounting.js and admin-menu scripts.
   No new Vercel function: uses Supabase RPCs installed by the SQL patch.
*/
(() => {
  if (typeof state === 'undefined' || typeof renderAdmin === 'undefined') return;

  const VERSION = '1.9.8k';

  function esc(v='') {
    if (typeof escapeHtml === 'function') return escapeHtml(v);
    return String(v).replace(/[&<>"']/g,c=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function unitNumber(name='') {
    const m=String(name).match(/\d+/);
    return m ? Number(m[0]) : 999999;
  }

  function distinctUnitNames() {
    const map=new Map();
    (state.units||[]).forEach(u=>{
      if(!u?.name)return;
      const key=String(u.name).trim().toLowerCase();
      if(!map.has(key))map.set(key,String(u.name).trim());
    });
    return [...map.values()].sort((a,b)=>unitNumber(a)-unitNumber(b)||a.localeCompare(b));
  }

  async function loadReleased() {
    const {data,error}=await state.client.rpc('list_paid_unit_releases');
    if(error)throw error;
    return data||[];
  }

  async function renderPaidRelease(panel) {
    panel.innerHTML=`
      <div>
        <h2>📤 Paid Unit Release</h2>
        <p class="admin-note">
          Annual payment keeps the member active for the paid period, but learning Units open only when you release them here.
          Unit 1 is open by default. Releasing Unit 2 opens every published "Unit 2" across all grades for all active annual paid members.
        </p>
      </div>

      <div class="admin-form-grid" style="margin-top:1em">
        <label>
          Unit to release
          <select id="v198kUnit">
            ${distinctUnitNames().map(name=>`<option value="${esc(name)}">${esc(name)}</option>`).join('')}
          </select>
        </label>

        <div class="wide button-row">
          <button id="v198kRelease" class="btn btn-accent" type="button">📤 Release to All Active Paid Users</button>
          <button id="v198kRelock" class="btn btn-danger" type="button">🔒 Re-lock for Paid Users</button>
        </div>
      </div>

      <hr class="soft">
      <h3>Currently released to annual paid members</h3>
      <div id="v198kReleased"><div class="empty-state" style="height:100px">Loading…</div></div>

      <p class="admin-note" style="margin-top:1em">
        Direct individual Unit access and Access Groups are not changed by this tool.
        Re-locking only removes the global annual-paid release.
      </p>
    `;

    const select=panel.querySelector('#v198kUnit');
    const releaseBtn=panel.querySelector('#v198kRelease');
    const relockBtn=panel.querySelector('#v198kRelock');
    const list=panel.querySelector('#v198kReleased');

    async function paint() {
      try {
        const rows=await loadReleased();
        if(!rows.length){
          list.innerHTML='<div class="empty-state" style="height:100px">No paid Units released yet.</div>';
          return;
        }
        list.innerHTML=`
          <div class="package-list">
            ${rows.map(r=>`
              <div class="package-card">
                <div class="package-head">
                  <div>
                    <strong>✅ ${esc(r.unit_name)}</strong>
                    <div class="meta">${Number(r.released_units||0)} published grade/year Unit${Number(r.released_units||0)===1?'':'s'} released</div>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>`;
      } catch(err) {
        list.innerHTML=`<div class="empty-state" style="height:100px">${esc(err.message||'Could not load paid releases.')}</div>`;
      }
    }

    releaseBtn.addEventListener('click',async()=>{
      const name=select.value;
      if(!name)return toast('Choose a Unit.');
      if(!confirm(`Release ${name} to ALL active annual paid users?`))return;

      releaseBtn.disabled=true;
      releaseBtn.textContent='Releasing…';
      try{
        const {data,error}=await state.client.rpc('release_paid_unit_name',{target_unit_name:name});
        if(error)throw error;
        const row=(data||[])[0]||{};
        toast(`${name} released to all active paid users.`);
        await paint();
      }catch(err){
        toast(err.message||'Could not release this Unit.');
      }finally{
        releaseBtn.disabled=false;
        releaseBtn.textContent='📤 Release to All Active Paid Users';
      }
    });

    relockBtn.addEventListener('click',async()=>{
      const name=select.value;
      if(!name)return toast('Choose a Unit.');
      if(!confirm(`Re-lock ${name} for annual paid users?\n\nDirect/manual access and Access Groups will remain unchanged.`))return;

      relockBtn.disabled=true;
      relockBtn.textContent='Re-locking…';
      try{
        const {data,error}=await state.client.rpc('revoke_paid_unit_name',{target_unit_name:name});
        if(error)throw error;
        toast(`${name} re-locked for annual paid users.`);
        await paint();
      }catch(err){
        toast(err.message||'Could not re-lock this Unit.');
      }finally{
        relockBtn.disabled=false;
        relockBtn.textContent='🔒 Re-lock for Paid Users';
      }
    });

    await paint();
  }

  const nativeRenderAdminV198k=renderAdmin;
  renderAdmin=function(...args){
    const result=nativeRenderAdminV198k(...args);

    const tabs=els.content.querySelector('.admin-tabs');
    const panel=els.content.querySelector('#adminPanel');
    if(!tabs||!panel)return result;

    const old=[...tabs.querySelectorAll('button')].filter(b=>b.dataset.v198kPaidRelease==='true');
    let btn=old.shift()||document.createElement('button');
    old.forEach(x=>x.remove());

    if(!btn.isConnected){
      btn.type='button';
      btn.className='btn btn-ghost';
      btn.dataset.v198kPaidRelease='true';
      btn.textContent='📤 Paid Release';
      tabs.appendChild(btn);
    }

    const clean=btn.cloneNode(true);
    clean.dataset.v198kPaidRelease='true';
    clean.classList.toggle('active',state.adminTab==='paidRelease');
    btn.replaceWith(clean);

    clean.addEventListener('click',()=>{
      state.adminTab='paidRelease';
      render();
    });

    if(state.adminTab==='paidRelease'){
      renderPaidRelease(panel);
    }

    return result;
  };

  globalThis.PTP_PAID_UNIT_RELEASE={version:VERSION};
})();
