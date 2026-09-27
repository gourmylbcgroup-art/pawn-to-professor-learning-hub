/* Pawn to Professor v1.9.3 — Community Audience Controls
   ------------------------------------------------------------
   Category visibility:
     Everyone
     Teachers only
     Learners only
     Admin / Owner only

   Individual discussion visibility:
     Inherit category
     Everyone
     Teachers only
     Learners only
     Admin / Owner only

   Supabase RLS is the real security layer. This file supplies the Admin UI.
*/
(() => {
  if (typeof state === 'undefined') return;

  const LABELS = {
    all: 'Everyone',
    teachers: 'Teachers only',
    learners: 'Learners only',
    staff: 'Admin / Owner only',
    inherit: 'Inherit category'
  };

  function esc(v='') {
    if (typeof escapeHtml === 'function') return escapeHtml(v);
    return String(v).replace(/[&<>'"]/g, ch => ({
      '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
    }[ch]));
  }

  function audienceOptions(selected, includeInherit=false) {
    const values = includeInherit
      ? ['inherit','all','teachers','learners','staff']
      : ['all','teachers','learners','staff'];

    return values.map(value =>
      `<option value="${value}" ${value===selected?'selected':''}>${LABELS[value]}</option>`
    ).join('');
  }

  // ------------------------------------------------------------------
  // Admin → Community: category-level audience
  // ------------------------------------------------------------------
  if (typeof renderAdminCommunity === 'function') {
    renderAdminCommunity = async function(panel) {
      panel.innerHTML = `
        <h2>Community Management</h2>
        <p class="admin-note">
          Control who can see each Community section. You can also restrict an
          individual discussion inside an otherwise shared category.
        </p>

        <div class="admin-form-grid">
          <label>Name
            <input id="newCommunityName" placeholder="Learner Help">
          </label>

          <label>Icon
            <input id="newCommunityIcon" value="💬">
          </label>

          <label class="wide">Description
            <input id="newCommunityDescription" placeholder="Optional description">
          </label>

          <label>Who can see this category?
            <select id="newCommunityAudience">
              ${audienceOptions('all')}
            </select>
          </label>

          <label>Who can start topics?
            <select id="newCommunityStaff">
              <option value="false">Visible members</option>
              <option value="true">Admin / Owner only</option>
            </select>
          </label>

          <div class="wide">
            <button id="addCommunityCategory" class="btn btn-accent">+ Category</button>
          </div>
        </div>

        <hr class="soft">
        <div id="communityCategoryAdmin" class="manage-list">Loading…</div>
      `;

      panel.querySelector('#addCommunityCategory').addEventListener('click', async () => {
        const name = panel.querySelector('#newCommunityName').value.trim();
        if (!name) return toast('Add a category name.');

        const slug = name.toLowerCase()
          .replace(/[^a-z0-9]+/g,'-')
          .replace(/^-|-$/g,'');

        const row = {
          name,
          slug: slug || `category-${Date.now()}`,
          icon: panel.querySelector('#newCommunityIcon').value.trim() || '💬',
          description: panel.querySelector('#newCommunityDescription').value.trim() || null,
          audience: panel.querySelector('#newCommunityAudience').value,
          staff_only_post: panel.querySelector('#newCommunityStaff').value === 'true',
          enabled: true,
          sort_order: 100
        };

        const { error } = await state.client.from('forum_categories').insert(row);
        if (error) return toast(error.message);

        await logAudit('forum_category_created','forum_category',null,{
          name,
          audience: row.audience
        });
        toast('Community category created.');
        renderAdminCommunity(panel);
      });

      const { data, error } = await state.client
        .from('forum_categories')
        .select('*')
        .order('sort_order');

      if (state.adminTab !== 'communityAdmin') return;

      const list = panel.querySelector('#communityCategoryAdmin');
      if (error) {
        list.textContent = error.message;
        return;
      }

      list.innerHTML = '';

      (data || []).forEach(cat => {
        const audience = cat.audience || 'all';
        const card = document.createElement('div');
        card.className = 'manage-card';
        card.innerHTML = `
          <div>
            <strong>${esc(cat.icon)} ${esc(cat.name)}</strong>
            <div class="meta">
              ${cat.enabled ? 'Enabled' : 'Disabled'}
              · ${esc(LABELS[audience] || audience)}
              · ${cat.staff_only_post ? 'Admin posts only' : 'Visible members can post'}
            </div>
          </div>
          <div class="actions">
            <select data-audience style="width:auto;margin:0;padding:.35em .5em">
              ${audienceOptions(audience)}
            </select>
            <button class="btn btn-small btn-ghost" data-enabled>
              ${cat.enabled ? 'Disable' : 'Enable'}
            </button>
            <button class="btn btn-small btn-ghost" data-staff>
              ${cat.staff_only_post ? 'Allow Visible Members' : 'Admin Posts Only'}
            </button>
          </div>
        `;

        card.querySelector('[data-audience]').addEventListener('change', async e => {
          const next = e.target.value;
          const { error:updateError } = await state.client
            .from('forum_categories')
            .update({ audience:next, updated_at:new Date().toISOString() })
            .eq('id',cat.id);

          if (updateError) return toast(updateError.message);

          await logAudit('forum_category_audience_changed','forum_category',cat.id,{
            from: audience,
            to: next
          });
          toast(`Category visibility: ${LABELS[next]}.`);
          renderAdminCommunity(panel);
        });

        card.querySelector('[data-enabled]').addEventListener('click', async () => {
          const { error:updateError } = await state.client
            .from('forum_categories')
            .update({ enabled:!cat.enabled, updated_at:new Date().toISOString() })
            .eq('id',cat.id);

          if (updateError) return toast(updateError.message);
          renderAdminCommunity(panel);
        });

        card.querySelector('[data-staff]').addEventListener('click', async () => {
          const { error:updateError } = await state.client
            .from('forum_categories')
            .update({
              staff_only_post:!cat.staff_only_post,
              updated_at:new Date().toISOString()
            })
            .eq('id',cat.id);

          if (updateError) return toast(updateError.message);
          renderAdminCommunity(panel);
        });

        list.appendChild(card);
      });

      if (!(data || []).length) {
        list.innerHTML = '<p class="admin-note">No Community categories yet.</p>';
      }
    };
  }

  // ------------------------------------------------------------------
  // Community category: per-discussion audience for staff
  // ------------------------------------------------------------------
  if (typeof renderCommunityCategory === 'function') {
    const nativeRenderCommunityCategoryV193 = renderCommunityCategory;

    renderCommunityCategory = async function(...args) {
      await nativeRenderCommunityCategoryV193(...args);

      if (state.view !== 'communityCategory' || !isStaff() || !state.communityCategory) return;

      const pageSize = 20;
      const from = state.communityTopicPage * pageSize;

      const { data, error } = await state.client
        .from('forum_topics')
        .select('id,audience')
        .eq('category_id',state.communityCategory.id)
        .is('deleted_at',null)
        .order('pinned',{ascending:false})
        .order('created_at',{ascending:false})
        .range(from,from+pageSize-1);

      if (error || state.view !== 'communityCategory') return;

      const cards = [...els.content.querySelectorAll('.community-topic')];

      cards.forEach((card,index) => {
        const topic = data?.[index];
        if (!topic) return;

        const actions = card.querySelector('.actions');
        if (!actions || actions.querySelector('[data-topic-audience]')) return;

        const select = document.createElement('select');
        select.dataset.topicAudience = topic.id;
        select.style.width = 'auto';
        select.style.margin = '0';
        select.style.padding = '.35em .5em';
        select.innerHTML = audienceOptions(topic.audience || 'inherit', true);
        select.title = 'Who can see this discussion?';

        select.addEventListener('change', async () => {
          const next = select.value;
          select.disabled = true;

          const { error:updateError } = await state.client
            .from('forum_topics')
            .update({ audience:next, updated_at:new Date().toISOString() })
            .eq('id',topic.id);

          select.disabled = false;

          if (updateError) return toast(updateError.message);

          await logAudit('forum_topic_audience_changed','forum_topic',topic.id,{
            audience: next
          });
          toast(`Discussion visibility: ${LABELS[next]}.`);
        });

        actions.insertBefore(select, actions.firstChild);
      });
    };
  }

  globalThis.PTP_COMMUNITY_AUDIENCE_VERSION = '1.9.3';
})();
