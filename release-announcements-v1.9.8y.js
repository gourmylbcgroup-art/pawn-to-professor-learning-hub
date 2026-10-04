/* Pawn to Professor v1.9.8y — Unit release announcements */
(() => {
  if (typeof state === 'undefined' || typeof els === 'undefined') return;

  const VERSION='1.9.8w';
  let rpcWrapped=false;

  function esc(v='') {
    if(typeof escapeHtml==='function') return escapeHtml(v);
    return String(v).replace(/[&<>"']/g,c=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function unitNumberFromName(name='') {
    const m=String(name).match(/\d+/);
    return m ? Number(m[0]) : null;
  }

  async function loadReleaseAnnouncements(){
    if(!state.client||!state.session){
      state.releaseAnnouncements=[];
      return;
    }
    const {data,error}=await state.client.from('release_announcements')
      .select('*')
      .order('released_at',{ascending:false})
      .limit(3);
    state.releaseAnnouncements=error?[]:(data||[]);
  }

  if(typeof loadExternalTools==='function'){
    const nativeLoadExternalToolsW=loadExternalTools;
    loadExternalTools=async function(...args){
      const result=await nativeLoadExternalToolsW(...args);
      await loadReleaseAnnouncements().catch(()=>{state.releaseAnnouncements=[];});
      return result;
    };
  }

  if(typeof renderYears==='function'){
    const nativeRenderYearsW=renderYears;
    renderYears=function(...args){
      const result=nativeRenderYearsW(...args);
      const rows=state.releaseAnnouncements||[];
      if(!rows.length)return result;

      const wrap=document.createElement('section');
      wrap.className='release-news-panel';
      wrap.innerHTML=`
        <div class="release-news-head">
          <strong>🆕 Latest Unit Releases</strong>
          <span>New content announcements</span>
        </div>
        <div class="release-news-list">
          ${rows.map(r=>`
            <article class="release-news-card">
              <strong>${esc(r.title)}</strong>
              <p>${esc(r.message)}</p>
              <small>${r.released_at ? new Date(r.released_at).toLocaleDateString() : ''}</small>
            </article>`).join('')}
        </div>
        <p class="release-news-note">Release announcements are shown to all members. Your available content still depends on your account access.</p>
      `;
      els.content.prepend(wrap);
      return result;
    };
  }

  async function announceRelease(unitNumber){
    if(!unitNumber||!state.profile||!['admin','owner'].includes(state.profile.role))return;
    try{
      const headers=await authHeaders();
      const res=await fetch('/api/security?action=unit-release-announcement',{
        method:'POST',
        headers,
        cache:'no-store',
        body:JSON.stringify({unitNumber})
      });
      const body=await res.json().catch(()=>({}));
      if(!res.ok)throw new Error(body.error||'Release announcement failed.');
      await loadReleaseAnnouncements();
      if(!body.alreadyAnnounced){
        toast(`Unit ${unitNumber} announcement: ${body.sent||0} email(s) sent.`);
      }
    }catch(err){
      console.error('Unit release announcement failed',err);
      toast(`Unit released, but announcement email failed: ${err.message||'unknown error'}`);
    }
  }

  function wrapRpcWhenReady(){
    if(rpcWrapped)return;
    if(!state.client||typeof state.client.rpc!=='function'){
      setTimeout(wrapRpcWhenReady,250);
      return;
    }

    const nativeRpc=state.client.rpc.bind(state.client);
    state.client.rpc=async function(fn,args,options){
      const result=await nativeRpc(fn,args,options);
      if(fn==='release_paid_unit_name'&&!result?.error){
        const n=unitNumberFromName(args?.target_unit_name);
        if(n) setTimeout(()=>announceRelease(n),0);
      }
      return result;
    };
    rpcWrapped=true;
  }

  wrapRpcWhenReady();
  globalThis.PTP_RELEASE_ANNOUNCEMENTS={version:VERSION,reload:loadReleaseAnnouncements};
})();
