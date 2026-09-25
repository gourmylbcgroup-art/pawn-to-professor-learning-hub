/* Pawn to Professor v1.6.8 — Admin-only detailed analytics */
(() => {
  const analyticsState = {
    period: '30',
    type: 'all',
    userId: 'all',
    yearId: 'all',
    gradeId: 'all'
  };

  const EVENT_LABELS = {
    portal_home_view: '🏠 Opened Home',
    year_view: '📚 Opened Year',
    grade_view: '🎒 Opened Grade',
    unit_view: '⭐ Opened Unit',
    game_play: '🎮 Played',
    resource_view: '👁 Viewed',
    resource_download: '⬇️ Downloaded',
    tools_view: '🧰 Opened Tools',
    tool_open: '🧰 Opened Tool',
    community_view: '💬 Opened Community',
    community_category_view: '💬 Opened Category',
    forum_topic_view: '💬 Opened Topic'
  };

  function fireUsage(params = {}) {
    if (!state?.client || !state?.session?.user) return;
    const payload = {
      p_event_type: params.eventType,
      p_school_year_id: params.yearId || null,
      p_grade_id: params.gradeId || null,
      p_unit_id: params.unitId || null,
      p_activity_id: params.activityId || null,
      p_resource_id: params.resourceId || null,
      p_tool_id: params.toolId || null,
      p_page_name: params.pageName || null
    };
    void state.client.rpc('log_usage_event', payload).then(() => {}).catch(() => {});
  }

  // Expose one helper for future portal components.
  globalThis.ptpTrackUsage = fireUsage;

  // -----------------------------------------------------------------------
  // Page visits
  // -----------------------------------------------------------------------
  const nativeRenderYears = renderYears;
  renderYears = function (...args) {
    const result = nativeRenderYears.apply(this, args);
    fireUsage({ eventType: 'portal_home_view' });
    return result;
  };

  const nativeRenderGrades = renderGrades;
  renderGrades = function (...args) {
    const result = nativeRenderGrades.apply(this, args);
    fireUsage({ eventType: 'year_view', yearId: state.year?.id });
    return result;
  };

  const nativeRenderUnits = renderUnits;
  renderUnits = function (...args) {
    const result = nativeRenderUnits.apply(this, args);
    fireUsage({ eventType: 'grade_view', gradeId: state.grade?.id });
    return result;
  };

  const nativeRenderActivities = renderActivities;
  renderActivities = async function (...args) {
    const result = await nativeRenderActivities.apply(this, args);
    fireUsage({ eventType: 'unit_view', unitId: state.unit?.id });
    return result;
  };

  const nativeRenderTools = renderTools;
  renderTools = function (...args) {
    const result = nativeRenderTools.apply(this, args);
    fireUsage({ eventType: 'tools_view' });
    return result;
  };

  const nativeRenderCommunity = renderCommunity;
  renderCommunity = async function (...args) {
    const result = await nativeRenderCommunity.apply(this, args);
    fireUsage({ eventType: 'community_view' });
    return result;
  };

  const nativeRenderCommunityCategory = renderCommunityCategory;
  renderCommunityCategory = async function (...args) {
    const categoryName = state.communityCategory?.name || '';
    const result = await nativeRenderCommunityCategory.apply(this, args);
    if (categoryName) fireUsage({ eventType: 'community_category_view', pageName: categoryName });
    return result;
  };

  const nativeRenderCommunityTopic = renderCommunityTopic;
  renderCommunityTopic = async function (...args) {
    const topicName = state.communityTopic?.title || '';
    const result = await nativeRenderCommunityTopic.apply(this, args);
    if (topicName) fireUsage({ eventType: 'forum_topic_view', pageName: topicName });
    return result;
  };

  // -----------------------------------------------------------------------
  // Resource use — count only after secure access resolution succeeds.
  // -----------------------------------------------------------------------
  openResourceSecure = async function (resourceId, mode = 'view') {
    const popup = window.open('about:blank', '_blank');
    if (popup) popup.document.write('<p style="font-family:system-ui;padding:2rem">Checking access…</p>');

    try {
      const headers = await authHeaders();
      const res = await fetch('/api/resource/resolve', {
        method: 'POST',
        headers,
        cache: 'no-store',
        body: JSON.stringify({
          resourceId,
          mode,
          deviceId: getOrCreateDeviceId()
        })
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Resource access was denied.');

      fireUsage({
        eventType: mode === 'download' ? 'resource_download' : 'resource_view',
        resourceId
      });

      if (popup) popup.location.replace(body.url);
      else window.location.assign(body.url);
    } catch (err) {
      if (popup) popup.close();
      toast(err.message || 'Could not open resource.');
    }
  };

  // -----------------------------------------------------------------------
  // External Teacher Tool use.
  // -----------------------------------------------------------------------
  const nativeWindowOpen = window.open.bind(window);
  window.open = function (url, target, features) {
    try {
      const value = String(url || '');
      if (!value.startsWith('/play.html?activity=')) {
        const tool = (state.tools || []).find(t => t.url === value);
        if (tool) fireUsage({ eventType: 'tool_open', toolId: tool.id });
      }
    } catch { /* analytics never blocks navigation */ }

    return nativeWindowOpen(url, target, features);
  };

  // -----------------------------------------------------------------------
  // Admin Analytics tab
  // -----------------------------------------------------------------------
  const nativeRenderAdmin = renderAdmin;
  renderAdmin = function (...args) {
    const result = nativeRenderAdmin.apply(this, args);
    if (!isStaff()) return result;

    const tabs = els.content.querySelector('.admin-tabs');
    const panel = els.content.querySelector('#adminPanel');
    if (!tabs || !panel) return result;

    const analyticsBtn = document.createElement('button');
    analyticsBtn.className = `btn btn-ghost ${state.adminTab === 'analytics' ? 'active' : ''}`;
    analyticsBtn.dataset.analyticsTab = 'true';
    analyticsBtn.textContent = '📈 Usage Analytics';

    const dashboardBtn = tabs.querySelector('[data-tab="dashboard"]');
    if (dashboardBtn?.nextSibling) tabs.insertBefore(analyticsBtn, dashboardBtn.nextSibling);
    else tabs.prepend(analyticsBtn);

    analyticsBtn.addEventListener('click', () => {
      state.adminTab = 'analytics';
      render();
    });

    if (state.adminTab === 'analytics') {
      renderUsageAnalytics(panel);
    }

    return result;
  };

  function periodStart() {
    if (analyticsState.period === 'all') return null;
    const days = Number(analyticsState.period);
    if (!Number.isFinite(days)) return null;

    const now = new Date();
    if (days === 0) {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return start.toISOString();
    }

    return new Date(Date.now() - days * 86400000).toISOString();
  }

  function eventTypeMatchesFilter(eventType) {
    if (analyticsState.type === 'all') return true;
    if (analyticsState.type === 'games') return eventType === 'game_play';
    if (analyticsState.type === 'downloads') return eventType === 'resource_download';
    if (analyticsState.type === 'resources') return ['resource_view', 'resource_download'].includes(eventType);
    if (analyticsState.type === 'pages') return [
      'portal_home_view','year_view','grade_view','unit_view','tools_view',
      'community_view','community_category_view','forum_topic_view'
    ].includes(eventType);
    if (analyticsState.type === 'tools') return eventType === 'tool_open';
    return true;
  }

  async function fetchAllUsageEvents() {
    const rows = [];
    const pageSize = 1000;
    let from = 0;

    while (from < 20000) {
      let query = state.client
        .from('usage_events')
        .select('*')
        .order('created_at', { ascending: false });

      const start = periodStart();
      if (start) query = query.gte('created_at', start);
      if (analyticsState.userId !== 'all') query = query.eq('user_id', analyticsState.userId);
      if (analyticsState.yearId !== 'all') query = query.eq('school_year_id', analyticsState.yearId);
      if (analyticsState.gradeId !== 'all') query = query.eq('grade_id', analyticsState.gradeId);

      const { data, error } = await query.range(from, from + pageSize - 1);
      if (error) throw error;

      const batch = data || [];
      rows.push(...batch);
      if (batch.length < pageSize) break;
      from += pageSize;
    }

    return rows.filter(row => eventTypeMatchesFilter(row.event_type));
  }

  function eventLabel(type) {
    return EVENT_LABELS[type] || type.replaceAll('_', ' ');
  }

  function displayUser(row) {
    return row.display_name || row.username || 'Member';
  }

  function groupMostUsed(rows) {
    const map = new Map();

    rows
      .filter(row => ['game_play', 'resource_view', 'resource_download', 'tool_open'].includes(row.event_type))
      .forEach(row => {
        const entityId = row.activity_id || row.resource_id || row.tool_id || row.content_title;
        const key = `${row.event_type}:${entityId}`;
        if (!map.has(key)) {
          map.set(key, {
            eventType: row.event_type,
            title: row.content_title,
            path: row.path_text || '',
            count: 0,
            users: new Set()
          });
        }
        const item = map.get(key);
        item.count += 1;
        item.users.add(row.user_id);
      });

    return [...map.values()]
      .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
      .slice(0, 20);
  }

  async function findUnused(rows) {
    const [{ data: activities }, { data: resources }] = await Promise.all([
      state.client
        .from('activities')
        .select('id,title,unit_id,published')
        .eq('published', true)
        .order('title'),
      state.client
        .from('resources')
        .select('id,title,unit_id,published')
        .eq('published', true)
        .order('title')
    ]);

    const usedActivities = new Set(rows.filter(r => r.event_type === 'game_play').map(r => r.activity_id));
    const usedResources = new Set(rows.filter(r => ['resource_view','resource_download'].includes(r.event_type)).map(r => r.resource_id));

    const items = [];

    (activities || []).forEach(a => {
      if (!usedActivities.has(a.id)) {
        items.push({
          kind: '🎮 Game',
          title: a.title,
          path: unitPath(a.unit_id)
        });
      }
    });

    (resources || []).forEach(r => {
      if (!usedResources.has(r.id)) {
        items.push({
          kind: '📄 Resource',
          title: r.title,
          path: unitPath(r.unit_id)
        });
      }
    });

    return items.slice(0, 40);
  }

  function statCard(value, label) {
    return `<div class="analytics-stat"><strong>${Number(value || 0).toLocaleString()}</strong><span>${escapeHtml(label)}</span></div>`;
  }

  function selectOption(value, label, selected) {
    return `<option value="${escapeHtml(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  }

  async function renderUsageAnalytics(panel) {
    panel.innerHTML = `
      <div class="analytics-head">
        <div>
          <h2>📈 Usage Analytics</h2>
          <p class="admin-note">Admin/Owner only. See exactly which game, file, Unit, page or tool was used, by whom and when.</p>
        </div>
        <button id="analyticsRefresh" class="btn btn-ghost btn-small">Refresh</button>
      </div>

      <div class="analytics-filters">
        <label>Period
          <select id="analyticsPeriod">
            ${selectOption('0','Today',analyticsState.period)}
            ${selectOption('7','Last 7 days',analyticsState.period)}
            ${selectOption('30','Last 30 days',analyticsState.period)}
            ${selectOption('all','All time',analyticsState.period)}
          </select>
        </label>

        <label>Type
          <select id="analyticsType">
            ${selectOption('all','All activity',analyticsState.type)}
            ${selectOption('games','Games played',analyticsState.type)}
            ${selectOption('downloads','Downloads',analyticsState.type)}
            ${selectOption('resources','Resource views + downloads',analyticsState.type)}
            ${selectOption('pages','Page visits',analyticsState.type)}
            ${selectOption('tools','Teacher tools',analyticsState.type)}
          </select>
        </label>

        <label>User
          <select id="analyticsUser">
            ${selectOption('all','All users',analyticsState.userId)}
            ${(state.adminUsers || []).map(u => selectOption(u.id, u.display_name || u.username, analyticsState.userId)).join('')}
          </select>
        </label>

        <label>Year
          <select id="analyticsYear">
            ${selectOption('all','All years',analyticsState.yearId)}
            ${(state.years || []).map(y => selectOption(y.id, y.name, analyticsState.yearId)).join('')}
          </select>
        </label>

        <label>Grade
          <select id="analyticsGrade">
            ${selectOption('all','All grades',analyticsState.gradeId)}
            ${(state.grades || [])
              .filter(g => analyticsState.yearId === 'all' || g.school_year_id === analyticsState.yearId)
              .map(g => {
                const y = state.years.find(x => x.id === g.school_year_id);
                return selectOption(g.id, `${y?.name || ''} / ${g.name}`, analyticsState.gradeId);
              }).join('')}
          </select>
        </label>
      </div>

      <div id="analyticsBody"><div class="empty-state" style="height:180px">Loading analytics…</div></div>
    `;

    const rerender = () => renderUsageAnalytics(panel);

    panel.querySelector('#analyticsRefresh').addEventListener('click', rerender);
    panel.querySelector('#analyticsPeriod').addEventListener('change', e => { analyticsState.period = e.target.value; rerender(); });
    panel.querySelector('#analyticsType').addEventListener('change', e => { analyticsState.type = e.target.value; rerender(); });
    panel.querySelector('#analyticsUser').addEventListener('change', e => { analyticsState.userId = e.target.value; rerender(); });
    panel.querySelector('#analyticsYear').addEventListener('change', e => {
      analyticsState.yearId = e.target.value;
      analyticsState.gradeId = 'all';
      rerender();
    });
    panel.querySelector('#analyticsGrade').addEventListener('change', e => { analyticsState.gradeId = e.target.value; rerender(); });

    const body = panel.querySelector('#analyticsBody');

    try {
      const rows = await fetchAllUsageEvents();
      if (state.adminTab !== 'analytics') return;

      const uniqueUsers = new Set(rows.map(r => r.user_id)).size;
      const games = rows.filter(r => r.event_type === 'game_play').length;
      const downloads = rows.filter(r => r.event_type === 'resource_download').length;
      const views = rows.filter(r => r.event_type === 'resource_view').length;
      const pageVisits = rows.filter(r => [
        'portal_home_view','year_view','grade_view','unit_view','tools_view',
        'community_view','community_category_view','forum_topic_view'
      ].includes(r.event_type)).length;

      const mostUsed = groupMostUsed(rows);
      const unused = await findUnused(rows);

      body.innerHTML = `
        <div class="analytics-stats">
          ${statCard(uniqueUsers, 'Active users')}
          ${statCard(games, 'Game plays')}
          ${statCard(views, 'File views')}
          ${statCard(downloads, 'Downloads')}
          ${statCard(pageVisits, 'Page visits')}
          ${statCard(rows.length, 'Recorded uses')}
        </div>

        <section class="analytics-section">
          <h3>Most Used</h3>
          <p class="admin-note">Shows the exact content name, usage count and number of unique users.</p>
          <div class="analytics-ranked">
            ${mostUsed.length ? mostUsed.map((item, index) => `
              <div class="analytics-ranked-row">
                <span class="analytics-rank">${index + 1}</span>
                <div class="analytics-main">
                  <strong>${escapeHtml(eventLabel(item.eventType))} — ${escapeHtml(item.title)}</strong>
                  <span>${escapeHtml(item.path || 'Portal')}</span>
                </div>
                <div class="analytics-count">
                  <strong>${item.count}</strong>
                  <span>${item.users.size} user${item.users.size === 1 ? '' : 's'}</span>
                </div>
              </div>
            `).join('') : '<p class="admin-note">No matching usage yet.</p>'}
          </div>
        </section>

        <section class="analytics-section">
          <h3>Detailed Activity History</h3>
          <p class="admin-note">Exact user + exact content + exact location + exact date/time.</p>
          <div class="analytics-table-wrap">
            <table class="analytics-table">
              <thead>
                <tr>
                  <th>Date / Time</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Exact content used</th>
                  <th>Location</th>
                </tr>
              </thead>
              <tbody>
                ${rows.slice(0, 250).map(row => `
                  <tr>
                    <td>${escapeHtml(new Date(row.created_at).toLocaleString())}</td>
                    <td>${escapeHtml(displayUser(row))}<small>${escapeHtml(row.username || '')}</small></td>
                    <td>${escapeHtml(eventLabel(row.event_type))}</td>
                    <td><strong>${escapeHtml(row.content_title || '—')}</strong></td>
                    <td>${escapeHtml(row.path_text || row.page_name || 'Portal')}</td>
                  </tr>
                `).join('') || '<tr><td colspan="5">No matching activity yet.</td></tr>'}
              </tbody>
            </table>
          </div>
          ${rows.length > 250 ? `<p class="admin-note">Showing the newest 250 history rows. Summary totals above use all ${rows.length.toLocaleString()} matching rows loaded.</p>` : ''}
        </section>

        <section class="analytics-section">
          <h3>Unused in Selected Period</h3>
          <p class="admin-note">Published games/resources that have no recorded use under the current period/user/year/grade filters.</p>
          <div class="analytics-unused">
            ${unused.length ? unused.map(item => `
              <div class="analytics-unused-row">
                <strong>${escapeHtml(item.kind)} — ${escapeHtml(item.title)}</strong>
                <span>${escapeHtml(item.path || 'Portal')}</span>
              </div>
            `).join('') : '<p class="admin-note">Everything matching this content set has recorded usage.</p>'}
          </div>
        </section>
      `;
    } catch (error) {
      body.innerHTML = `<div class="health-banner bad">⚠ ${escapeHtml(error.message || 'Could not load analytics.')}</div>`;
    }
  }
})();
