/* Pawn to Professor v1.9.8y — Admin-only Curriculum & Communications
   - Curriculum calendar (Week 1 = 2026-09-07)
   - Production tracker
   - Paid Unit release reminders/status
   - Reminder history
   - Printable Excel (.xlsx) export
   Load AFTER paid-unit-release-v1.9.8k.js.
*/
(() => {
  if (typeof state === 'undefined' || typeof renderAdmin !== 'function' || typeof els === 'undefined') return;

  const VERSION = '1.9.8x';
  const TZ = 'Asia/Taipei';
  const SEMESTER = 'fall';
  const SCHOOL_YEAR = '2026';
  const START_DATE = '2026-09-07';

  const CHECK_FIELDS = [
    ['curriculum_checked','Curriculum'],
    ['lesson_completed','Lesson'],
    ['slides_completed','Slides'],
    ['flashcards_completed','Flashcards'],
    ['worksheet_completed','Worksheet'],
    ['game_completed','Game'],
    ['interactive_completed','Interactive'],
    ['teacher_guide_completed','Guide'],
    ['uploaded_online','Online'],
    ['tested_online','Tested'],
    ['ready_for_teachers','Ready']
  ];

  function esc(v='') {
    if (typeof escapeHtml === 'function') return escapeHtml(v);
    return String(v).replace(/[&<>"']/g,c=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function ymdInTaipei(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit'
    }).formatToParts(date);
    const map = Object.fromEntries(parts.map(p=>[p.type,p.value]));
    return `${map.year}-${map.month}-${map.day}`;
  }

  function parseYmd(s) {
    const [y,m,d] = String(s||'').split('-').map(Number);
    return Date.UTC(y,m-1,d);
  }

  function daysBetween(a,b) {
    return Math.round((parseYmd(b)-parseYmd(a))/86400000);
  }

  function addDays(ymd, days) {
    const d = new Date(parseYmd(ymd) + Number(days||0)*86400000);
    return d.toISOString().slice(0,10);
  }

  function fmtDate(ymd) {
    if (!ymd) return '—';
    try {
      const [y,m,d] = ymd.split('-').map(Number);
      return new Intl.DateTimeFormat('en-GB', {
        day:'2-digit', month:'short', year:'numeric', timeZone:'UTC'
      }).format(new Date(Date.UTC(y,m-1,d)));
    } catch { return String(ymd); }
  }

  function currentWeek(today=ymdInTaipei()) {
    const diff = daysBetween(START_DATE,today);
    if (diff < 0) return 0;
    return Math.floor(diff/7)+1;
  }

  function weekRange(week) {
    if (!week || week < 1) return 'Before semester';
    const start = addDays(START_DATE,(week-1)*7);
    const end = addDays(start,6);
    return `${fmtDate(start)} – ${fmtDate(end)}`;
  }

  function unitName(n) { return `Unit ${Number(n)}`; }

  function releasedSet(rows=[]) {
    return new Set(rows.map(r=>String(r.unit_name||'').trim().toLowerCase()));
  }

  function statusFor(row, released, today=ymdInTaipei()) {
    if (released.has(unitName(row.unit_number).toLowerCase())) return 'UNLOCKED';
    const untilUnlock = daysBetween(today,row.unlock_date);
    if (untilUnlock < 0) return 'OVERDUE';
    if (untilUnlock <= 7) return 'UNLOCK DUE';
    const untilStart = daysBetween(today,row.start_date);
    if (untilStart <= 21) return 'PREPARE';
    return 'FUTURE';
  }

  function statusBadge(status) {
    const icons = {
      'UNLOCKED':'🟢','UNLOCK DUE':'🟠','OVERDUE':'🔴','PREPARE':'🟡','FUTURE':'⚪'
    };
    const cls = String(status).toLowerCase().replace(/\s+/g,'-');
    return `<span class="cm-status ${cls}">${icons[status]||'⚪'} ${esc(status)}</span>`;
  }

  function blankTracker(scheduleId) {
    const row = { schedule_id:scheduleId, notes:'', updated_at:null };
    CHECK_FIELDS.forEach(([key])=>row[key]=false);
    return row;
  }

  function trackerPercent(row) {
    const done = CHECK_FIELDS.reduce((n,[key])=>n+(row?.[key]===true?1:0),0);
    return Math.round(done/CHECK_FIELDS.length*100);
  }

  function trackerStatus(row) {
    const p=trackerPercent(row);
    return p===100 ? 'READY' : p===0 ? 'NOT STARTED' : 'IN PROGRESS';
  }

  async function loadManagerData() {
    const [scheduleRes, trackerRes, historyRes, releasedRes] = await Promise.all([
      state.client.from('curriculum_schedule')
        .select('*')
        .eq('school_year_label',SCHOOL_YEAR)
        .eq('semester',SEMESTER)
        .order('grade_number')
        .order('unit_number'),
      state.client.from('curriculum_tracker').select('*'),
      state.client.from('curriculum_reminder_history')
        .select('*')
        .order('sent_at',{ascending:false})
        .limit(200),
      state.client.rpc('list_paid_unit_releases')
    ]);

    if (scheduleRes.error) throw scheduleRes.error;
    if (trackerRes.error) throw trackerRes.error;
    if (historyRes.error) throw historyRes.error;

    const trackerMap = new Map((trackerRes.data||[]).map(r=>[r.schedule_id,r]));
    const schedule = (scheduleRes.data||[]).map(r=>({
      ...r,
      tracker: trackerMap.get(r.id) || blankTracker(r.id)
    }));

    const {data:releaseNews}=await state.client.from('release_announcements')
      .select('*').order('released_at',{ascending:false}).limit(100);
    return {
      schedule,
      history: historyRes.data||[],
      released: releasedRes.error ? [] : (releasedRes.data||[]),
      releaseNews: releaseNews||[]
    };
  }

  function globalReleases(schedule,releasedRows) {
    const released = releasedSet(releasedRows);
    const byUnit=new Map();
    for (const row of schedule) {
      if (Number(row.unit_number) <= 1) continue; // Unit 1 is the default opening unit.
      const n=Number(row.unit_number);
      if(!byUnit.has(n)) byUnit.set(n,[]);
      byUnit.get(n).push(row);
    }
    return [...byUnit.entries()].map(([unit,rows])=>{
      rows.sort((a,b)=>String(a.unlock_date).localeCompare(String(b.unlock_date)));
      const earliestUnlock=rows[0].unlock_date;
      const earliestStart=[...rows].sort((a,b)=>String(a.start_date).localeCompare(String(b.start_date)))[0].start_date;
      return {
        unit_number:unit,
        unlock_date:earliestUnlock,
        earliest_start_date:earliestStart,
        grades:rows.map(r=>`G${r.grade_number}`).join(', '),
        released:released.has(unitName(unit).toLowerCase()),
        rows
      };
    }).sort((a,b)=>a.unit_number-b.unit_number);
  }

  async function saveTrackerField(scheduleId, field, value) {
    const payload = {
      schedule_id:scheduleId,
      [field]:value,
      updated_at:new Date().toISOString(),
      updated_by:state.profile?.id || null
    };
    const {error}=await state.client.from('curriculum_tracker')
      .upsert(payload,{onConflict:'schedule_id'});
    if(error) throw error;
  }

  async function saveTrackerNotes(scheduleId, notes) {
    return saveTrackerField(scheduleId,'notes',String(notes||'').trim());
  }

  async function releaseUnit(unitNumber) {
    const name=unitName(unitNumber);
    if(!confirm(`Release ${name} to ALL active annual paid users?\n\nThis uses the existing Paid Unit Release system and may open ${name} across several grades.`)) return false;
    const {error}=await state.client.rpc('release_paid_unit_name',{target_unit_name:name});
    if(error) throw error;
    return true;
  }

  function nextRelease(globalRows,today=ymdInTaipei()) {
    return globalRows
      .filter(r=>!r.released)
      .sort((a,b)=>String(a.unlock_date).localeCompare(String(b.unlock_date)))[0] || null;
  }

  function managerTabs(active) {
    const tabs=[
      ['overview','📊 Overview'],
      ['calendar','📅 Calendar'],
      ['tracker','✅ Production Tracker'],
      ['releases','🔓 Unit Releases'],
      ['massMessages','📨 Mass Messages'],
      ['releaseNews','🆕 Release Announcements'],
      ['reminders','📧 Reminder History']
    ];
    return `<div class="cm-tabs">${tabs.map(([id,label])=>`<button class="btn btn-small ${active===id?'btn-accent':'btn-ghost'}" data-cm-tab="${id}" type="button">${label}</button>`).join('')}</div>`;
  }

  function overviewHtml(data) {
    const today=ymdInTaipei();
    const week=currentWeek(today);
    const globals=globalReleases(data.schedule,data.released);
    const next=nextRelease(globals,today);
    const incomplete=data.schedule.filter(r=>trackerPercent(r.tracker)<100).length;
    const overdue=globals.filter(r=>!r.released && daysBetween(r.unlock_date,today)>0).length;
    const currentRows=data.schedule.filter(r=>week>=r.start_week && week<=r.end_week);

    return `
      <div class="cm-kpis">
        <div class="cm-kpi"><strong>Week ${week || '—'}</strong><span>${esc(weekRange(week))}</span></div>
        <div class="cm-kpi"><strong>${overdue}</strong><span>overdue Unit release${overdue===1?'':'s'}</span></div>
        <div class="cm-kpi"><strong>${incomplete}</strong><span>production rows not fully ready</span></div>
      </div>

      <div class="cm-grid2">
        <section class="cm-card">
          <h3>📅 This teaching week</h3>
          ${currentRows.length ? currentRows.map(r=>`
            <div class="cm-line">
              <span><strong>G${r.grade_number} · Unit ${r.unit_number}</strong><br><small>${esc(r.unit_theme)}</small></span>
              ${statusBadge(statusFor(r,releasedSet(data.released),today))}
            </div>`).join('') : '<p class="admin-note">No scheduled curriculum Unit for this week.</p>'}
        </section>

        <section class="cm-card">
          <h3>🔓 Next paid Unit release</h3>
          ${next ? `
            <p><strong>${unitName(next.unit_number)}</strong> · ${esc(next.grades)}</p>
            <p>Recommended unlock: <strong>${esc(fmtDate(next.unlock_date))}</strong><br>
            Earliest teaching start: ${esc(fmtDate(next.earliest_start_date))}</p>
            <button class="btn btn-accent" data-cm-release="${next.unit_number}" type="button">Unlock ${unitName(next.unit_number)}</button>
          ` : '<p class="admin-note">All scheduled Units are currently released.</p>'}
        </section>
      </div>

      <section class="cm-card">
        <h3>✅ Quick production view</h3>
        <div class="cm-mini-list">
          ${data.schedule.map(r=>{
            const p=trackerPercent(r.tracker);
            return `<div><span>G${r.grade_number} · Unit ${r.unit_number} — ${esc(r.unit_theme)}</span><span><b>${p}%</b> ${esc(trackerStatus(r.tracker))}</span></div>`;
          }).join('')}
        </div>
      </section>
    `;
  }

  function calendarHtml(data) {
    const today=ymdInTaipei();
    const released=releasedSet(data.released);
    return `
      <div class="cm-table-wrap">
        <table class="cm-table">
          <thead><tr><th>Grade</th><th>Unit</th><th>Theme</th><th>Weeks</th><th>Starts</th><th>Unlock by</th><th>Status</th></tr></thead>
          <tbody>${data.schedule.map(r=>`
            <tr>
              <td>G${r.grade_number}</td>
              <td>Unit ${r.unit_number}</td>
              <td>${esc(r.unit_theme)}</td>
              <td>${r.start_week}–${r.end_week}</td>
              <td>${esc(fmtDate(r.start_date))}</td>
              <td>${esc(fmtDate(r.unlock_date))}</td>
              <td>${statusBadge(statusFor(r,released,today))}</td>
            </tr>`).join('')}</tbody>
        </table>
      </div>`;
  }

  function trackerHtml(data) {
    return `
      <p class="admin-note">Click a box when that production step is complete. Changes save immediately. Notes have their own Save button.</p>
      <div class="cm-table-wrap">
        <table class="cm-table cm-tracker-table">
          <thead>
            <tr>
              <th>Grade</th><th>Unit / Theme</th><th>Weeks</th>
              ${CHECK_FIELDS.map(([,label])=>`<th>${esc(label)}</th>`).join('')}
              <th>Progress</th><th>Notes</th>
            </tr>
          </thead>
          <tbody>${data.schedule.map(r=>`
            <tr data-cm-schedule="${r.id}">
              <td>G${r.grade_number}</td>
              <td><strong>Unit ${r.unit_number}</strong><br><small>${esc(r.unit_theme)}</small></td>
              <td>${r.start_week}–${r.end_week}</td>
              ${CHECK_FIELDS.map(([key])=>`<td class="cm-checkcell"><input type="checkbox" data-cm-field="${key}" ${r.tracker?.[key]===true?'checked':''} aria-label="${esc(key)}"></td>`).join('')}
              <td><div class="cm-progress"><span style="width:${trackerPercent(r.tracker)}%"></span></div><small>${trackerPercent(r.tracker)}% · ${esc(trackerStatus(r.tracker))}</small></td>
              <td><textarea data-cm-notes rows="2" placeholder="Notes…">${esc(r.tracker?.notes||'')}</textarea><button class="btn btn-small btn-ghost" data-cm-save-notes type="button">Save notes</button></td>
            </tr>`).join('')}</tbody>
        </table>
      </div>`;
  }

  function releasesHtml(data) {
    const today=ymdInTaipei();
    const rows=globalReleases(data.schedule,data.released);
    return `
      <p class="admin-note">Your existing Paid Release system opens a Unit number across all published grades. The date below uses the earliest curriculum need for that Unit number.</p>
      <div class="cm-table-wrap">
        <table class="cm-table">
          <thead><tr><th>Paid Unit</th><th>Grades using it</th><th>Earliest start</th><th>Recommended unlock</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>${rows.map(r=>{
            const overdue=!r.released && daysBetween(r.unlock_date,today)>0;
            const due=!r.released && daysBetween(today,r.unlock_date)>=0 && daysBetween(today,r.unlock_date)<=7;
            return `<tr>
              <td><strong>${unitName(r.unit_number)}</strong></td>
              <td>${esc(r.grades)}</td>
              <td>${esc(fmtDate(r.earliest_start_date))}</td>
              <td>${esc(fmtDate(r.unlock_date))}</td>
              <td>${r.released ? statusBadge('UNLOCKED') : overdue ? statusBadge('OVERDUE') : due ? statusBadge('UNLOCK DUE') : statusBadge('FUTURE')}</td>
              <td>${r.released ? '<span class="cm-ok">Released</span>' : `<button class="btn btn-small btn-accent" data-cm-release="${r.unit_number}" type="button">Unlock</button>`}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>`;
  }


  async function loadMassMessageData() {
    const [profilesRes, historyRes, annualRes] = await Promise.all([
      state.client.from('profiles')
        .select('id,username,display_name,contact_email,member_type,role,status,expires_at,trial_started_at,trial_ends_at')
        .eq('role','user')
        .eq('status','active')
        .order('display_name'),
      state.client.from('mass_message_history')
        .select('*')
        .order('created_at',{ascending:false})
        .limit(100),
      state.client.from('annual_access_periods')
        .select('user_id,starts_at,ends_at,cancelled_at')
    ]);
    if (profilesRes.error) throw profilesRes.error;
    if (historyRes.error) throw historyRes.error;
    const now=Date.now();
    const paidIds=new Set((annualRes.data||[]).filter(a=>
      !a.cancelled_at &&
      new Date(a.starts_at).getTime()<=now &&
      new Date(a.ends_at).getTime()>now
    ).map(a=>a.user_id));
    const active=(profilesRes.data||[]).filter(p=>!p.expires_at || new Date(p.expires_at).getTime()>now);
    return {profiles:active,history:historyRes.data||[],paidIds};
  }

  function isTrialProfile(p) {
    const now=Date.now();
    return !!p?.trial_started_at && !!p?.trial_ends_at &&
      new Date(p.trial_started_at).getTime()<=now &&
      new Date(p.trial_ends_at).getTime()>now;
  }

  function massAudienceCount(mm,audience,selectedIds=[]) {
    if(!mm)return 0;
    if(audience==='all') return mm.profiles.length;
    if(audience==='teachers') return mm.profiles.filter(p=>p.member_type==='teacher').length;
    if(audience==='learners') return mm.profiles.filter(p=>p.member_type==='learner').length;
    if(audience==='trial') return mm.profiles.filter(isTrialProfile).length;
    if(audience==='paid') return mm.profiles.filter(p=>mm.paidIds.has(p.id)).length;
    if(audience==='selected') return selectedIds.length;
    return 0;
  }

  function massMessagesHtml(mm) {
    return `
      <div class="cm-card">
        <h3>📨 Send Mass Message</h3>
        <p class="admin-note">Each recipient gets a separate private mailbox copy. Members cannot see each other.</p>
        <div class="admin-form-grid">
          <label>Audience
            <select id="cmMassAudience">
              <option value="all">All active members</option>
              <option value="teachers">All teachers</option>
              <option value="learners">All learners</option>
              <option value="trial">Active trial members</option>
              <option value="paid">Active paid members</option>
              <option value="selected">Selected members</option>
              <option value="unit_access">Members with access to a Grade / Unit</option>
            </select>
          </label>
          <label>Category
            <select id="cmMassCategory">
              <option value="general">General</option>
              <option value="access_payment">Access / Payment</option>
              <option value="technical">Technical</option>
              <option value="account">Account</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label id="cmMassGradeWrap" class="hidden">Grade
            <select id="cmMassGrade">
              <option value="">Choose grade…</option>
              ${[3,4,5,6].map(g=>`<option value="${g}">Grade ${g}</option>`).join('')}
            </select>
          </label>

          <label id="cmMassUnitWrap" class="hidden">Unit
            <select id="cmMassUnit">
              <option value="">Choose unit…</option>
              ${[1,2,3,4,5,6].map(u=>`<option value="${u}">Unit ${u}</option>`).join('')}
            </select>
          </label>

          <label id="cmMassSelectedWrap" class="wide hidden">Choose members
            <select id="cmMassSelected" multiple size="9">
              ${mm.profiles.map(p=>`<option value="${p.id}">${esc(p.display_name||p.username)} · ${esc(p.member_type||'member')} · ${esc(p.username)}</option>`).join('')}
            </select>
          </label>

          <label class="wide">Subject
            <input id="cmMassSubject" maxlength="180" placeholder="Message subject">
          </label>

          <label class="wide">Message
            <textarea id="cmMassBody" maxlength="8000" rows="8" placeholder="Write your announcement…"></textarea>
          </label>

          <label class="checkbox-card wide">
            <input id="cmMassEmail" type="checkbox" checked>
            Also send an email notification
          </label>
        </div>

        <div class="cm-recipient-preview">
          <strong id="cmMassRecipientCount">0 recipients</strong>
          <span id="cmMassRecipientNote">Choose an audience.</span>
        </div>

        <div class="button-row">
          <button id="cmMassPreview" class="btn btn-ghost" type="button">Preview Recipients</button>
          <button id="cmMassSend" class="btn btn-accent" type="button">Send Mass Message</button>
        </div>
      </div>

      <div class="cm-card">
        <h3>📨 Mass Message History</h3>
        <div class="cm-table-wrap">
          <table class="cm-table">
            <thead><tr><th>Date</th><th>Audience</th><th>Subject</th><th>Recipients</th><th>Mailbox</th><th>Email</th><th>Status</th></tr></thead>
            <tbody>${mm.history.length?mm.history.map(h=>`
              <tr>
                <td>${esc(h.created_at?new Date(h.created_at).toLocaleString():'—')}</td>
                <td>${esc(h.audience_label||h.audience||'')}</td>
                <td>${esc(h.subject||'')}</td>
                <td>${Number(h.recipient_count||0)}</td>
                <td>${Number(h.mailbox_delivered||0)}</td>
                <td>${Number(h.email_sent||0)} sent${Number(h.email_failed||0)?`, ${Number(h.email_failed)} failed`:''}</td>
                <td>${esc(h.status||'')}</td>
              </tr>`).join(''):'<tr><td colspan="7">No mass messages sent yet.</td></tr>'}</tbody>
          </table>
        </div>
      </div>`;
  }

  function releaseNewsHtml(rows=[]) {
    return `
      <p class="admin-note">These announcements are shown on the Learning Hub front page and are emailed to all active accounts when a paid Unit is released.</p>
      <div class="cm-table-wrap">
        <table class="cm-table">
          <thead><tr><th>Released</th><th>Unit</th><th>Title</th><th>Message</th></tr></thead>
          <tbody>${rows.length?rows.map(r=>`
            <tr>
              <td>${esc(r.released_at?new Date(r.released_at).toLocaleString():'—')}</td>
              <td>Unit ${Number(r.unit_number||0)}</td>
              <td>${esc(r.title||'')}</td>
              <td>${esc(r.message||'')}</td>
            </tr>`).join(''):'<tr><td colspan="4">No Unit release announcements yet.</td></tr>'}</tbody>
        </table>
      </div>`;
  }

  async function massMessageApi(payload) {
    const headers=await authHeaders();
    const res=await fetch('/api/security?action=mass-message',{
      method:'POST',headers,cache:'no-store',body:JSON.stringify(payload)
    });
    const body=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(body.error||'Mass message action failed.');
    return body;
  }

  function remindersHtml(data) {
    return `
      <div class="button-row">
        <button id="cmRunReminderCheck" class="btn btn-accent" type="button">Run reminder check now</button>
      </div>
      <p class="admin-note">The scheduled check runs daily at 08:15 Taiwan time. It emails active Admin/Owner accounts for upcoming/current curriculum weeks and Unit-release deadlines.</p>
      <div class="cm-table-wrap">
        <table class="cm-table">
          <thead><tr><th>Sent</th><th>Type</th><th>Week</th><th>Unit</th><th>Subject</th><th>Status</th><th>Recipients</th></tr></thead>
          <tbody>${data.history.length ? data.history.map(r=>`
            <tr>
              <td>${esc(r.sent_at ? new Date(r.sent_at).toLocaleString() : '—')}</td>
              <td>${esc(r.reminder_type||'')}</td>
              <td>${r.week_number||'—'}</td>
              <td>${r.unit_number?`Unit ${r.unit_number}`:'—'}</td>
              <td>${esc(r.subject||'')}</td>
              <td>${esc(r.status||'')}</td>
              <td>${esc((r.sent_to||[]).join(', '))}</td>
            </tr>`).join('') : '<tr><td colspan="7">No reminders have been logged yet.</td></tr>'}</tbody>
        </table>
      </div>`;
  }

  function setWorkbookSheetDefaults(ws, widths) {
    ws['!cols']=widths.map(w=>({wch:w}));
    if (ws['!ref']) ws['!autofilter']={ref:ws['!ref']};
    ws['!freeze']={xSplit:0,ySplit:1};
    ws['!pageSetup']={orientation:'landscape',fitToWidth:1,fitToHeight:0,paperSize:9};
    ws['!margins']={left:0.25,right:0.25,top:0.4,bottom:0.4,header:0.2,footer:0.2};
  }

  function exportExcel(data) {
    if (!globalThis.XLSX) return toast('Excel export library is not loaded. Refresh the page and try again.');

    const released=releasedSet(data.released);
    const today=ymdInTaipei();
    const calendarRows=data.schedule.map(r=>({
      Grade:`Grade ${r.grade_number}`,
      Unit:`Unit ${r.unit_number}`,
      Theme:r.unit_theme,
      'Start Week':r.start_week,
      'End Week':r.end_week,
      'Teaching Start':r.start_date,
      'Unlock By':r.unlock_date,
      Status:statusFor(r,released,today)
    }));

    const trackerRows=data.schedule.map(r=>{
      const out={
        Grade:`Grade ${r.grade_number}`,
        Unit:`Unit ${r.unit_number}`,
        Theme:r.unit_theme,
        Weeks:`${r.start_week}-${r.end_week}`
      };
      CHECK_FIELDS.forEach(([key,label])=>out[label]=r.tracker?.[key]===true?'YES':'');
      out.Progress=`${trackerPercent(r.tracker)}%`;
      out.Status=trackerStatus(r.tracker);
      out.Notes=r.tracker?.notes||'';
      out['Last Updated']=r.tracker?.updated_at||'';
      return out;
    });

    const releaseRows=globalReleases(data.schedule,data.released).map(r=>({
      Unit:unitName(r.unit_number),
      Grades:r.grades,
      'Earliest Teaching Start':r.earliest_start_date,
      'Recommended Unlock':r.unlock_date,
      Released:r.released?'YES':'NO'
    }));

    const reminderRows=data.history.map(r=>({
      'Sent At':r.sent_at||'',
      Type:r.reminder_type||'',
      Week:r.week_number||'',
      Unit:r.unit_number?unitName(r.unit_number):'',
      Subject:r.subject||'',
      Status:r.status||'',
      Recipients:(r.sent_to||[]).join(', ')
    }));

    const wb=XLSX.utils.book_new();

    const ws1=XLSX.utils.json_to_sheet(calendarRows);
    setWorkbookSheetDefaults(ws1,[12,10,34,11,10,16,16,14]);
    XLSX.utils.book_append_sheet(wb,ws1,'Curriculum Calendar');

    const ws2=XLSX.utils.json_to_sheet(trackerRows);
    setWorkbookSheetDefaults(ws2,[12,10,32,10,12,10,10,12,11,10,13,10,10,10,11,12,14,36,22]);
    XLSX.utils.book_append_sheet(wb,ws2,'Production Tracker');

    const ws3=XLSX.utils.json_to_sheet(releaseRows);
    setWorkbookSheetDefaults(ws3,[12,20,22,22,12]);
    XLSX.utils.book_append_sheet(wb,ws3,'Unit Release Schedule');

    const ws4=XLSX.utils.json_to_sheet(reminderRows);
    setWorkbookSheetDefaults(ws4,[22,22,8,10,40,12,42]);
    XLSX.utils.book_append_sheet(wb,ws4,'Reminder History');

    XLSX.writeFile(wb,`Pawn-to-Professor-Curriculum-Tracker-${today}.xlsx`,{compression:true});
  }

  async function renderManager(panel, activeTab='overview') {
    panel.innerHTML=`
      <div class="cm-head">
        <div>
          <h2>📅 Curriculum & Communications</h2>
          <p class="admin-note">Admin-only curriculum planning, production tracking, Unit releases, mass messages and Excel export.</p>
        </div>
        <button id="cmExportExcel" class="btn btn-accent" type="button">📊 Export Excel</button>
      </div>
      ${managerTabs(activeTab)}
      <div id="cmBody"><div class="empty-state" style="height:120px">Loading curriculum…</div></div>`;

    let data;
    let massData=null;
    try {
      data=await loadManagerData();
    } catch(err) {
      panel.querySelector('#cmBody').innerHTML=`<div class="empty-state"><strong>Curriculum Manager is not ready.</strong><br>${esc(err.message||'Run the SQL patch first.')}</div>`;
      return;
    }

    let tab=activeTab;
    const paint=async()=>{
      const body=panel.querySelector('#cmBody');
      if(tab==='overview') body.innerHTML=overviewHtml(data);
      if(tab==='calendar') body.innerHTML=calendarHtml(data);
      if(tab==='tracker') body.innerHTML=trackerHtml(data);
      if(tab==='releases') body.innerHTML=releasesHtml(data);
      if(tab==='massMessages') {
        if(!massData) massData=await loadMassMessageData();
        body.innerHTML=massMessagesHtml(massData);
      }
      if(tab==='releaseNews') body.innerHTML=releaseNewsHtml(data.releaseNews||[]);
      if(tab==='reminders') body.innerHTML=remindersHtml(data);

      panel.querySelectorAll('[data-cm-release]').forEach(btn=>btn.addEventListener('click',async()=>{
        btn.disabled=true;
        try{
          const ok=await releaseUnit(Number(btn.dataset.cmRelease));
          if(ok){
            toast(`${unitName(btn.dataset.cmRelease)} released.`);
            data=await loadManagerData();
            paint();
          }
        }catch(err){ toast(err.message||'Could not release this Unit.'); }
        finally{ btn.disabled=false; }
      }));

      if(tab==='tracker'){
        panel.querySelectorAll('[data-cm-schedule]').forEach(tr=>{
          const scheduleId=tr.dataset.cmSchedule;
          tr.querySelectorAll('[data-cm-field]').forEach(cb=>cb.addEventListener('change',async()=>{
            cb.disabled=true;
            try{
              await saveTrackerField(scheduleId,cb.dataset.cmField,cb.checked);
              const row=data.schedule.find(x=>x.id===scheduleId);
              if(row){
                row.tracker={...(row.tracker||blankTracker(scheduleId)),[cb.dataset.cmField]:cb.checked,updated_at:new Date().toISOString()};
              }
              const p=trackerPercent(row?.tracker);
              const cell=tr.querySelector('.cm-progress')?.parentElement;
              if(cell) cell.innerHTML=`<div class="cm-progress"><span style="width:${p}%"></span></div><small>${p}% · ${esc(trackerStatus(row?.tracker))}</small>`;
            }catch(err){ cb.checked=!cb.checked; toast(err.message||'Could not save progress.'); }
            finally{ cb.disabled=false; }
          }));

          const saveNotes=tr.querySelector('[data-cm-save-notes]');
          saveNotes?.addEventListener('click',async()=>{
            const notes=tr.querySelector('[data-cm-notes]').value;
            saveNotes.disabled=true;
            try{
              await saveTrackerNotes(scheduleId,notes);
              const row=data.schedule.find(x=>x.id===scheduleId);
              if(row) row.tracker={...(row.tracker||blankTracker(scheduleId)),notes,updated_at:new Date().toISOString()};
              toast('Notes saved.');
            }catch(err){ toast(err.message||'Could not save notes.'); }
            finally{ saveNotes.disabled=false; }
          });
        });
      }


      if(tab==='massMessages'){
        const audience=panel.querySelector('#cmMassAudience');
        const selectedWrap=panel.querySelector('#cmMassSelectedWrap');
        const gradeWrap=panel.querySelector('#cmMassGradeWrap');
        const unitWrap=panel.querySelector('#cmMassUnitWrap');
        const selected=panel.querySelector('#cmMassSelected');
        const countEl=panel.querySelector('#cmMassRecipientCount');
        const noteEl=panel.querySelector('#cmMassRecipientNote');

        const selectedIds=()=>[...(selected?.selectedOptions||[])].map(o=>o.value);

        const syncMassAudience=()=>{
          const value=audience.value;
          selectedWrap.classList.toggle('hidden',value!=='selected');
          gradeWrap.classList.toggle('hidden',value!=='unit_access');
          unitWrap.classList.toggle('hidden',value!=='unit_access');

          if(value==='unit_access'){
            countEl.textContent='Preview required';
            noteEl.textContent='Choose Grade and Unit, then click Preview Recipients.';
            return;
          }
          const count=massAudienceCount(massData,value,selectedIds());
          countEl.textContent=`${count} recipient${count===1?'':'s'}`;
          noteEl.textContent='Each recipient receives a separate private mailbox message.';
        };

        audience.addEventListener('change',syncMassAudience);
        selected?.addEventListener('change',syncMassAudience);
        syncMassAudience();

        panel.querySelector('#cmMassPreview')?.addEventListener('click',async()=>{
          try{
            const result=await massMessageApi({
              action:'preview',
              audience:audience.value,
              userIds:selectedIds(),
              gradeNumber:Number(panel.querySelector('#cmMassGrade')?.value||0)||null,
              unitNumber:Number(panel.querySelector('#cmMassUnit')?.value||0)||null
            });
            countEl.textContent=`${result.recipientCount} recipient${result.recipientCount===1?'':'s'}`;
            noteEl.textContent=(result.preview||[]).slice(0,12).map(x=>x.displayName||x.username).join(' · ')
              +(result.recipientCount>12?' · …':'');
          }catch(err){ toast(err.message); }
        });

        panel.querySelector('#cmMassSend')?.addEventListener('click',async e=>{
          const btn=e.currentTarget;
          const subject=panel.querySelector('#cmMassSubject').value.trim();
          const message=panel.querySelector('#cmMassBody').value.trim();
          if(!subject||!message)return toast('Add a subject and message.');

          let preview;
          try{
            preview=await massMessageApi({
              action:'preview',
              audience:audience.value,
              userIds:selectedIds(),
              gradeNumber:Number(panel.querySelector('#cmMassGrade')?.value||0)||null,
              unitNumber:Number(panel.querySelector('#cmMassUnit')?.value||0)||null
            });
          }catch(err){return toast(err.message);}

          if(!preview.recipientCount)return toast('No active recipients match this selection.');
          if(!confirm(`Send this message to ${preview.recipientCount} recipient${preview.recipientCount===1?'':'s'}?\n\nEach person receives a separate private mailbox copy.`))return;

          btn.disabled=true;btn.textContent='Sending…';
          try{
            const result=await massMessageApi({
              action:'send',
              audience:audience.value,
              userIds:selectedIds(),
              gradeNumber:Number(panel.querySelector('#cmMassGrade')?.value||0)||null,
              unitNumber:Number(panel.querySelector('#cmMassUnit')?.value||0)||null,
              category:panel.querySelector('#cmMassCategory').value,
              subject,
              body:message,
              sendEmail:panel.querySelector('#cmMassEmail').checked
            });
            toast(`Mass message complete: ${result.mailboxDelivered} mailbox, ${result.emailSent} email sent${result.emailFailed?`, ${result.emailFailed} failed`:''}.`);
            massData=await loadMassMessageData();
            await paint();
          }catch(err){toast(err.message);}
          finally{btn.disabled=false;btn.textContent='Send Mass Message';}
        });
      }

      if(tab==='reminders'){
        panel.querySelector('#cmRunReminderCheck')?.addEventListener('click',async(e)=>{
          const btn=e.currentTarget;
          btn.disabled=true; btn.textContent='Checking…';
          try{
            const headers=await authHeaders();
            const res=await fetch('/api/security?action=curriculum-reminders',{method:'POST',headers,cache:'no-store'});
            const body=await res.json().catch(()=>({}));
            if(!res.ok) throw new Error(body.error||'Reminder check failed.');
            toast(body.events ? `${body.events} reminder event(s) processed.` : 'No curriculum reminders are due right now.');
            data=await loadManagerData();
            paint();
          }catch(err){ toast(err.message||'Reminder check failed.'); }
          finally{ btn.disabled=false; btn.textContent='Run reminder check now'; }
        });
      }
    };

    panel.querySelectorAll('[data-cm-tab]').forEach(btn=>btn.addEventListener('click',()=>{
      tab=btn.dataset.cmTab;
      panel.querySelectorAll('[data-cm-tab]').forEach(x=>{
        x.classList.toggle('btn-accent',x.dataset.cmTab===tab);
        x.classList.toggle('btn-ghost',x.dataset.cmTab!==tab);
      });
      paint();
    }));

    panel.querySelector('#cmExportExcel').addEventListener('click',()=>exportExcel(data));
    paint();
  }

  const nativeRenderAdminCM=renderAdmin;
  renderAdmin=function(...args){
    const result=nativeRenderAdminCM(...args);
    if (!isStaff()) return result;

    const tabs=els.content.querySelector('.admin-tabs');
    const panel=els.content.querySelector('#adminPanel');
    if(!tabs||!panel)return result;

    let btn=[...tabs.querySelectorAll('button')].find(b=>b.dataset.cmManager==='true');
    if(!btn){
      btn=document.createElement('button');
      btn.type='button';
      btn.className='btn btn-ghost';
      btn.dataset.cmManager='true';
      btn.textContent='📅 Curriculum & Communications';

      const teacherTools=[...tabs.querySelectorAll('button')].find(b=>/Teacher Tools/i.test(b.textContent||''));
      if(teacherTools) teacherTools.insertAdjacentElement('afterend',btn);
      else tabs.appendChild(btn);
    }

    const clean=btn.cloneNode(true);
    clean.dataset.cmManager='true';
    clean.classList.toggle('active',state.adminTab==='curriculumManager');
    btn.replaceWith(clean);

    clean.addEventListener('click',()=>{
      state.adminTab='curriculumManager';
      render();
    });

    if(state.adminTab==='curriculumManager'){
      renderManager(panel,'overview');
    }

    return result;
  };

  globalThis.PTP_CURRICULUM_MANAGER={version:VERSION};
})();
