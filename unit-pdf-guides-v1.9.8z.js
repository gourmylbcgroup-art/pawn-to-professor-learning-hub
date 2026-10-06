/* Pawn to Professor v1.9.8z — Secure Unit PDF Guides */
(() => {
  if (typeof state === 'undefined' || typeof els === 'undefined') return;
  const VERSION='1.9.8z';
  const PDFJS_URL='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  const PDFJS_WORKER='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  let pdfJsPromise=null;

  function esc(v=''){
    if(typeof escapeHtml==='function')return escapeHtml(v);
    return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  async function api(payload){
    const headers=await authHeaders();
    const res=await fetch('/api/unit-guide',{method:'POST',headers,cache:'no-store',body:JSON.stringify(payload)});
    const body=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error(body.error||'Unit guide request failed.');
    return body;
  }

  function loadPdfJs(){
    if(globalThis.pdfjsLib)return Promise.resolve(globalThis.pdfjsLib);
    if(pdfJsPromise)return pdfJsPromise;
    pdfJsPromise=new Promise((resolve,reject)=>{
      const s=document.createElement('script');
      s.src=PDFJS_URL;s.crossOrigin='anonymous';s.referrerPolicy='no-referrer';
      s.onload=()=>{
        if(!globalThis.pdfjsLib)return reject(new Error('PDF viewer library did not load.'));
        globalThis.pdfjsLib.GlobalWorkerOptions.workerSrc=PDFJS_WORKER;
        resolve(globalThis.pdfjsLib);
      };
      s.onerror=()=>reject(new Error('Could not load the PDF viewer library.'));
      document.head.appendChild(s);
    });
    return pdfJsPromise;
  }

  function closeViewer(){document.querySelector('.ptp-unit-guide-overlay')?.remove();document.body.classList.remove('ptp-guide-open')}
  function blockViewerShortcuts(e){const k=String(e.key||'').toLowerCase();if((e.ctrlKey||e.metaKey)&&['s','p','c','u'].includes(k)){e.preventDefault();e.stopPropagation()}}

  async function openGuideViewer(unitId,title='Unit Activity Guide'){
    closeViewer();
    const overlay=document.createElement('div');overlay.className='ptp-unit-guide-overlay';
    overlay.innerHTML=`<section class="ptp-unit-guide-shell" role="dialog" aria-modal="true"><header class="ptp-unit-guide-head"><div><div class="ptp-unit-guide-kicker">PAWN TO PROFESSOR</div><h2>${esc(title)}</h2><p>View-only Unit activity guide</p></div><button class="btn btn-ghost" data-guide-close type="button">✕ Close</button></header><div class="ptp-unit-guide-security">🔒 Private viewer · No download or print controls · Access is checked against your Unit permissions</div><div class="ptp-unit-guide-pages" data-pages><div class="ptp-unit-guide-loading"><div class="spinner"></div><strong>Opening secure guide…</strong></div></div><footer class="ptp-unit-guide-footer"><span>pawntoprofessor.com</span><span data-page-status></span></footer></section>`;
    document.body.appendChild(overlay);document.body.classList.add('ptp-guide-open');
    overlay.querySelector('[data-guide-close]').addEventListener('click',closeViewer);
    overlay.addEventListener('click',e=>{if(e.target===overlay)closeViewer()});
    overlay.addEventListener('contextmenu',e=>e.preventDefault());overlay.addEventListener('copy',e=>e.preventDefault());overlay.addEventListener('dragstart',e=>e.preventDefault());
    document.addEventListener('keydown',blockViewerShortcuts,{capture:true});
    const mo=new MutationObserver(()=>{if(!document.body.contains(overlay)){document.removeEventListener('keydown',blockViewerShortcuts,{capture:true});mo.disconnect()}});mo.observe(document.body,{childList:true});
    const pages=overlay.querySelector('[data-pages]'),status=overlay.querySelector('[data-page-status]');
    try{
      const [signed,pdfjsLib]=await Promise.all([api({action:'signed-url',unitId,deviceId:typeof getOrCreateDeviceId==='function'?getOrCreateDeviceId():''}),loadPdfJs()]);
      const pdf=await pdfjsLib.getDocument({url:signed.url,disableFontFace:false,useSystemFonts:true,rangeChunkSize:262144}).promise;
      pages.innerHTML='';status.textContent=`${pdf.numPages} page${pdf.numPages===1?'':'s'}`;
      const slots=[];
      for(let n=1;n<=pdf.numPages;n++){const slot=document.createElement('div');slot.className='ptp-pdf-page-slot';slot.dataset.page=String(n);slot.innerHTML=`<div class="ptp-pdf-placeholder">Page ${n}</div><div class="ptp-pdf-watermark">pawntoprofessor.com</div>`;pages.appendChild(slot);slots.push(slot)}
      const rendered=new Set(),rendering=new Set();
      async function renderPage(slot){const n=Number(slot.dataset.page);if(rendered.has(n)||rendering.has(n))return;rendering.add(n);try{const page=await pdf.getPage(n);const base=page.getViewport({scale:1});const maxWidth=Math.min(1100,Math.max(320,pages.clientWidth-30));const scale=Math.min(2,maxWidth/base.width);const viewport=page.getViewport({scale});const ratio=Math.min(window.devicePixelRatio||1,1.5);const canvas=document.createElement('canvas');canvas.className='ptp-pdf-canvas';canvas.width=Math.floor(viewport.width*ratio);canvas.height=Math.floor(viewport.height*ratio);canvas.style.width=`${Math.floor(viewport.width)}px`;canvas.style.height=`${Math.floor(viewport.height)}px`;const ctx=canvas.getContext('2d',{alpha:false});await page.render({canvasContext:ctx,viewport,transform:ratio===1?null:[ratio,0,0,ratio,0,0]}).promise;slot.querySelector('.ptp-pdf-placeholder')?.remove();slot.insertBefore(canvas,slot.firstChild);rendered.add(n)}catch(err){const ph=slot.querySelector('.ptp-pdf-placeholder');if(ph)ph.textContent=`Could not render page ${n}.`}finally{rendering.delete(n)}}
      const observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting)renderPage(e.target)}),{root:pages,rootMargin:'900px 0px'});slots.forEach(s=>observer.observe(s));if(slots[0])renderPage(slots[0]);
    }catch(err){pages.innerHTML=`<div class="ptp-unit-guide-error"><strong>Could not open this guide.</strong><span>${esc(err.message||'Access was denied.')}</span></div>`}
  }

  async function injectGuideIntoUnit(){
    if(state.view!=='activities'||!state.unit?.id)return;const unitId=state.unit.id;
    try{const meta=await api({action:'metadata',unitId,deviceId:typeof getOrCreateDeviceId==='function'?getOrCreateDeviceId():''});if(!meta?.available||state.view!=='activities'||state.unit?.id!==unitId)return;els.content.querySelector('[data-unit-guide-card]')?.remove();const section=document.createElement('section');section.dataset.unitGuideCard='true';section.className='ptp-unit-guide-card';section.innerHTML=`<div class="ptp-unit-guide-card-icon">📘</div><div class="ptp-unit-guide-card-copy"><h2>${esc(meta.title||'Unit Activity Guide')}</h2><p>${esc(meta.description||'View the activity list and teaching guide for this Unit.')}</p><small>View-only PDF · protected by your Unit access</small></div><button class="btn btn-accent" data-open-guide type="button">VIEW GUIDE 🔐</button>`;section.querySelector('[data-open-guide]').addEventListener('click',()=>openGuideViewer(unitId,meta.title||'Unit Activity Guide'));const empty=els.content.querySelector('.empty-state');if(empty&&/No games or resources/i.test(empty.textContent||''))empty.remove();const heading=els.content.querySelector('.section-heading');if(heading)els.content.insertBefore(section,heading);else els.content.prepend(section)}catch(err){console.debug('Unit guide unavailable:',err.message)}
  }

  if(typeof renderActivities==='function'){const native=renderActivities;renderActivities=async function(...args){const result=await native(...args);await injectGuideIntoUnit();return result}}

  function unitOptions(){return(state.units||[]).map(u=>`<option value="${u.id}">${esc(typeof unitPath==='function'?unitPath(u.id):`${u.name}${u.title?` — ${u.title}`:''}`)}</option>`).join('')}

  async function renderAdminGuides(panel){
    panel.innerHTML=`<h2>📘 Unit Activity Guides</h2><p class="admin-note">PDFs stay in the separate private Supabase Storage project. Save only the private Storage path here.</p><div class="ptp-guide-admin-grid"><label>Unit<select id="ptpGuideUnit">${unitOptions()}</select></label><label>Guide title<input id="ptpGuideTitle" maxlength="160" value="Unit Activity Guide"></label><label class="wide">Private Storage path<input id="ptpGuidePath" maxlength="500" placeholder="grade6/unit4-activity-guide.pdf"><span class="field-help">Inside private bucket <strong>unit-guides</strong>. Do not paste a URL.</span></label><label class="wide">Description<input id="ptpGuideDescription" maxlength="300" value="View the activity list and teaching guide for this Unit."></label><label class="checkbox-card wide"><input id="ptpGuidePublished" type="checkbox" checked> Published — members with access to this Unit can view the guide</label></div><div class="button-row"><button id="ptpGuideSave" class="btn btn-accent" type="button">Save Guide</button><button id="ptpGuidePreview" class="btn btn-ghost" type="button">Preview</button><button id="ptpGuideDelete" class="btn btn-danger" type="button">Remove Guide</button></div><hr class="soft"><h3>Configured Unit Guides</h3><div id="ptpGuideList"><div class="empty-state" style="height:100px">Loading…</div></div>`;
    const unit=panel.querySelector('#ptpGuideUnit'),title=panel.querySelector('#ptpGuideTitle'),path=panel.querySelector('#ptpGuidePath'),desc=panel.querySelector('#ptpGuideDescription'),published=panel.querySelector('#ptpGuidePublished'),list=panel.querySelector('#ptpGuideList');let rows=[];
    function row(){return rows.find(r=>r.unit_id===unit.value)||null}
    function sync(){const r=row();title.value=r?.title||'Unit Activity Guide';path.value=r?.storage_path||'';desc.value=r?.description||'View the activity list and teaching guide for this Unit.';published.checked=r?r.published!==false:true}
    function paint(){if(!rows.length){list.innerHTML='<div class="empty-state" style="height:100px">No Unit guides configured yet.</div>';return}list.innerHTML=`<div class="ptp-guide-admin-list">${rows.map(r=>`<button class="ptp-guide-admin-row" type="button" data-guide-unit="${r.unit_id}"><span><strong>${esc(typeof unitPath==='function'?unitPath(r.unit_id):r.unit_id)}</strong><small>${esc(r.title)} · ${esc(r.storage_path)}</small></span><span class="status-pill ${r.published?'active':'inactive'}">${r.published?'Published':'Hidden'}</span></button>`).join('')}</div>`;list.querySelectorAll('[data-guide-unit]').forEach(b=>b.addEventListener('click',()=>{unit.value=b.dataset.guideUnit;sync()}))}
    async function load(){const d=await api({action:'admin-list'});rows=d.guides||[];paint();sync()}
    unit.addEventListener('change',sync);
    panel.querySelector('#ptpGuideSave').addEventListener('click',async e=>{const b=e.currentTarget;if(!path.value.trim())return toast('Enter the private PDF Storage path.');b.disabled=true;b.textContent='Saving…';try{await api({action:'admin-save',unitId:unit.value,title:title.value.trim(),description:desc.value.trim(),storagePath:path.value.trim(),published:published.checked});toast('Unit Activity Guide saved.');await load()}catch(err){toast(err.message)}finally{b.disabled=false;b.textContent='Save Guide'}});
    panel.querySelector('#ptpGuidePreview').addEventListener('click',()=>{if(!row())return toast('Save this guide first.');openGuideViewer(unit.value,title.value.trim()||'Unit Activity Guide')});
    panel.querySelector('#ptpGuideDelete').addEventListener('click',async e=>{if(!row())return toast('There is no saved guide for this Unit.');if(!confirm('Remove this Unit guide from the website?\n\nThe PDF itself will remain in the separate Supabase Storage bucket.'))return;const b=e.currentTarget;b.disabled=true;try{await api({action:'admin-delete',unitId:unit.value});toast('Unit guide removed from the website.');await load()}catch(err){toast(err.message)}finally{b.disabled=false}});
    try{await load()}catch(err){list.innerHTML=`<div class="empty-state">${esc(err.message)}</div>`}
  }

  if(typeof renderAdmin==='function'){const native=renderAdmin;renderAdmin=function(...args){const result=native(...args);if(typeof isStaff==='function'&&!isStaff())return result;const tabs=els.content.querySelector('.admin-tabs'),panel=els.content.querySelector('#adminPanel');if(!tabs||!panel)return result;let b=[...tabs.querySelectorAll('button')].find(x=>x.dataset.ptpUnitGuides==='true');if(!b){b=document.createElement('button');b.type='button';b.className='btn btn-ghost';b.dataset.ptpUnitGuides='true';b.textContent='📘 Unit Guides';const resources=[...tabs.querySelectorAll('button')].find(x=>/Resources/i.test(x.textContent||''));if(resources)resources.insertAdjacentElement('afterend',b);else tabs.appendChild(b)}const clean=b.cloneNode(true);clean.dataset.ptpUnitGuides='true';clean.classList.toggle('active',state.adminTab==='unitGuides');b.replaceWith(clean);clean.addEventListener('click',()=>{state.adminTab='unitGuides';render()});if(state.adminTab==='unitGuides')renderAdminGuides(panel);return result}}

  globalThis.PTP_UNIT_GUIDES={version:VERSION,open:openGuideViewer};
})();
