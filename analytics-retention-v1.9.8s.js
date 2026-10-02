/* Pawn to Professor v1.9.8s — Member Analytics + Log Retention
   Load AFTER analytics.js.
   REPLACES homepage-activity-v1.9.8q.js and homepage-activity-v1.9.8r.js.

   Features:
   - Anonymous/public login-page visit counts (no IP stored)
   - Explicit successful member login tracking
   - Permanent member personal analytics summary
   - Member detailed-log TXT export + manual delete
   - Member login-log TXT export + manual delete
   - Public visitor TXT export + manual delete
   - 100-day member detailed-log automatic archive (server-side SQL)
*/
(() => {
  const VERSION = '1.9.8s';
  const PUBLIC_VISITOR_KEY = 'ptp_public_visitor_id_v1';
  const EXPLICIT_LOGIN_KEY = 'ptp_explicit_login_pending_v1';

  let publicVisitLoggedThisPage = false;
  let enhancing = false;
  let enhanceTimer = null;

  function isStaffAccount() {
    try { return typeof isStaff === 'function' && isStaff(); }
    catch { return ['admin','owner'].includes(state?.profile?.role); }
  }

  function esc(value='') {
    return String(value).replace(/[&<>'"]/g, ch => ({
      '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
    }[ch]));
  }

  function fmt(value) {
    if (!value) return '—';
    try { return new Date(value).toLocaleString(); }
    catch { return '—'; }
  }

  function browserVisitorId() {
    let id = localStorage.getItem(PUBLIC_VISITOR_KEY);
    if (!id) {
      id = globalThis.crypto?.randomUUID?.()
        || `pv-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(PUBLIC_VISITOR_KEY, id);
    }
    return id;
  }

  function startOfToday() {
    const d = new Date();
    d.setHours(0,0,0,0);
    return d;
  }

  function daysAgoStart(days) {
    const d = new Date();
    d.setHours(0,0,0,0);
    d.setDate(d.getDate() - (days - 1));
    return d;
  }

  function countPeriod(rows, start, key) {
    const from = start.getTime();
    const filtered = rows.filter(r => new Date(r.created_at).getTime() >= from);
    return {
      opens: filtered.length,
      unique: new Set(filtered.map(r => r[key]).filter(Boolean)).size
    };
  }

  function stat(value, label) {
    return `<div class="analytics-stat"><strong>${Number(value || 0).toLocaleString()}</strong><span>${esc(label)}</span></div>`;
  }

  function downloadTxt(filename, text) {
    const blob = new Blob([text], {type:'text/plain;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 500);
  }

  async function fetchAll(table, select='*', apply=null, max=50000) {
    const rows = [];
    const page = 1000;
    for (let from=0; from<max; from += page) {
      let q = state.client.from(table).select(select).order('created_at', {ascending:true});
      if (apply) q = apply(q);
      const {data,error} = await q.range(from, from+page-1);
      if (error) throw error;
      const batch = data || [];
      rows.push(...batch);
      if (batch.length < page) break;
    }
    return rows;
  }

  function memberLabel(row) {
    return row.display_name || row.username || row.user_id || 'Member';
  }

  function activityLine(row, archived=false) {
    return [
      row.created_at || '',
      memberLabel(row),
      row.username || '',
      row.event_type || '',
      row.content_title || '',
      row.path_text || row.page_name || '',
      archived ? `ARCHIVED ${row.archived_at || ''}` : 'LIVE'
    ].join('\t');
  }

  function loginLine(row) {
    return [
      row.created_at || '',
      memberLabel(row),
      row.username || '',
      row.user_id || ''
    ].join('\t');
  }

  function publicLine(row) {
    return [
      row.created_at || '',
      row.visitor_key || ''
    ].join('\t');
  }

  async function waitForBoot() {
    for (let i=0; i<100; i++) {
      if (globalThis.state?.client && document.getElementById('loadingView')?.classList.contains('hidden')) return true;
      await new Promise(r => setTimeout(r,100));
    }
    return false;
  }

  // -----------------------------------------------------------------------
  // Public / anonymous visit tracking
  // -----------------------------------------------------------------------
  async function logPublicVisit() {
    if (publicVisitLoggedThisPage) return;
    const ready = await waitForBoot();
    if (!ready) return;

    const loginView = document.getElementById('loginView');
    const visible = loginView && !loginView.classList.contains('hidden');
    if (state?.session || !visible) return;

    publicVisitLoggedThisPage = true;
    try {
      await state.client.rpc('log_public_home_visit', {
        p_visitor_key: browserVisitorId()
      });
    } catch {
      // Analytics must never block login.
    }
  }

  // -----------------------------------------------------------------------
  // Explicit successful member login tracking
  // We mark a real login-form submission, then log only when that attempt
  // successfully reaches enterPortal(). Page refreshes do NOT count as logins.
  // -----------------------------------------------------------------------
  const loginForm = document.getElementById('loginForm');
  loginForm?.addEventListener('submit', () => {
    sessionStorage.setItem(EXPLICIT_LOGIN_KEY, '1');
  }, true);

  if (typeof enterPortal === 'function') {
    const nativeEnterPortalV198s = enterPortal;
    enterPortal = async function(...args) {
      const result = await nativeEnterPortalV198s.apply(this,args);

      if (
        sessionStorage.getItem(EXPLICIT_LOGIN_KEY) === '1' &&
        state?.profile?.role === 'user' &&
        state?.session?.user?.id
      ) {
        sessionStorage.removeItem(EXPLICIT_LOGIN_KEY);
        try {
          await state.client.rpc('log_member_login');
        } catch {
          // Login analytics never blocks the member portal.
        }
      }
      return result;
    };
  }

  // -----------------------------------------------------------------------
  // Admin data
  // -----------------------------------------------------------------------
  async function loadPublicRows() {
    const since = daysAgoStart(30).toISOString();
    const {data,error} = await state.client
      .from('public_home_visits')
      .select('visitor_key,created_at')
      .gte('created_at',since)
      .order('created_at',{ascending:false})
      .limit(5000);
    if (error) throw error;
    return data || [];
  }

  async function loadMemberHomeRows() {
    const since = daysAgoStart(30).toISOString();
    const {data,error} = await state.client
      .from('usage_events')
      .select('user_id,username,display_name,created_at,event_type')
      .eq('event_type','portal_home_view')
      .gte('created_at',since)
      .order('created_at',{ascending:false})
      .limit(5000);
    if (error) throw error;
    return data || [];
  }

  async function loadSummaries() {
    const {data,error} = await state.client
      .from('member_usage_summary')
      .select('*')
      .order('last_activity_at',{ascending:false,nullsFirst:false});
    if (error) throw error;
    return data || [];
  }

  async function countTable(table) {
    const {count,error} = await state.client
      .from(table)
      .select('*',{count:'exact',head:true});
    if (error) throw error;
    return Number(count || 0);
  }

  async function paintHomepage(area) {
    const [publicRows,memberRows] = await Promise.all([
      loadPublicRows(), loadMemberHomeRows()
    ]);

    const p0=countPeriod(publicRows,startOfToday(),'visitor_key');
    const p7=countPeriod(publicRows,daysAgoStart(7),'visitor_key');
    const p30=countPeriod(publicRows,daysAgoStart(30),'visitor_key');
    const m0=countPeriod(memberRows,startOfToday(),'user_id');
    const m7=countPeriod(memberRows,daysAgoStart(7),'user_id');
    const m30=countPeriod(memberRows,daysAgoStart(30),'user_id');

    area.innerHTML = `
      <h4 style="margin:.2rem 0 .55rem">🌐 Public visitors — not signed in</h4>
      <div class="analytics-stats">
        ${stat(p0.opens,'Public visits today')}
        ${stat(p0.unique,'Unique browsers today')}
        ${stat(p7.opens,'Public visits — 7 days')}
        ${stat(p7.unique,'Unique browsers — 7 days')}
        ${stat(p30.opens,'Public visits — 30 days')}
        ${stat(p30.unique,'Unique browsers — 30 days')}
      </div>
      <p class="admin-note">No IP address is stored. “Unique browser” uses a random browser ID and is an estimate, not a guaranteed unique person.</p>

      <h4 style="margin:1rem 0 .55rem">👤 Logged-in member Home opens</h4>
      <div class="analytics-stats">
        ${stat(m0.opens,'Member opens today')}
        ${stat(m0.unique,'Unique members today')}
        ${stat(m7.opens,'Member opens — 7 days')}
        ${stat(m7.unique,'Unique members — 7 days')}
        ${stat(m30.opens,'Member opens — 30 days')}
        ${stat(m30.unique,'Unique members — 30 days')}
      </div>
    `;
  }

  async function paintSummaries(area) {
    const rows = await loadSummaries();
    area.innerHTML = `
      <div class="analytics-table-wrap">
        <table class="analytics-table">
          <thead>
            <tr>
              <th>Member</th>
              <th>First login</th>
              <th>Last login</th>
              <th>Logins</th>
              <th>Home</th>
              <th>Units</th>
              <th>Games</th>
              <th>Views</th>
              <th>Downloads</th>
              <th>Last activity</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(row=>`
              <tr>
                <td><strong>${esc(memberLabel(row))}</strong><small>${esc(row.username||'')}</small></td>
                <td>${esc(fmt(row.first_login_at))}</td>
                <td>${esc(fmt(row.last_login_at))}</td>
                <td>${Number(row.total_logins||0).toLocaleString()}</td>
                <td>${Number(row.home_opens||0).toLocaleString()}</td>
                <td>${Number(row.unit_views||0).toLocaleString()}</td>
                <td>${Number(row.game_plays||0).toLocaleString()}</td>
                <td>${Number(row.resource_views||0).toLocaleString()}</td>
                <td>${Number(row.downloads||0).toLocaleString()}</td>
                <td>${esc(fmt(row.last_activity_at))}</td>
                <td><button class="btn btn-small btn-danger" data-delete-summary="${esc(row.user_id)}" type="button">Delete Personal Analytics</button></td>
              </tr>
            `).join('') || '<tr><td colspan="11">No member personal analytics yet.</td></tr>'}
          </tbody>
        </table>
      </div>
      <p class="admin-note">
        Personal Analytics does not expire automatically. Deleting detailed logs does not delete this summary.
        Delete it only with the button above.
      </p>
    `;

    area.querySelectorAll('[data-delete-summary]').forEach(btn=>{
      btn.addEventListener('click', async()=>{
        const userId=btn.dataset.deleteSummary;
        if(!confirm('Delete this member’s permanent Personal Analytics summary?\n\nDetailed logs and login logs are NOT deleted by this button.')) return;
        btn.disabled=true;
        try{
          const {error}=await state.client.rpc('admin_delete_member_summary',{p_user_id:userId});
          if(error)throw error;
          toast('Member Personal Analytics deleted.');
          await paintSummaries(area);
        }catch(err){
          toast(err.message||'Could not delete Personal Analytics.');
          btn.disabled=false;
        }
      });
    });
  }

  function memberScopeOptions() {
    const users=(state.adminUsers||[])
      .filter(u=>u.role==='user')
      .sort((a,b)=>String(a.display_name||a.username).localeCompare(String(b.display_name||b.username)));
    return `<option value="">All members</option>`+
      users.map(u=>`<option value="${esc(u.id)}">${esc(u.display_name||u.username)} · ${esc(u.username||'')}</option>`).join('');
  }

  async function paintLogManager(area) {
    const [live,archive,logins,publicCount] = await Promise.all([
      countTable('usage_events'),
      countTable('member_usage_archive'),
      countTable('member_login_events'),
      countTable('public_home_visits')
    ]);

    area.innerHTML=`
      <div class="analytics-stats">
        ${stat(live,'Live member usage rows')}
        ${stat(archive,'Archived member rows')}
        ${stat(logins,'Member login rows')}
        ${stat(publicCount,'Public visitor rows')}
      </div>

      <div style="margin-top:1rem;display:grid;gap:.9rem">
        <div class="manage-card">
          <div>
            <strong>Member detailed activity logs</strong>
            <div class="meta">Records older than 100 days are automatically copied to the archive before being removed from the live log.</div>
          </div>
          <div class="actions" style="flex-wrap:wrap">
            <select data-member-scope style="min-width:220px">${memberScopeOptions()}</select>
            <button class="btn btn-small btn-ghost" data-export-activity type="button">Download TXT</button>
            <button class="btn btn-small btn-ghost" data-run-archive type="button">Run 100-Day Archive Now</button>
            <button class="btn btn-small btn-danger" data-delete-activity type="button">Delete Detailed Logs</button>
          </div>
        </div>

        <div class="manage-card">
          <div>
            <strong>Member login tracking</strong>
            <div class="meta">Exact successful login events. Page refreshes do not count as new logins.</div>
          </div>
          <div class="actions" style="flex-wrap:wrap">
            <select data-login-scope style="min-width:220px">${memberScopeOptions()}</select>
            <button class="btn btn-small btn-ghost" data-export-logins type="button">Download TXT</button>
            <button class="btn btn-small btn-danger" data-delete-logins type="button">Delete Login Log</button>
          </div>
        </div>

        <div class="manage-card">
          <div>
            <strong>Public visitor log</strong>
            <div class="meta">No automatic deletion. You control export and permanent deletion.</div>
          </div>
          <div class="actions">
            <button class="btn btn-small btn-ghost" data-export-public type="button">Download TXT</button>
            <button class="btn btn-small btn-danger" data-delete-public type="button">Delete Visitor Log</button>
          </div>
        </div>
      </div>
    `;

    area.querySelector('[data-export-activity]').addEventListener('click',async e=>{
      const btn=e.currentTarget;
      btn.disabled=true; btn.textContent='Preparing…';
      try{
        const userId=area.querySelector('[data-member-scope]').value;
        const apply=userId?(q=>q.eq('user_id',userId)):null;
        const [liveRows,archRows]=await Promise.all([
          fetchAll('usage_events','*',apply),
          fetchAll('member_usage_archive','*',apply)
        ]);
        const lines=[
          'Pawn to Professor — Member Detailed Activity Log',
          `Exported: ${new Date().toLocaleString()}`,
          `Scope: ${userId||'ALL MEMBERS'}`,
          '',
          'DATE/TIME\tMEMBER\tUSERNAME\tACTION\tCONTENT\tLOCATION\tSTATUS',
          ...liveRows.map(r=>activityLine(r,false)),
          ...archRows.map(r=>activityLine(r,true))
        ];
        downloadTxt(`member-activity-${new Date().toISOString().slice(0,10)}.txt`,lines.join('\n'));
      }catch(err){toast(err.message||'Could not export member activity.')}
      finally{btn.disabled=false;btn.textContent='Download TXT';}
    });

    area.querySelector('[data-run-archive]').addEventListener('click',async e=>{
      const btn=e.currentTarget;
      btn.disabled=true;btn.textContent='Archiving…';
      try{
        const {data,error}=await state.client.rpc('admin_archive_old_member_usage');
        if(error)throw error;
        toast(`${Number(data||0).toLocaleString()} old member record(s) archived.`);
        await paintLogManager(area);
      }catch(err){toast(err.message||'Could not run archive.');btn.disabled=false;btn.textContent='Run 100-Day Archive Now';}
    });

    area.querySelector('[data-delete-activity]').addEventListener('click',async()=>{
      const userId=area.querySelector('[data-member-scope]').value||null;
      const label=userId?'this member':'ALL MEMBERS';
      if(!confirm(`Permanently delete LIVE + ARCHIVED detailed activity logs for ${label}?\n\nPersonal Analytics summary is kept.\nDownload TXT first if you want a copy.`))return;
      const {data,error}=await state.client.rpc('admin_delete_member_activity',{p_user_id:userId});
      if(error)return toast(error.message);
      toast(`Detailed logs deleted: ${Number(data||0).toLocaleString()} row(s).`);
      await paintLogManager(area);
    });

    area.querySelector('[data-export-logins]').addEventListener('click',async e=>{
      const btn=e.currentTarget;btn.disabled=true;btn.textContent='Preparing…';
      try{
        const userId=area.querySelector('[data-login-scope]').value;
        const apply=userId?(q=>q.eq('user_id',userId)):null;
        const rows=await fetchAll('member_login_events','*',apply);
        const lines=[
          'Pawn to Professor — Member Login Log',
          `Exported: ${new Date().toLocaleString()}`,
          `Scope: ${userId||'ALL MEMBERS'}`,
          '',
          'DATE/TIME\tMEMBER\tUSERNAME\tUSER ID',
          ...rows.map(loginLine)
        ];
        downloadTxt(`member-login-log-${new Date().toISOString().slice(0,10)}.txt`,lines.join('\n'));
      }catch(err){toast(err.message||'Could not export login log.')}
      finally{btn.disabled=false;btn.textContent='Download TXT';}
    });

    area.querySelector('[data-delete-logins]').addEventListener('click',async()=>{
      const userId=area.querySelector('[data-login-scope]').value||null;
      const label=userId?'this member':'ALL MEMBERS';
      if(!confirm(`Permanently delete login-event history for ${label}?\n\nThe permanent Personal Analytics summary is kept unless you delete it separately.`))return;
      const {data,error}=await state.client.rpc('admin_delete_member_login_events',{p_user_id:userId});
      if(error)return toast(error.message);
      toast(`Login rows deleted: ${Number(data||0).toLocaleString()}.`);
      await paintLogManager(area);
    });

    area.querySelector('[data-export-public]').addEventListener('click',async e=>{
      const btn=e.currentTarget;btn.disabled=true;btn.textContent='Preparing…';
      try{
        const rows=await fetchAll('public_home_visits','*');
        const lines=[
          'Pawn to Professor — Public Visitor Log',
          `Exported: ${new Date().toLocaleString()}`,
          'No IP addresses are stored by this analytics patch.',
          '',
          'DATE/TIME\tANONYMOUS BROWSER ID',
          ...rows.map(publicLine)
        ];
        downloadTxt(`public-visitor-log-${new Date().toISOString().slice(0,10)}.txt`,lines.join('\n'));
      }catch(err){toast(err.message||'Could not export visitor log.')}
      finally{btn.disabled=false;btn.textContent='Download TXT';}
    });

    area.querySelector('[data-delete-public]').addEventListener('click',async()=>{
      if(!confirm('Permanently delete ALL public visitor logs?\n\nThere is NO automatic deletion for public visitor logs.\nDownload TXT first if you want a copy.'))return;
      const {data,error}=await state.client.rpc('admin_delete_public_visits');
      if(error)return toast(error.message);
      toast(`Public visitor rows deleted: ${Number(data||0).toLocaleString()}.`);
      await paintLogManager(area);
    });
  }

  async function enhanceAnalytics() {
    if(enhancing) return;
    if(!isStaffAccount()) return;
    if(state?.view!=='admin'||state?.adminTab!=='analytics') return;

    const body=els?.content?.querySelector('#analyticsBody');
    if(!body||body.querySelector('[data-v198s-member-analytics]'))return;

    enhancing=true;
    const wrap=document.createElement('div');
    wrap.dataset.v198sMemberAnalytics='true';
    wrap.innerHTML=`
      <section class="analytics-section">
        <div class="analytics-head">
          <div><h3>🏠 Homepage Activity</h3><p class="admin-note">Public visitors and logged-in member Home opens.</p></div>
          <button class="btn btn-small btn-ghost" data-refresh-home type="button">Refresh</button>
        </div>
        <div data-home-area><div class="empty-state" style="height:100px">Loading…</div></div>
      </section>

      <section class="analytics-section">
        <div class="analytics-head">
          <div><h3>👤 Member Personal Analytics</h3><p class="admin-note">Permanent cumulative summary. It does not expire after 100 days.</p></div>
          <button class="btn btn-small btn-ghost" data-refresh-summary type="button">Refresh</button>
        </div>
        <div data-summary-area><div class="empty-state" style="height:100px">Loading…</div></div>
      </section>

      <section class="analytics-section">
        <div class="analytics-head">
          <div><h3>🧹 Logs — Export, Archive & Delete</h3><p class="admin-note">Download TXT whenever you want before deleting logs.</p></div>
          <button class="btn btn-small btn-ghost" data-refresh-logs type="button">Refresh</button>
        </div>
        <div data-log-area><div class="empty-state" style="height:100px">Loading…</div></div>
      </section>
    `;
    body.prepend(wrap);

    const home=wrap.querySelector('[data-home-area]');
    const summary=wrap.querySelector('[data-summary-area]');
    const logs=wrap.querySelector('[data-log-area]');

    wrap.querySelector('[data-refresh-home]').addEventListener('click',()=>paintHomepage(home).catch(err=>toast(err.message)));
    wrap.querySelector('[data-refresh-summary]').addEventListener('click',()=>paintSummaries(summary).catch(err=>toast(err.message)));
    wrap.querySelector('[data-refresh-logs]').addEventListener('click',()=>paintLogManager(logs).catch(err=>toast(err.message)));

    try{
      await Promise.all([
        paintHomepage(home),
        paintSummaries(summary),
        paintLogManager(logs)
      ]);
    }catch(err){
      toast(err.message||'Could not load analytics management.');
    }finally{
      enhancing=false;
    }
  }

  function scheduleEnhance(){
    clearTimeout(enhanceTimer);
    enhanceTimer=setTimeout(enhanceAnalytics,80);
  }

  const observer=new MutationObserver(scheduleEnhance);
  observer.observe(document.documentElement,{childList:true,subtree:true});

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',logPublicVisit,{once:true});
  }else{
    logPublicVisit();
  }

  const loginView=document.getElementById('loginView');
  if(loginView){
    const loginObserver=new MutationObserver(logPublicVisit);
    loginObserver.observe(loginView,{attributes:true,attributeFilter:['class']});
  }

  scheduleEnhance();

  globalThis.PTP_MEMBER_ANALYTICS_RETENTION={
    version:VERSION,
    refresh:enhanceAnalytics
  };
})();
