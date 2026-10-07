/* Pawn to Professor v1.9.8z8 — Manual Announcement Manager (clean compact version) */
(() => {
  if (typeof state === 'undefined' || typeof els === 'undefined') return;

  const VERSION = '1.9.8z8';

  function esc(v='') {
    if (typeof escapeHtml === 'function') return escapeHtml(v);
    return String(v).replace(/[&<>"']/g,c=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  async function api(payload) {
    const headers = await authHeaders();
    const res = await fetch('/api/security?action=unit-release-announcement', {
      method:'POST',
      headers,
      cache:'no-store',
      body:JSON.stringify(payload)
    });
    const body = await res.json().catch(()=>({}));
    if (!res.ok) throw new Error(body.error || 'Announcement request failed.');
    return body;
  }

  async function loadAnnouncement() {
    if (!state.client || !state.session) {
      state.releaseAnnouncements = [];
      return;
    }
    const now = new Date().toISOString();
    const {data,error} = await state.client
      .from('release_announcements')
      .select('*')
      .eq('published', true)
      .lte('publish_at', now)
      .order('publish_at', {ascending:false})
      .limit(10);

    if (error) {
      state.releaseAnnouncements = [];
      return;
    }

    state.releaseAnnouncements = (data || [])
      .filter(r => !r.expires_at || new Date(r.expires_at) > new Date())
      .slice(0,1);
  }

  if (typeof loadExternalTools === 'function') {
    const nativeLoadExternalTools = loadExternalTools;
    loadExternalTools = async function(...args) {
      const result = await nativeLoadExternalTools(...args);
      await loadAnnouncement().catch(()=>{state.releaseAnnouncements=[];});
      return result;
    };
  }

  if (typeof renderYears === 'function') {
    const nativeRenderYears = renderYears;
    renderYears = function(...args) {
      const result = nativeRenderYears(...args);

      // Remove any stale announcement UI from earlier patches.
      els.content?.querySelectorAll('.release-news-panel,.ptp-announcement-strip')
        .forEach(el => el.remove());

      const row = (state.releaseAnnouncements || [])[0];
      if (!row) return result;

      const wrap = document.createElement('section');
      wrap.className = 'ptp-announcement-strip';
      wrap.innerHTML = `
        <div class="ptp-announcement-icon">🆕</div>
        <div class="ptp-announcement-copy">
          <strong>${esc(row.title || 'New release')}</strong>
          ${row.message ? `<span>${esc(row.message)}</span>` : ''}
        </div>
        <small>${row.publish_at ? new Date(row.publish_at).toLocaleDateString() : ''}</small>`;
      els.content.prepend(wrap);
      return result;
    };
  }

  function toLocalInput(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad=n=>String(n).padStart(2,'0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function fromLocalInput(v) {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  async function renderAnnouncementAdmin(panel) {
    panel.dataset.announcementsRendered = 'true';
    panel.innerHTML = `<h2>📣 Announcements</h2><div class="empty-state" style="height:100px">Loading…</div>`;

    let rows=[];
    try {
      rows = (await api({mode:'list'})).announcements || [];
    } catch(err) {
      panel.innerHTML = `<h2>📣 Announcements</h2><div class="health-banner bad">${esc(err.message)}</div>`;
      return;
    }

    panel.innerHTML = `
      <h2>📣 Announcements</h2>
      <p class="admin-note">Write a short homepage announcement. Only the newest active announcement is shown.</p>

      <div class="admin-form-grid">
        <label>Title
          <input id="annTitle" maxlength="80" value="New release">
        </label>
        <label>Publish date / time
          <input id="annPublishAt" type="datetime-local">
        </label>
        <label class="wide">Short message
          <input id="annMessage" maxlength="180" value="New Unit content is now available.">
        </label>
        <label>Expiry date / time
          <input id="annExpiresAt" type="datetime-local">
        </label>
        <label class="checkbox-card">
          <input id="annPublished" type="checkbox" checked>
          Show on homepage
        </label>
      </div>

      <div class="button-row">
        <button id="annSave" class="btn btn-accent" type="button">Save Announcement</button>
        <button id="annSaveEmail" class="btn btn-ghost" type="button">Save + Email Members</button>
      </div>

      <hr class="soft">
      <h3>Existing announcements</h3>
      <div id="annList"></div>`;

    const title=panel.querySelector('#annTitle');
    const message=panel.querySelector('#annMessage');
    const publishAt=panel.querySelector('#annPublishAt');
    const expiresAt=panel.querySelector('#annExpiresAt');
    const published=panel.querySelector('#annPublished');
    const list=panel.querySelector('#annList');

    publishAt.value = toLocalInput(new Date().toISOString());

    function paint() {
      list.innerHTML = rows.length ? rows.map(r=>`
        <div class="announcement-admin-card">
          <div>
            <strong>${esc(r.title || 'Announcement')}</strong>
            <p>${esc(r.message || '')}</p>
            <small>${r.published?'Visible':'Hidden'} · ${r.publish_at?new Date(r.publish_at).toLocaleString():'No publish date'}${r.expires_at?` · Expires ${new Date(r.expires_at).toLocaleString()}`:' · No expiry'}</small>
          </div>
          <div class="announcement-admin-actions">
            <button class="btn btn-small btn-ghost" data-edit="${r.id}" type="button">Edit</button>
            <button class="btn btn-small btn-danger" data-delete="${r.id}" type="button">Delete</button>
          </div>
        </div>`).join('') : '<p class="admin-note">No announcements yet.</p>';

      list.querySelectorAll('[data-edit]').forEach(btn=>btn.addEventListener('click',()=>{
        const r=rows.find(x=>String(x.id)===String(btn.dataset.edit));
        if(!r)return;
        panel.dataset.editId=r.id;
        title.value=r.title||'';
        message.value=r.message||'';
        publishAt.value=toLocalInput(r.publish_at);
        expiresAt.value=toLocalInput(r.expires_at);
        published.checked=r.published!==false;
        panel.querySelector('#annSave').textContent='Update Announcement';
        panel.scrollTop=0;
      }));

      list.querySelectorAll('[data-delete]').forEach(btn=>btn.addEventListener('click',async()=>{
        if(!confirm('Delete this announcement?'))return;
        try{
          await api({mode:'delete',id:btn.dataset.delete});
          rows=(await api({mode:'list'})).announcements||[];
          paint();
          await loadAnnouncement();
          toast('Announcement deleted.');
        }catch(err){toast(err.message);}
      }));
    }

    async function save(sendEmail){
      const t=title.value.trim();
      const m=message.value.trim();
      if(!t)return toast('Enter a title.');
      if(t.length>80)return toast('Title is too long.');
      if(m.length>180)return toast('Message is too long.');

      try{
        const result=await api({
          mode:'save',
          id:panel.dataset.editId||null,
          title:t,
          message:m,
          publishAt:fromLocalInput(publishAt.value)||new Date().toISOString(),
          expiresAt:fromLocalInput(expiresAt.value),
          published:published.checked,
          sendEmail:Boolean(sendEmail)
        });
        panel.dataset.editId='';
        panel.querySelector('#annSave').textContent='Save Announcement';
        rows=(await api({mode:'list'})).announcements||[];
        paint();
        await loadAnnouncement();
        toast(sendEmail ? `Announcement saved. Email sent: ${result.sent||0}.` : 'Announcement saved.');
      }catch(err){toast(err.message);}
    }

    panel.querySelector('#annSave').addEventListener('click',()=>save(false));
    panel.querySelector('#annSaveEmail').addEventListener('click',()=>save(true));
    paint();
  }

  function ensureAnnouncementMenu(){
    if(state.view!=='admin')return;
    const tabs=els.content?.querySelector('.admin-tabs');
    const panel=els.content?.querySelector('#adminPanel');
    if(!tabs||!panel)return;

    let btn=tabs.querySelector('[data-announcements-native="true"]');
    if(!btn){
      btn=document.createElement('button');
      btn.type='button';
      btn.className='btn btn-ghost';
      btn.dataset.announcementsNative='true';
      btn.textContent='📣 Announcements';

      const messages=[...tabs.querySelectorAll('button')].find(b=>/Messages/i.test(b.textContent||''));
      if(messages)messages.insertAdjacentElement('afterend',btn);
      else tabs.prepend(btn);

      btn.addEventListener('click',()=>{
        state.adminTab='announcements';
        [...tabs.querySelectorAll('button')].forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        void renderAnnouncementAdmin(panel);
      });
    }

    if(state.adminTab==='announcements'){
      [...tabs.querySelectorAll('button')].forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      if(panel.dataset.announcementsRendered!=='true'){
        void renderAnnouncementAdmin(panel);
      }
    }
  }

  let scheduled=false;
  const observer=new MutationObserver(()=>{
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{
      scheduled=false;
      ensureAnnouncementMenu();
    });
  });
  observer.observe(document.getElementById('contentArea')||document.body,{childList:true,subtree:true});
  document.addEventListener('click',()=>setTimeout(ensureAnnouncementMenu,0),true);
  setTimeout(ensureAnnouncementMenu,250);

  globalThis.PTP_MANUAL_ANNOUNCEMENTS={version:VERSION,reload:loadAnnouncement};
})();
