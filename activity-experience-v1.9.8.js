/* Pawn to Professor v1.9.8
   Activity Types + secure How to Play / How to Use guide attachment.
   No new Vercel endpoint is created.
*/
(() => {
  if (typeof state === 'undefined' || typeof render === 'undefined') return;

  const VERSION = '1.9.8';

  function esc(v='') {
    if (typeof escapeHtml === 'function') return escapeHtml(v);
    return String(v).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function normalizedType(type='') {
    const value = String(type || '').trim().toLowerCase();
    if (/interactive\s*lesson/.test(value)) return 'Interactive Lesson';
    if (/practice/.test(value)) return 'Practice Activity';
    return 'Game';
  }

  function typeUi(type='') {
    const normalized = normalizedType(type);
    if (normalized === 'Interactive Lesson') {
      return {
        kind:'🧩 Interactive Lesson',
        launch:'START 🔐',
        guide:'📘 HOW TO USE'
      };
    }
    if (normalized === 'Practice Activity') {
      return {
        kind:'✏️ Practice Activity',
        launch:'PRACTICE 🔐',
        guide:'📘 HOW TO USE'
      };
    }
    return {
      kind:'🎮 Interactive Game',
      launch:'PLAY 🔐',
      guide:'📘 HOW TO PLAY'
    };
  }

  async function guideResources(unitId) {
    if (!unitId) return [];
    const { data, error } = await state.client
      .from('resources')
      .select('id,title,resource_type,allow_download,published,sort_order')
      .eq('unit_id', unitId)
      .eq('published', true)
      .eq('allow_download', true)
      .order('sort_order');
    if (error) throw error;
    return data || [];
  }

  async function fillGuideSelect(panel) {
    const select = panel.querySelector('#activityGuideResource');
    const unitId = panel.querySelector('#activityUnit')?.value;
    if (!select || !unitId) return;

    select.innerHTML = '<option value="">No guide attached</option>';
    try {
      const resources = await guideResources(unitId);
      resources.forEach(resource => {
        const option = document.createElement('option');
        option.value = resource.id;
        option.textContent = `${resource.title} · ${resource.resource_type}`;
        select.appendChild(option);
      });
    } catch (err) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Could not load resources';
      select.appendChild(option);
    }
  }

  function activityGuideModal(activity, resources) {
    document.querySelector('.v198-guide-modal')?.remove();

    const modal = document.createElement('div');
    modal.className = 'v198-guide-modal';
    modal.innerHTML = `
      <section class="v198-guide-card" role="dialog" aria-modal="true">
        <div class="v198-modal-head">
          <div>
            <h2>Activity Type & Guide</h2>
            <p>${esc(activity.title)}</p>
          </div>
          <button class="btn btn-small btn-ghost" data-close type="button">✕</button>
        </div>

        <label>
          Activity type
          <select data-type>
            ${['Game','Interactive Lesson','Practice Activity'].map(type =>
              `<option value="${type}" ${normalizedType(activity.type) === type ? 'selected' : ''}>${type}</option>`
            ).join('')}
          </select>
        </label>

        <label>
          How to Play / How to Use guide
          <select data-guide>
            <option value="">No guide attached</option>
            ${resources.map(r =>
              `<option value="${r.id}" ${activity.guide_resource_id === r.id ? 'selected' : ''}>${esc(r.title)} · ${esc(r.resource_type)}</option>`
            ).join('')}
          </select>
        </label>

        <p class="admin-note">
          Upload the PDF/image/guide first in <strong>Admin → Resources</strong> with Download enabled,
          then attach it here. The member gets a secure Download button.
        </p>

        <div class="button-row">
          <button class="btn btn-ghost" data-close type="button">Cancel</button>
          <button class="btn btn-accent" data-save type="button">Save Type & Guide</button>
        </div>
      </section>
    `;

    modal.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', () => modal.remove()));

    modal.querySelector('[data-save]').addEventListener('click', async e => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = 'Saving…';

      const patch = {
        type: modal.querySelector('[data-type]').value,
        guide_resource_id: modal.querySelector('[data-guide]').value || null
      };

      const { error } = await state.client.from('activities').update(patch).eq('id', activity.id);
      if (error) {
        toast(error.message);
        btn.disabled = false;
        btn.textContent = 'Save Type & Guide';
        return;
      }

      try {
        await logAudit('activity_type_guide_updated','activity',activity.id,{
          type:patch.type,
          guide_resource_id:patch.guide_resource_id
        });
      } catch {}

      modal.remove();
      toast('Activity type and guide saved.');
      const panel = document.querySelector('#adminPanel');
      if (panel && state.adminTab === 'content') loadManagedActivities(panel);
    });

    document.body.appendChild(modal);
  }

  // -----------------------------------------------------------------------
  // Admin Activities: improve Type + guide selection.
  // -----------------------------------------------------------------------
  if (typeof loadManagedActivities === 'function') {
    const nativeLoadManagedActivitiesV198 = loadManagedActivities;

    loadManagedActivities = async function(panel) {
      const result = await nativeLoadManagedActivitiesV198(panel);

      const unitId = panel.querySelector('#activityUnit')?.value;
      const list = panel.querySelector('#activityManageList');
      if (!unitId || !list) return result;

      const [{data:activities}, resources] = await Promise.all([
        state.client
          .from('activities')
          .select('id,unit_id,title,type,guide_resource_id,published,sort_order')
          .eq('unit_id',unitId)
          .order('sort_order'),
        guideResources(unitId).catch(() => [])
      ]);

      const remaining = [...(activities || [])];

      list.querySelectorAll('.manage-card').forEach(card => {
        const title = card.querySelector('strong')?.textContent?.trim() || '';
        const index = remaining.findIndex(a => a.title === title);
        if (index < 0) return;

        const activity = remaining.splice(index,1)[0];
        const actions = card.querySelector('.actions');
        if (!actions || actions.querySelector('[data-v198-guide]')) return;

        const guide = resources.find(r => r.id === activity.guide_resource_id);
        const meta = card.querySelector('.meta');
        if (meta && guide) meta.textContent += ` · 📘 ${guide.title}`;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-small btn-ghost';
        button.dataset.v198Guide = 'true';
        button.textContent = '📘 Type / Guide';
        button.addEventListener('click', () => activityGuideModal(activity, resources));

        actions.insertBefore(button, actions.firstChild);
      });

      return result;
    };
  }

  if (typeof renderAdminContent === 'function') {
    const nativeRenderAdminContentV198 = renderAdminContent;

    renderAdminContent = function(panel) {
      nativeRenderAdminContentV198(panel);

      const typeSelect = panel.querySelector('#activityType');
      if (typeSelect) {
        [...typeSelect.options].forEach(option => {
          if (option.value === 'Worksheet' || option.value === 'Quiz' || option.value === 'External Link') {
            option.remove();
          }
        });

        if (![...typeSelect.options].some(o => o.value === 'Practice Activity')) {
          const option = document.createElement('option');
          option.value = 'Practice Activity';
          option.textContent = 'Practice Activity';
          typeSelect.appendChild(option);
        }
      }

      const unitSelect = panel.querySelector('#activityUnit');
      const titleLabel = panel.querySelector('#activityTitle')?.closest('label');

      if (unitSelect && titleLabel && !panel.querySelector('#activityGuideResource')) {
        const label = document.createElement('label');
        label.className = 'wide';
        label.innerHTML = `
          How to Play / How to Use guide
          <select id="activityGuideResource">
            <option value="">No guide attached</option>
          </select>
          <span class="field-help">Upload the guide first in Resources with Download enabled.</span>
        `;
        titleLabel.parentNode.insertBefore(label, titleLabel);
        fillGuideSelect(panel);

        unitSelect.addEventListener('change', () => {
          setTimeout(() => fillGuideSelect(panel), 0);
        });
      }

      // Replace the original Add listener so guide_resource_id is saved at creation.
      const oldButton = panel.querySelector('#addActivity');
      if (oldButton) {
        const button = oldButton.cloneNode(true);
        oldButton.replaceWith(button);

        button.addEventListener('click', async () => {
          const unitSel = panel.querySelector('#activityUnit');
          const title = panel.querySelector('#activityTitle').value.trim();
          const targetUrl = panel.querySelector('#activityUrl').value.trim();

          const row = {
            unit_id: unitSel.value,
            title,
            type: panel.querySelector('#activityType').value,
            guide_resource_id: panel.querySelector('#activityGuideResource')?.value || null,
            launch_url:null,
            published:true,
            sort_order:10
          };

          if (!row.unit_id || !row.title || !targetUrl) {
            return toast('Choose a Unit and add a title and real activity URL.');
          }

          try { new URL(targetUrl); }
          catch { return toast('The activity URL is not valid.'); }

          const { data, error } = await state.client
            .from('activities')
            .insert(row)
            .select()
            .single();

          if (error) return toast(error.message);

          const target = {
            activity_id:data.id,
            target_url:targetUrl,
            security_mode:panel.querySelector('#activitySecurity').value,
            launch_ttl_seconds:Number(panel.querySelector('#activityTtl').value),
            gate_installed:panel.querySelector('#activityGate').value === 'true',
            security_notes:panel.querySelector('#activitySecurityNote').value.trim() || null,
            enabled:true
          };

          const { error:targetError } = await state.client.from('activity_targets').insert(target);
          if (targetError) {
            await state.client.from('activities').delete().eq('id',data.id);
            return toast(targetError.message);
          }

          await logAudit('secure_activity_created','activity',data.id,{
            title:row.title,
            unit_id:row.unit_id,
            type:row.type,
            guide_resource_id:row.guide_resource_id,
            security_mode:target.security_mode
          });

          const shouldNotify = panel.querySelector('#activityNotify')?.checked;
          toast('Secure activity published.');
          panel.querySelector('#activityTitle').value='';
          panel.querySelector('#activityUrl').value='';
          if (panel.querySelector('#activityGuideResource')) panel.querySelector('#activityGuideResource').value='';
          loadManagedActivities(panel);
          if (shouldNotify) notifyContent('activity', data.id);
        });
      }
    };
  }

  // -----------------------------------------------------------------------
  // Member Unit page: correct labels + secure guide download.
  // -----------------------------------------------------------------------
  if (typeof renderActivities === 'function') {
    const nativeRenderActivitiesV198 = renderActivities;

    renderActivities = async function(...args) {
      const result = await nativeRenderActivitiesV198(...args);
      if (state.view !== 'activities' || !state.unit?.id) return result;

      const { data: activities, error } = await state.client
        .from('activities')
        .select('id,unit_id,title,type,guide_resource_id,published,sort_order')
        .eq('unit_id',state.unit.id)
        .eq('published',true)
        .order('sort_order');

      if (error) return result;

      const remaining = [...(activities || [])];
      const practiceCards = [];

      els.content.querySelectorAll('.activity-card').forEach(card => {
        const title = card.querySelector('h3')?.textContent?.trim() || '';
        const index = remaining.findIndex(a => a.title === title);
        if (index < 0) return;

        const activity = remaining.splice(index,1)[0];
        const ui = typeUi(activity.type);

        const kind = card.querySelector('.unit-resource-kind');
        if (kind) kind.textContent = ui.kind;

        const paragraph = card.querySelector('p');
        if (paragraph) paragraph.textContent = `${normalizedType(activity.type)} · Secure launch`;

        const primary = [...card.querySelectorAll('button')].find(btn => !/Discuss/i.test(btn.textContent || ''));
        if (primary) primary.textContent = ui.launch;

        if (activity.guide_resource_id && !card.querySelector('[data-v198-member-guide]')) {
          const guideButton = document.createElement('button');
          guideButton.type = 'button';
          guideButton.className = 'btn btn-small btn-ghost';
          guideButton.dataset.v198MemberGuide = 'true';
          guideButton.textContent = ui.guide;
          guideButton.addEventListener('click', () => openResourceSecure(activity.guide_resource_id,'download'));

          const discuss = [...card.querySelectorAll('button')].find(btn => /Discuss/i.test(btn.textContent || ''));
          if (discuss) card.insertBefore(guideButton, discuss);
          else card.appendChild(guideButton);
        }

        if (normalizedType(activity.type) === 'Practice Activity') {
          practiceCards.push(card);
        }
      });

      // Move Practice Activities out of the Game section into their own section.
      if (practiceCards.length) {
        let section = els.content.querySelector('[data-v198-practice-section]');
        if (!section) {
          section = document.createElement('section');
          section.className = 'unit-material-section';
          section.dataset.v198PracticeSection = 'true';
          section.innerHTML = `
            <h2 class="section-heading">✏️ Practice Activity</h2>
            <div class="activity-list"></div>
          `;

          const gameHeading = [...els.content.querySelectorAll('.section-heading')]
            .find(h => /Interactive Game/i.test(h.textContent || ''));
          const gameSection = gameHeading?.closest('.unit-material-section');
          if (gameSection?.nextSibling) els.content.insertBefore(section, gameSection.nextSibling);
          else els.content.appendChild(section);
        }

        const list = section.querySelector('.activity-list');
        practiceCards.forEach(card => list.appendChild(card));
      }

      return result;
    };
  }

  globalThis.PTP_ACTIVITY_GUIDES = { version:VERSION };
})();
