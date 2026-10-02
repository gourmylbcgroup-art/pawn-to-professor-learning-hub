/* Pawn to Professor v1.9.8r — Combined Homepage Analytics
   Load AFTER analytics.js.

   Adds:
   1) Logged-in member homepage metrics from existing usage_events / portal_home_view
   2) Public/login-page visitor metrics from public_home_visits

   Privacy:
   - No IP address is collected by this script.
   - Public unique visitors use a random browser UUID stored in localStorage.
*/
(() => {
  const VERSION = '1.9.8r';
  const PUBLIC_VISITOR_KEY = 'ptp_public_visitor_id_v1';
  let analyticsEnhancing = false;
  let enhanceTimer = null;
  let publicVisitLoggedThisPage = false;

  function isStaffAccount() {
    try { return typeof isStaff === 'function' && isStaff(); }
    catch { return ['admin','owner'].includes(state?.profile?.role); }
  }

  function esc(value='') {
    return String(value).replace(/[&<>'"]/g, ch => ({
      '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
    }[ch]));
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

  function countMemberPeriod(rows, start) {
    const from = start.getTime();
    const filtered = rows.filter(r => new Date(r.created_at).getTime() >= from);
    return {
      opens: filtered.length,
      unique: new Set(filtered.map(r => r.user_id).filter(Boolean)).size
    };
  }

  function countPublicPeriod(rows, start) {
    const from = start.getTime();
    const filtered = rows.filter(r => new Date(r.created_at).getTime() >= from);
    return {
      opens: filtered.length,
      unique: new Set(filtered.map(r => r.visitor_key).filter(Boolean)).size
    };
  }

  function stat(value, label) {
    return `
      <div class="analytics-stat">
        <strong>${Number(value || 0).toLocaleString()}</strong>
        <span>${esc(label)}</span>
      </div>`;
  }

  async function waitForBoot() {
    for (let i=0; i<80; i++) {
      if (globalThis.state?.client && document.getElementById('loadingView')?.classList.contains('hidden')) return true;
      await new Promise(r => setTimeout(r, 100));
    }
    return false;
  }

  async function logPublicLoginPageVisit() {
    if (publicVisitLoggedThisPage) return;
    const ready = await waitForBoot();
    if (!ready) return;

    // Only log when the visitor is NOT signed in and the public login page is visible.
    const loginView = document.getElementById('loginView');
    const isLoginVisible = loginView && !loginView.classList.contains('hidden');
    if (state?.session || !isLoginVisible) return;

    publicVisitLoggedThisPage = true;

    try {
      await state.client.rpc('log_public_home_visit', {
        p_visitor_key: browserVisitorId()
      });
    } catch {
      // Public analytics must never block login/registration.
    }
  }

  async function loadMemberHomepageRows() {
    const since = daysAgoStart(30).toISOString();
    const { data, error } = await state.client
      .from('usage_events')
      .select('user_id,username,display_name,created_at,event_type')
      .eq('event_type','portal_home_view')
      .gte('created_at', since)
      .order('created_at', { ascending:false })
      .limit(5000);

    if (error) throw error;
    return data || [];
  }

  async function loadPublicHomepageRows() {
    const since = daysAgoStart(30).toISOString();
    const { data, error } = await state.client
      .from('public_home_visits')
      .select('visitor_key,created_at')
      .gte('created_at', since)
      .order('created_at', { ascending:false })
      .limit(5000);

    if (error) throw error;
    return data || [];
  }

  async function enhanceAnalytics() {
    if (analyticsEnhancing) return;
    if (!isStaffAccount()) return;
    if (state?.view !== 'admin' || state?.adminTab !== 'analytics') return;

    const body = els?.content?.querySelector('#analyticsBody');
    if (!body || body.querySelector('[data-homepage-combined-v198r]')) return;

    analyticsEnhancing = true;

    const section = document.createElement('section');
    section.className = 'analytics-section';
    section.dataset.homepageCombinedV198r = 'true';
    section.innerHTML = `
      <div class="analytics-head">
        <div>
          <h3>🏠 Homepage Activity</h3>
          <p class="admin-note">
            Public/login-page visits and logged-in member Home opens are shown separately.
            Public visitors are anonymous; no IP address is stored by this patch.
          </p>
        </div>
        <button class="btn btn-small btn-ghost" data-home-refresh type="button">Refresh</button>
      </div>

      <div data-home-analytics-body>
        <div class="empty-state" style="height:120px">Loading homepage activity…</div>
      </div>
    `;

    body.prepend(section);

    async function paint() {
      const area = section.querySelector('[data-home-analytics-body]');
      area.innerHTML = '<div class="empty-state" style="height:120px">Loading homepage activity…</div>';

      try {
        const [publicRows, memberRows] = await Promise.all([
          loadPublicHomepageRows(),
          loadMemberHomepageRows()
        ]);

        const todayPublic = countPublicPeriod(publicRows, startOfToday());
        const sevenPublic = countPublicPeriod(publicRows, daysAgoStart(7));
        const thirtyPublic = countPublicPeriod(publicRows, daysAgoStart(30));

        const todayMember = countMemberPeriod(memberRows, startOfToday());
        const sevenMember = countMemberPeriod(memberRows, daysAgoStart(7));
        const thirtyMember = countMemberPeriod(memberRows, daysAgoStart(30));

        area.innerHTML = `
          <h4 style="margin:.2rem 0 .55rem">🌐 Public visitors — not signed in</h4>
          <div class="analytics-stats">
            ${stat(todayPublic.opens, 'Public visits today')}
            ${stat(todayPublic.unique, 'Unique browsers today')}
            ${stat(sevenPublic.opens, 'Public visits — 7 days')}
            ${stat(sevenPublic.unique, 'Unique browsers — 7 days')}
            ${stat(thirtyPublic.opens, 'Public visits — 30 days')}
            ${stat(thirtyPublic.unique, 'Unique browsers — 30 days')}
          </div>

          <p class="admin-note" style="margin-top:.45rem">
            “Unique browser” means one random browser ID. It is not a person identity and it is not an IP address.
            A person using two devices may count as two unique browsers.
          </p>

          <h4 style="margin:1rem 0 .55rem">👤 Logged-in member Home opens</h4>
          <div class="analytics-stats">
            ${stat(todayMember.opens, 'Member opens today')}
            ${stat(todayMember.unique, 'Unique members today')}
            ${stat(sevenMember.opens, 'Member opens — 7 days')}
            ${stat(sevenMember.unique, 'Unique members — 7 days')}
            ${stat(thirtyMember.opens, 'Member opens — 30 days')}
            ${stat(thirtyMember.unique, 'Unique members — 30 days')}
          </div>

          <div class="analytics-table-wrap" style="margin-top:1rem">
            <table class="analytics-table">
              <thead>
                <tr>
                  <th>Date / Time</th>
                  <th>Member</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${memberRows.slice(0,50).map(row => `
                  <tr>
                    <td>${esc(new Date(row.created_at).toLocaleString())}</td>
                    <td>
                      ${esc(row.display_name || row.username || 'Member')}
                      <small>${esc(row.username || '')}</small>
                    </td>
                    <td>🏠 Opened Home</td>
                  </tr>
                `).join('') || '<tr><td colspan="3">No logged-in Homepage opens recorded in the last 30 days.</td></tr>'}
              </tbody>
            </table>
          </div>
        `;
      } catch (err) {
        area.innerHTML = `<div class="health-banner bad">⚠ ${esc(err?.message || 'Could not load homepage activity.')}</div>`;
      }
    }

    section.querySelector('[data-home-refresh]').addEventListener('click', paint);
    await paint();
    analyticsEnhancing = false;
  }

  function scheduleEnhance() {
    clearTimeout(enhanceTimer);
    enhanceTimer = setTimeout(enhanceAnalytics, 80);
  }

  const observer = new MutationObserver(scheduleEnhance);
  observer.observe(document.documentElement, { childList:true, subtree:true });

  // Start anonymous/public visit logging after the app decides whether the visitor is signed in.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', logPublicLoginPageVisit, { once:true });
  } else {
    logPublicLoginPageVisit();
  }

  // Also try when the login view becomes visible after boot/auth checks.
  const loginView = document.getElementById('loginView');
  if (loginView) {
    const loginObserver = new MutationObserver(logPublicLoginPageVisit);
    loginObserver.observe(loginView, { attributes:true, attributeFilter:['class'] });
  }

  scheduleEnhance();

  globalThis.PTP_COMBINED_HOMEPAGE_ANALYTICS = {
    version: VERSION,
    refresh: enhanceAnalytics
  };
})();
