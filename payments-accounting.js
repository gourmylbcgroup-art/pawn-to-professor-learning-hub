/* Pawn to Professor v1.9.7
   3-Day Trial + Annual Payments + Accounting + Renewal
*/
(() => {
  if (typeof state === 'undefined' || typeof render === 'undefined') return;

  const VERSION = '1.9.7';
  let paymentData = null;
  let recordSeed = null;
  let refreshTimer = null;

  globalThis.PTP_PAYMENT_STATE = {
    loaded:false,
    active:false,
    hadPaidAccess:false,
    latest:null
  };

  function esc(v='') {
    if (typeof escapeHtml === 'function') return escapeHtml(v);
    return String(v).replace(/[&<>"']/g,c=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function money(value,currency='TWD') {
    const n=Number(value||0);
    try {
      return new Intl.NumberFormat('en-US',{
        style:'currency',
        currency:String(currency||'TWD').toUpperCase(),
        maximumFractionDigits:String(currency||'').toUpperCase()==='TWD'?0:2
      }).format(n);
    } catch {
      return `${currency} ${n.toFixed(2)}`;
    }
  }

  function dateOnly(v) {
    if (!v) return '—';
    try { return new Date(v).toLocaleDateString(); }
    catch { return '—'; }
  }

  function daysUntil(v) {
    return Math.ceil((new Date(v).getTime()-Date.now())/86400000);
  }

  async function api(action,payload={}) {
    const headers=await authHeaders();
    const res=await fetch(`/api/security?action=${encodeURIComponent(action)}`,{
      method:'POST',
      headers,
      cache:'no-store',
      body:JSON.stringify(payload)
    });
    const body=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error(body.error||'Payment action failed.');
    return body;
  }

  async function loadMyPaidState() {
    if (!state.profile || isStaff()) return;
    const {data,error}=await state.client
      .from('annual_access_periods')
      .select('*')
      .eq('user_id',state.session.user.id)
      .order('ends_at',{ascending:false})
      .limit(1);

    if(error) return;

    const latest=(data||[])[0]||null;
    const now=Date.now();
    globalThis.PTP_PAYMENT_STATE={
      loaded:true,
      hadPaidAccess:!!latest,
      active:!!latest && !latest.cancelled_at
        && new Date(latest.starts_at).getTime()<=now
        && new Date(latest.ends_at).getTime()>now,
      latest
    };
  }

  function replaceOldTrialCopy() {
    const root=document.getElementById('boardApp');
    if(!root)return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const nodes=[];
    while(walker.nextNode())nodes.push(walker.currentNode);
    nodes.forEach(node=>{
      const original=node.nodeValue||'';
      const changed=original
        .replace(/7-Day/g,'3-Day')
        .replace(/7-day/g,'3-day')
        .replace(/7 days/g,'3 days')
        .replace(/seven-day/gi,'three-day');
      if(changed!==original)node.nodeValue=changed;
    });
  }

  function memberPaymentSeed() {
    const ps=globalThis.PTP_PAYMENT_STATE;
    if(ps?.hadPaidAccess && !ps.active){
      return {
        category:'access_payment',
        subject:'Renew my annual access',
        body:'My one-year Pawn to Professor access has ended and I would like to renew.\\n\\nPlease confirm the current renewal price and payment instructions.',
        context:{source:'annual_access_banner',annual_access_id:ps.latest?.id||null}
      };
    }
    return {
      category:'access_payment',
      subject:'Continue with one-year access',
      body:'I would like to continue using Pawn to Professor with one-year paid access.\\n\\nPlease send me the current price and payment instructions.',
      context:{source:'payment_banner'}
    };
  }

  function openMemberPaymentMessage() {
    globalThis.PTP_MAILBOX?.open?.(memberPaymentSeed());
  }

  function enhanceMemberHome() {
    if(!state.profile || isStaff() || state.view!=='years')return;
    if(els.content.querySelector('.v197-paid-banner'))return;

    const ps=globalThis.PTP_PAYMENT_STATE;
    if(!ps?.loaded)return;

    const banner=document.createElement('div');
    banner.className='v197-paid-banner';

    if(ps.active){
      const remaining=daysUntil(ps.latest.ends_at);
      banner.classList.add(remaining<=30?'renewal-due':'active');
      banner.innerHTML=`
        <div class="v197-paid-icon">${remaining<=30?'⏳':'✅'}</div>
        <div class="v197-paid-copy">
          <strong>One-Year Access Active</strong>
          <span>Valid until ${esc(dateOnly(ps.latest.ends_at))}${remaining<=30?` · ${remaining} day${remaining===1?'':'s'} remaining`:''}.</span>
        </div>
        ${remaining<=30?'<button class="btn btn-small btn-accent" data-renew>💳 Renew Access</button>':''}
      `;
      banner.querySelector('[data-renew]')?.addEventListener('click',openMemberPaymentMessage);
      els.content.prepend(banner);
      return;
    }

    if(ps.hadPaidAccess){
      banner.classList.add('expired');
      banner.innerHTML=`
        <div class="v197-paid-icon">⏰</div>
        <div class="v197-paid-copy">
          <strong>Your annual access has ended</strong>
          <span>Your account remains active. Community and My Messages remain available.</span>
        </div>
        <button class="btn btn-small btn-accent" data-renew>💳 Renew Access</button>
      `;
      banner.querySelector('[data-renew]').addEventListener('click',openMemberPaymentMessage);
      els.content.prepend(banner);
    }
  }

  async function loadAdminPaymentData() {
    const [payments,access,profiles]=await Promise.all([
      state.client.from('payment_records').select('*').order('paid_on',{ascending:false}).order('created_at',{ascending:false}),
      state.client.from('annual_access_periods').select('*').order('ends_at',{ascending:true}),
      state.client.from('profiles').select('id,username,display_name,contact_email,member_type,role,status').eq('role','user').order('display_name')
    ]);
    const err=payments.error||access.error||profiles.error;
    if(err)throw err;
    paymentData={
      payments:payments.data||[],
      access:access.data||[],
      profiles:profiles.data||[]
    };
    return paymentData;
  }

  function ledgerStats(data) {
    const now=new Date();
    const startMonth=new Date(now.getFullYear(),now.getMonth(),1);
    const startYear=new Date(now.getFullYear(),0,1);
    const positives=data.payments.filter(p=>Number(p.amount)>0);
    const sum=rows=>rows.reduce((s,p)=>s+Number(p.amount||0),0);
    const netMonth=sum(data.payments.filter(p=>new Date(`${p.paid_on}T00:00:00`)>=startMonth));
    const netYear=sum(data.payments.filter(p=>new Date(`${p.paid_on}T00:00:00`)>=startYear));
    const grossYear=sum(positives.filter(p=>new Date(`${p.paid_on}T00:00:00`)>=startYear));
    const adjustmentsYear=netYear-grossYear;
    const active=data.access.filter(a=>!a.cancelled_at && new Date(a.starts_at)<=now && new Date(a.ends_at)>now);
    const due=active.filter(a=>daysUntil(a.ends_at)<=30);
    const expired=data.access.filter(a=>!a.cancelled_at && new Date(a.ends_at)<=now);
    return {netMonth,netYear,grossYear,adjustmentsYear,positiveCount:positives.length,active:active.length,due:due.length,expired:expired.length};
  }

  function recordFormHtml(seed={}) {
    const today=new Date().toISOString().slice(0,10);
    const memberOptions=(paymentData?.profiles||[])
      .filter(p=>p.status==='active')
      .map(p=>`<option value="${p.id}" ${p.id===seed.userId?'selected':''}>${esc(p.display_name||p.username)} · ${esc(p.member_type||'member')} · ${esc(p.username)}</option>`)
      .join('');

    return `
      <div class="v197-modal" role="dialog" aria-modal="true">
        <div class="v197-modal-card">
          <div class="v197-modal-head">
            <div>
              <h2>💰 Payment Received — Activate 1 Year</h2>
              <p>Record only money you have actually received.</p>
            </div>
            <button class="btn btn-small btn-ghost" data-close>✕</button>
          </div>

          <div class="v197-form-grid">
            <label class="wide">Member
              <select data-user>${memberOptions}</select>
            </label>

            <label>Payment type
              <select data-kind>
                <option value="new">New annual payment</option>
                <option value="renewal">Annual renewal</option>
              </select>
            </label>

            <label>Plan
              <input data-plan value="Annual Access">
            </label>

            <label>Amount received
              <input data-amount type="number" min="1" step="1" placeholder="2990">
            </label>

            <label>Currency
              <input data-currency value="TWD" maxlength="8">
            </label>

            <label>Payment method
              <select data-method>
                <option>Bank Transfer</option>
                <option>Cash</option>
                <option>Other</option>
              </select>
            </label>

            <label>Payment date
              <input data-paid-on type="date" value="${today}">
            </label>

            <label>Access starts
              <select data-start-mode>
                <option value="now">Now / payment activation date</option>
                <option value="after_current">After current annual access ends</option>
              </select>
            </label>

            <label>Reference / transaction no.
              <input data-reference placeholder="Optional">
            </label>

            <label class="wide">Admin note
              <textarea data-note rows="3" placeholder="Optional accounting note"></textarea>
            </label>

            <label class="checkbox-card wide">
              <input data-email type="checkbox" checked>
              Email the member that one-year access is active
            </label>
          </div>

          <div class="v197-confirm-note">
            One-year access is recorded for 12 months. Renewal prices may be different next year.
          </div>

          <div class="button-row">
            <button class="btn btn-ghost" data-close type="button">Cancel</button>
            <button class="btn btn-accent" data-save type="button">Activate for 1 Year</button>
          </div>
        </div>
      </div>`;
  }

  function openRecordPayment(userId=null,supportThreadId=null) {
    if(!isStaff())return;
    recordSeed={userId,supportThreadId};
    if(!paymentData){
      loadAdminPaymentData().then(()=>openRecordPayment(userId,supportThreadId)).catch(err=>toast(err.message));
      return;
    }

    document.querySelector('.v197-modal')?.remove();
    const wrap=document.createElement('div');
    wrap.innerHTML=recordFormHtml(recordSeed);
    const modal=wrap.firstElementChild;
    document.body.appendChild(modal);

    const kind=modal.querySelector('[data-kind]');
    const startMode=modal.querySelector('[data-start-mode]');
    kind.addEventListener('change',()=>{
      startMode.value=kind.value==='renewal'?'after_current':'now';
    });

    modal.querySelectorAll('[data-close]').forEach(btn=>btn.addEventListener('click',()=>modal.remove()));

    modal.querySelector('[data-save]').addEventListener('click',async e=>{
      const btn=e.currentTarget;
      const userIdValue=modal.querySelector('[data-user]').value;
      const paidOn=modal.querySelector('[data-paid-on]').value;
      const accessStartAt=paidOn ? new Date(`${paidOn}T00:00:00+08:00`).toISOString() : new Date().toISOString();

      btn.disabled=true;
      btn.textContent='Recording…';
      try{
        const result=await api('record-annual-payment',{
          userId:userIdValue,
          amount:Number(modal.querySelector('[data-amount]').value),
          currency:modal.querySelector('[data-currency]').value,
          paymentMethod:modal.querySelector('[data-method]').value,
          paidOn,
          paymentKind:kind.value,
          planName:modal.querySelector('[data-plan]').value,
          startMode:startMode.value,
          accessStartAt,
          reference:modal.querySelector('[data-reference]').value,
          note:modal.querySelector('[data-note]').value,
          supportThreadId:recordSeed?.supportThreadId||null,
          sendEmail:modal.querySelector('[data-email]').checked
        });
        modal.remove();
        paymentData=null;
        toast(`Payment recorded. Access valid until ${dateOnly(result.accessPeriod?.ends_at)}.`);
        if(state.view==='admin'&&state.adminTab==='payments')render();
      }catch(err){
        toast(err.message);
        btn.disabled=false;
        btn.textContent='Activate for 1 Year';
      }
    });
  }

  function filtersFrom(panel) {
    return {
      search:(panel.querySelector('#v197Search')?.value||'').trim().toLowerCase(),
      type:panel.querySelector('#v197Type')?.value||'',
      memberType:panel.querySelector('#v197MemberType')?.value||'',
      from:panel.querySelector('#v197From')?.value||'',
      to:panel.querySelector('#v197To')?.value||''
    };
  }

  function filteredPayments(panel,data) {
    const f=filtersFrom(panel);
    return data.payments.filter(p=>{
      const text=`${p.display_name_snapshot||''} ${p.username_snapshot||''} ${p.email_snapshot||''} ${p.plan_name||''} ${p.payment_method||''} ${p.reference||''}`.toLowerCase();
      if(f.search&&!text.includes(f.search))return false;
      if(f.type&&p.payment_kind!==f.type)return false;
      if(f.memberType&&p.member_type_snapshot!==f.memberType)return false;
      if(f.from&&p.paid_on<f.from)return false;
      if(f.to&&p.paid_on>f.to)return false;
      return true;
    });
  }

  function activeAccessRows(data) {
    const now=Date.now();
    return data.access.filter(a=>!a.cancelled_at&&new Date(a.starts_at).getTime()<=now&&new Date(a.ends_at).getTime()>now);
  }

  function exportExcel(panel,data) {
    if(!globalThis.XLSX){
      toast('Excel exporter is still loading. Try again in a moment.');
      return;
    }
    const rows=filteredPayments(panel,data);
    const stats=ledgerStats({...data,payments:rows});
    const profiles=new Map(data.profiles.map(p=>[p.id,p]));
    const active=activeAccessRows(data);
    const due=active.filter(a=>daysUntil(a.ends_at)<=30);

    const summary=[
      ['Pawn to Professor — Payment Accounting'],
      ['Generated',new Date().toLocaleString()],
      [],
      ['Metric','Value'],
      ['Net income — selected period',stats.netYear],
      ['Gross positive payments — selected period',stats.grossYear],
      ['Refunds / corrections — selected period',stats.adjustmentsYear],
      ['Positive payment count',stats.positiveCount],
      ['Active annual members',stats.active],
      ['Renewals due within 30 days',stats.due],
      ['Expired annual access periods',stats.expired]
    ];

    const paymentSheet=rows.map(p=>({
      Date:p.paid_on,
      Member:p.display_name_snapshot||p.username_snapshot,
      Username:p.username_snapshot,
      Email:p.email_snapshot||'',
      'Account Type':p.member_type_snapshot||'',
      'Payment Type':p.payment_kind,
      Plan:p.plan_name,
      Amount:Number(p.amount),
      Currency:p.currency,
      'Payment Method':p.payment_method,
      Reference:p.reference||'',
      Note:p.note||'',
      'Original Payment':p.original_payment_id||'',
      'Recorded At':p.created_at
    }));

    const activeSheet=active.map(a=>{
      const p=profiles.get(a.user_id);
      return {
        Member:p?.display_name||p?.username||a.user_id,
        Username:p?.username||'',
        Email:p?.contact_email||'',
        Type:p?.member_type||'',
        Plan:a.plan_name,
        Start:a.starts_at,
        Expiry:a.ends_at,
        'Days Remaining':daysUntil(a.ends_at)
      };
    });

    const renewalSheet=due.map(a=>{
      const p=profiles.get(a.user_id);
      const original=data.payments.find(x=>x.id===a.payment_id);
      return {
        Member:p?.display_name||p?.username||a.user_id,
        Username:p?.username||'',
        Email:p?.contact_email||'',
        Type:p?.member_type||'',
        Plan:a.plan_name,
        'Previous Amount':original?Number(original.amount):'',
        Currency:original?.currency||'TWD',
        'Expiry Date':a.ends_at,
        'Days Remaining':daysUntil(a.ends_at)
      };
    });

    const wb=XLSX.utils.book_new();
    const wsSummary=XLSX.utils.aoa_to_sheet(summary);
    const wsPayments=XLSX.utils.json_to_sheet(paymentSheet);
    const wsActive=XLSX.utils.json_to_sheet(activeSheet);
    const wsRenew=XLSX.utils.json_to_sheet(renewalSheet);

    wsSummary['!cols']=[{wch:38},{wch:24}];
    wsPayments['!cols']=[
      {wch:12},{wch:24},{wch:18},{wch:28},{wch:14},{wch:14},{wch:20},
      {wch:12},{wch:10},{wch:18},{wch:22},{wch:30},{wch:38},{wch:22}
    ];
    wsActive['!cols']=[{wch:24},{wch:18},{wch:28},{wch:12},{wch:20},{wch:22},{wch:22},{wch:15}];
    wsRenew['!cols']=[{wch:24},{wch:18},{wch:28},{wch:12},{wch:20},{wch:16},{wch:10},{wch:22},{wch:15}];

    XLSX.utils.book_append_sheet(wb,wsSummary,'Summary');
    XLSX.utils.book_append_sheet(wb,wsPayments,'Payments');
    XLSX.utils.book_append_sheet(wb,wsActive,'Active Access');
    XLSX.utils.book_append_sheet(wb,wsRenew,'Renewals Due');

    const stamp=new Date().toISOString().slice(0,10);
    XLSX.writeFile(wb,`Pawn-to-Professor-Payments-${stamp}.xlsx`);
  }

  function exportCsv(panel,data) {
    const rows=filteredPayments(panel,data);
    const headers=['Date','Member','Username','Email','Account Type','Payment Type','Plan','Amount','Currency','Payment Method','Reference','Note'];
    const values=rows.map(p=>[
      p.paid_on,p.display_name_snapshot||p.username_snapshot,p.username_snapshot,p.email_snapshot||'',
      p.member_type_snapshot||'',p.payment_kind,p.plan_name,p.amount,p.currency,p.payment_method,p.reference||'',p.note||''
    ]);
    const escCsv=v=>`"${String(v??'').replaceAll('"','""')}"`;
    const csv=[headers,...values].map(r=>r.map(escCsv).join(',')).join('\n');
    const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=`Pawn-to-Professor-Payments-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function openAdjustment(payment,panel) {
    if(!isOwner())return toast('Only the Owner can record refunds/corrections.');
    const amount=prompt(`Original payment: ${money(payment.amount,payment.currency)}\\n\\nEnter refund/correction amount as a positive number. It will be recorded as a negative accounting entry.`);
    if(amount===null)return;
    const n=Number(amount);
    if(!Number.isFinite(n)||n<=0)return toast('Enter a valid amount.');
    const kind=confirm('Press OK for REFUND.\\nPress Cancel for CORRECTION.')?'refund':'correction';
    const note=prompt('Reason / accounting note:')||'';
    const cancelAccess=confirm('Also cancel the annual access attached to the original payment?\\n\\nOK = cancel access\\nCancel = keep access');
    try{
      await api('payment-adjustment',{
        originalPaymentId:payment.id,
        adjustmentKind:kind,
        amount:n,
        paymentMethod:'Adjustment',
        paidOn:new Date().toISOString().slice(0,10),
        note,
        cancelAccess
      });
      toast(`${kind==='refund'?'Refund':'Correction'} recorded. Original payment remains in the ledger.`);
      paymentData=null;
      renderAdminPayments(panel);
    }catch(err){toast(err.message);}
  }

  async function renderAdminPayments(panel) {
    panel.innerHTML='<h2>💰 Payments & Accounting</h2><div class="empty-state" style="height:120px">Loading accounting…</div>';
    let data;
    try{data=paymentData||await loadAdminPaymentData();}
    catch(err){panel.innerHTML=`<h2>💰 Payments & Accounting</h2><div class="empty-state">${esc(err.message)}</div>`;return;}
    if(state.adminTab!=='payments')return;

    const s=ledgerStats(data);
    panel.innerHTML=`
      <div class="v197-head">
        <div>
          <h2>💰 Payments & Accounting</h2>
          <p class="admin-note">Only confirmed payment records count as income. Annual access expires automatically after 12 months.</p>
        </div>
        <div class="actions">
          <button id="v197Record" class="btn btn-accent">+ Payment Received</button>
          <button id="v197Excel" class="btn btn-ghost">📊 Export Excel</button>
          <button id="v197Csv" class="btn btn-ghost">Export CSV</button>
        </div>
      </div>

      <div class="v197-stats">
        <div><strong>${money(s.netMonth)}</strong><span>Net this month</span></div>
        <div><strong>${money(s.netYear)}</strong><span>Net this year</span></div>
        <div><strong>${s.positiveCount}</strong><span>Positive payments</span></div>
        <div><strong>${s.active}</strong><span>Active annual members</span></div>
        <div><strong>${s.due}</strong><span>Renewals ≤ 30 days</span></div>
        <div><strong>${s.expired}</strong><span>Expired periods</span></div>
      </div>

      <div class="v197-filters">
        <input id="v197Search" placeholder="Search member, reference, plan">
        <select id="v197Type">
          <option value="">All payment types</option>
          <option value="new">New</option>
          <option value="renewal">Renewal</option>
          <option value="refund">Refund</option>
          <option value="correction">Correction</option>
        </select>
        <select id="v197MemberType">
          <option value="">Teacher + Learner</option>
          <option value="teacher">Teacher</option>
          <option value="learner">Learner</option>
        </select>
        <label>From<input id="v197From" type="date"></label>
        <label>To<input id="v197To" type="date"></label>
      </div>

      <div id="v197Ledger"></div>
    `;

    const paint=()=>{
      const rows=filteredPayments(panel,data);
      const ledger=panel.querySelector('#v197Ledger');
      ledger.innerHTML=rows.length?`
        <div class="v197-table-wrap">
          <table class="v197-table">
            <thead><tr>
              <th>Date</th><th>Member</th><th>Type</th><th>Plan</th>
              <th>Amount</th><th>Method</th><th>Reference</th><th>Access</th><th></th>
            </tr></thead>
            <tbody>
              ${rows.map(p=>{
                const period=data.access.find(a=>a.payment_id===p.id);
                return `<tr class="${Number(p.amount)<0?'adjustment':''}">
                  <td>${esc(p.paid_on)}</td>
                  <td><strong>${esc(p.display_name_snapshot||p.username_snapshot)}</strong><small>${esc(p.username_snapshot)} · ${esc(p.member_type_snapshot||'')}</small></td>
                  <td>${esc(p.payment_kind)}</td>
                  <td>${esc(p.plan_name)}</td>
                  <td class="amount">${esc(money(p.amount,p.currency))}</td>
                  <td>${esc(p.payment_method)}</td>
                  <td>${esc(p.reference||'—')}</td>
                  <td>${period?`${esc(dateOnly(period.starts_at))}<br>→ ${esc(dateOnly(period.ends_at))}${period.cancelled_at?'<br><b>Cancelled</b>':''}`:'—'}</td>
                  <td>${Number(p.amount)>0&&isOwner()?`<button class="btn btn-small btn-ghost" data-adjust="${p.id}">Refund / Correct</button>`:''}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`:'<div class="empty-state" style="height:100px">No payments match these filters.</div>';

      ledger.querySelectorAll('[data-adjust]').forEach(btn=>{
        btn.addEventListener('click',()=>{
          const payment=data.payments.find(p=>p.id===btn.dataset.adjust);
          if(payment)openAdjustment(payment,panel);
        });
      });
    };

    ['v197Search','v197Type','v197MemberType','v197From','v197To'].forEach(id=>{
      panel.querySelector(`#${id}`).addEventListener(id==='v197Search'?'input':'change',paint);
    });

    panel.querySelector('#v197Record').addEventListener('click',()=>openRecordPayment());
    panel.querySelector('#v197Excel').addEventListener('click',()=>exportExcel(panel,data));
    panel.querySelector('#v197Csv').addEventListener('click',()=>exportCsv(panel,data));
    paint();
  }

  // Admin tab wrapper
  if(typeof renderAdmin==='function'){
    const nativeRenderAdminV197=renderAdmin;
    renderAdmin=function(...args){
      nativeRenderAdminV197(...args);
      const tabs=els.content.querySelector('.admin-tabs');
      const panel=els.content.querySelector('#adminPanel');
      if(!tabs||!panel)return;

      let btn=[...tabs.querySelectorAll('button')].find(n=>/Payments\s*&\s*Accounting|💰\s*Payments/i.test(n.textContent||''));
      if(!btn){
        btn=document.createElement('button');
        btn.type='button';
        btn.className='btn btn-ghost';
        btn.textContent='💰 Payments';
        tabs.appendChild(btn);
      }

      const clean=btn.cloneNode(true);
      clean.classList.toggle('active',state.adminTab==='payments');
      btn.replaceWith(clean);

      clean.addEventListener('click',()=>{
        state.adminTab='payments';
        paymentData=null;
        render();
      });

      if(state.adminTab==='payments')renderAdminPayments(panel);
    };
  }

  // Member state + banners on all renders.
  const nativeRenderV197=render;
  render=async function(...args){
    const result=await nativeRenderV197(...args);
    replaceOldTrialCopy();

    clearTimeout(refreshTimer);
    refreshTimer=setTimeout(async()=>{
      if(state.profile&&!isStaff()){
        await loadMyPaidState();
        enhanceMemberHome();
      }
      replaceOldTrialCopy();
    },0);

    return result;
  };

  // Mutation observer keeps legacy 7-day wording from older scripts corrected.
  const obs=new MutationObserver(()=>replaceOldTrialCopy());
  const start=()=>{
    const root=document.getElementById('boardApp');
    if(root)obs.observe(root,{childList:true,subtree:true,characterData:true});
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();

  globalThis.PTP_PAYMENTS={
    version:VERSION,
    openRecordPayment
  };
})();
