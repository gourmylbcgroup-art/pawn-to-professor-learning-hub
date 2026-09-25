/* Pawn to Professor v1.7.0
   Dual Library:
   - Browse by Curriculum
   - Browse by Topic
   - Simple Unit dashboard: Objective / Target Language / Vocabulary / existing resources
   Existing secure activity links and game code are untouched.
*/
(() => {
  if (typeof state === 'undefined' || typeof render === 'undefined') return;

  const libraryState = {
    selectedTopic: null,
    topicPackages: [],
    topics: [],
    loadedTopics: false
  };

  state.librarySource = 'home';

  const nativeRender = render;
  const nativeRenderYears = renderYears;
  const nativeRenderActivities = renderActivities;
  const nativeRenderAdminResources = renderAdminResources;

  function track(params) {
    try { globalThis.ptpTrackUsage?.(params); } catch {}
  }

  function packageUnit(pkg) {
    return state.units.find(u => u.id === pkg?.primary_unit_id) || null;
  }

  function packagePath(pkg) {
    const unit = packageUnit(pkg);
    const grade = state.grades.find(g => g.id === unit?.grade_id);
    const year = state.years.find(y => y.id === grade?.school_year_id);
    return {
      unit,
      grade,
      year,
      label: [year?.name, grade?.name, unit?.name].filter(Boolean).join(' / ')
    };
  }

  function arrayLines(items) {
    const values = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!values.length) return '<p class="unit-empty-copy">Not specified in the curriculum.</p>';
    return `<ul>${values.map(v => `<li>${escapeHtml(v)}</li>`).join('')}</ul>`;
  }

  function vocabCloud(items) {
    const values = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!values.length) return '<p class="unit-empty-copy">No separate vocabulary list is specified in the curriculum.</p>';
    return `<div class="vocab-cloud">${values.map(v => `<span>${escapeHtml(v)}</span>`).join('')}</div>`;
  }

  function makeHomeTile({ icon, title, subtitle, onClick }) {
    return makeTile({ icon, title, subtitle, onClick });
  }

  async function ensureTopics() {
    if (libraryState.loadedTopics) return;
    const { data, error } = await state.client
      .from('content_topics')
      .select('id,name,slug,icon,description,sort_order,published')
      .eq('published', true)
      .order('sort_order');
    if (error) throw error;
    libraryState.topics = data || [];
    libraryState.loadedTopics = true;
  }

  async function loadPackagesForTopic(topicId) {
    const { data, error } = await state.client
      .from('teaching_packages')
      .select('id,primary_unit_id,topic_id,title,subtopic,curriculum_objective,target_language,vocabulary,level_label,cefr,age_band,skills,source_label,published')
      .eq('topic_id', topicId)
      .eq('published', true)
      .order('title');
    if (error) throw error;
    libraryState.topicPackages = data || [];
  }

  function renderLibraryHome() {
    setHeader(`Welcome, ${state.profile.display_name || state.profile.username || 'Teacher'}`, []);
    const grid = document.createElement('div');
    grid.className = 'tile-grid library-home-grid';

    grid.appendChild(makeHomeTile({
      icon:'📚',
      title:'Browse by Curriculum',
      subtitle:'Year → Grade → Unit',
      onClick:()=>{
        state.librarySource='curriculum';
        state.view='curriculumYears';
        render();
      }
    }));

    grid.appendChild(makeHomeTile({
      icon:'🌍',
      title:'Browse by Topic',
      subtitle:'Find the same lessons by EFL topic',
      onClick:()=>{
        state.librarySource='topic';
        state.view='topics';
        render();
      }
    }));

    if (state.settings.community_enabled) {
      grid.appendChild(makeHomeTile({
        icon:'💬',
        title:'Community',
        subtitle:'Announcements, help and teaching ideas',
        onClick:()=>{
          state.librarySource='home';
          state.view='community';
          state.communityCategory=null;
          state.communityTopic=null;
          state.communityTopicPage=0;
          state.communityPostPage=0;
          render();
        }
      }));
    }

    if (state.tools.length) {
      grid.appendChild(makeHomeTile({
        icon:'🧰',
        title:'Teacher Tools',
        subtitle:`${state.tools.length} tool${state.tools.length === 1 ? '' : 's'}`,
        onClick:()=>{
          state.librarySource='home';
          state.view='tools';
          render();
        }
      }));
    }

    els.content.appendChild(grid);
    track({ eventType:'portal_home_view' });
  }

  function renderCurriculumYears() {
    setHeader('Browse by Curriculum', ['Curriculum']);
    const grid = document.createElement('div');
    grid.className = 'tile-grid';

    state.years.forEach(year => {
      const grades = state.grades.filter(g => g.school_year_id === year.id);
      grid.appendChild(makeTile({
        icon:'📚',
        title:year.name,
        subtitle:`${grades.length} grade${grades.length === 1 ? '' : 's'}`,
        onClick:()=>{
          state.year=year;
          state.librarySource='curriculum';
          state.view='grades';
          render();
        }
      }));
    });

    if (!grid.children.length) {
      els.content.innerHTML = '<div class="empty-state">No curriculum years are available.</div>';
    } else {
      els.content.appendChild(grid);
    }
  }

  async function renderTopics() {
    setHeader('Browse by Topic', ['Topics']);
    els.content.innerHTML = '<div class="empty-state">Loading topics…</div>';

    try {
      await ensureTopics();

      const { data: packages, error } = await state.client
        .from('teaching_packages')
        .select('id,topic_id,primary_unit_id')
        .eq('published', true);
      if (error) throw error;

      const counts = new Map();
      (packages || []).forEach(p => counts.set(p.topic_id, (counts.get(p.topic_id) || 0) + 1));

      els.content.innerHTML = '';
      const grid = document.createElement('div');
      grid.className = 'tile-grid topic-grid';

      libraryState.topics.forEach(topic => {
        const count = counts.get(topic.id) || 0;
        if (!count && !isStaff()) return;
        grid.appendChild(makeTile({
          icon:topic.icon || '🌍',
          title:topic.name,
          subtitle:`${count} teaching package${count === 1 ? '' : 's'}`,
          onClick:async()=>{
            libraryState.selectedTopic=topic;
            state.librarySource='topic';
            state.view='topicPackages';
            await render();
          }
        }));
      });

      if (!grid.children.length) {
        els.content.innerHTML = '<div class="empty-state">No topic packages are available for this account yet.</div>';
      } else {
        els.content.appendChild(grid);
      }
    } catch (error) {
      els.content.innerHTML = `<div class="empty-state">${escapeHtml(error.message || 'Could not load topics.')}</div>`;
    }
  }

  async function renderTopicPackages() {
    const topic = libraryState.selectedTopic;
    if (!topic) {
      state.view='topics';
      return render();
    }

    setHeader(topic.name, ['Topics', topic.name]);
    els.content.innerHTML = '<div class="empty-state">Loading teaching packages…</div>';

    try {
      await loadPackagesForTopic(topic.id);
      els.content.innerHTML = '';

      const grid = document.createElement('div');
      grid.className = 'topic-package-list';

      libraryState.topicPackages.forEach(pkg => {
        const path = packagePath(pkg);
        if (!path.unit || !path.grade || !path.year) return;

        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'topic-package-card';
        card.innerHTML = `
          <span class="topic-package-icon">${escapeHtml(topic.icon || '🌍')}</span>
          <span class="topic-package-copy">
            <strong>${escapeHtml(pkg.title)}</strong>
            <small>${escapeHtml(pkg.subtopic || topic.name)}</small>
            <span>${escapeHtml(path.grade.name)} · ${escapeHtml(path.unit.name)} · ${escapeHtml(path.year.name)}</span>
          </span>
          <span class="topic-package-arrow">›</span>
        `;
        card.addEventListener('click', async () => {
          if (!isStaff() && !state.ownAccess.has(path.unit.id)) {
            return toast('This unit is locked for this account.');
          }
          state.year=path.year;
          state.grade=path.grade;
          state.unit=path.unit;
          state.librarySource='topic';
          state.view='activities';
          render();
        });
        grid.appendChild(card);
      });

      if (!grid.children.length) {
        els.content.innerHTML = '<div class="empty-state">No lessons in this topic are available for this account.</div>';
      } else {
        els.content.appendChild(grid);
      }
    } catch (error) {
      els.content.innerHTML = `<div class="empty-state">${escapeHtml(error.message || 'Could not load this topic.')}</div>`;
    }
  }

  function activityCard(activity, interactiveLesson = false) {
    const card = document.createElement('article');
    card.className = `activity-card ${interactiveLesson ? 'interactive-lesson-card' : ''}`;
    card.innerHTML = `
      <div class="unit-resource-kind">${interactiveLesson ? '🧩 Interactive Lesson' : '🎮 Interactive Game'}</div>
      <h3>${escapeHtml(activity.title)}</h3>
      <p>${escapeHtml(activity.type || (interactiveLesson ? 'Interactive Lesson' : 'Game'))} · Secure launch</p>
    `;

    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = interactiveLesson ? 'OPEN LESSON 🔐' : 'PLAY 🔐';
    btn.addEventListener('click', () => {
      window.open(`/play.html?activity=${encodeURIComponent(activity.id)}`, '_blank', 'noopener,noreferrer');
    });
    card.appendChild(btn);

    if (state.settings.community_enabled) {
      const discuss=document.createElement('button');
      discuss.className='btn btn-ghost btn-small';
      discuss.textContent='Discuss 💬';
      discuss.addEventListener('click',()=>{
        state.view='community';
        state.communityCategory=null;
        state.communityTopic=null;
        render();
      });
      card.appendChild(discuss);
    }
    return card;
  }

  function resourceCard(resource) {
    const type = String(resource.resource_type || 'Resource');
    const icon = type === 'Presentation' ? '🖥️'
      : type === 'Flashcards' ? '🃏'
      : type === 'Worksheet' ? '📝'
      : type === 'Audio' ? '🎧'
      : type === 'Teacher Guide' ? '📘'
      : type === 'ZIP' ? '📦'
      : '📄';

    const card = document.createElement('article');
    card.className = 'resource-card unit-resource-card';
    card.innerHTML = `
      <div class="resource-icon">${icon}</div>
      <div class="resource-body">
        <div class="unit-resource-kind">${escapeHtml(type)}</div>
        <h3>${escapeHtml(resource.title)}</h3>
        ${resource.description ? `<p>${escapeHtml(resource.description)}</p>` : ''}
        <div class="resource-actions"></div>
      </div>
    `;

    const actions = card.querySelector('.resource-actions');

    if (resource.allow_view) {
      const b=document.createElement('button');
      b.className='btn btn-small';
      b.textContent = type === 'Presentation' ? 'OPEN' : 'VIEW';
      b.addEventListener('click',()=>openResourceSecure(resource.id,'view'));
      actions.appendChild(b);
    }

    if (resource.allow_download && type !== 'Presentation') {
      const b=document.createElement('button');
      b.className='btn btn-small btn-ghost';
      b.textContent='DOWNLOAD';
      b.addEventListener('click',()=>openResourceSecure(resource.id,'download'));
      actions.appendChild(b);
    }

    return card;
  }

  function appendSection(title, nodes, className='activity-list') {
    if (!nodes.length) return;
    const section = document.createElement('section');
    section.className = 'unit-material-section';
    const heading = document.createElement('h2');
    heading.className = 'section-heading';
    heading.textContent = title;
    const list = document.createElement('div');
    list.className = className;
    nodes.forEach(node => list.appendChild(node));
    section.append(heading, list);
    els.content.appendChild(section);
  }

  async function renderUnitDashboard() {
    setHeader(
      `${state.unit.name}${state.unit.title ? ` — ${state.unit.title}` : ''}`,
      [state.year.name, state.grade.name, state.unit.name]
    );

    els.content.innerHTML = '<div class="empty-state">Loading Unit…</div>';

    const [packageResult, activityResult, resourceResult] = await Promise.all([
      state.client
        .from('teaching_packages')
        .select('id,primary_unit_id,topic_id,title,subtopic,curriculum_objective,target_language,vocabulary,source_label,published')
        .eq('primary_unit_id', state.unit.id)
        .eq('published', true)
        .maybeSingle(),
      state.client
        .from('activities')
        .select('id,unit_id,title,type,thumbnail_url,sort_order,published')
        .eq('unit_id', state.unit.id)
        .eq('published', true)
        .order('sort_order'),
      state.client
        .from('resources')
        .select('id,unit_id,title,resource_type,description,audience,allow_view,allow_download,published,sort_order')
        .eq('unit_id', state.unit.id)
        .eq('published', true)
        .order('sort_order')
    ]);

    if (state.view !== 'activities') return;

    // Safe fallback: if v1.7 SQL is not installed, preserve the old Unit page.
    if (packageResult.error) {
      console.warn('v1.7 teaching package metadata unavailable:', packageResult.error.message);
      return nativeRenderActivities();
    }

    if (activityResult.error || resourceResult.error) {
      els.content.innerHTML = `<div class="empty-state">${escapeHtml((activityResult.error || resourceResult.error).message)}</div>`;
      return;
    }

    const pkg = packageResult.data;
    const activities = activityResult.data || [];
    const resources = resourceResult.data || [];

    els.content.innerHTML = '';

    const header = document.createElement('section');
    header.className = 'unit-teaching-dashboard';

    const title = pkg?.title || state.unit.title || state.unit.name;
    header.innerHTML = `
      <div class="unit-dashboard-title">
        <div class="brand-kicker">CURRICULUM UNIT</div>
        <h2>${escapeHtml(state.unit.name)} — ${escapeHtml(title)}</h2>
        <p>${escapeHtml(state.grade.name)} · ${escapeHtml(state.unit.name)}</p>
      </div>

      <div class="unit-info-grid">
        <article class="unit-info-card objective-card">
          <h3>🎯 Curriculum Objective</h3>
          <p>${escapeHtml(pkg?.curriculum_objective || 'Curriculum objective has not been added yet.')}</p>
        </article>

        <article class="unit-info-card language-card">
          <h3>💬 Target Language</h3>
          ${arrayLines(pkg?.target_language)}
        </article>

        <article class="unit-info-card vocabulary-card">
          <h3>🔤 Vocabulary</h3>
          ${vocabCloud(pkg?.vocabulary)}
        </article>
      </div>
    `;
    els.content.appendChild(header);

    const lessonActivities = activities.filter(a => /interactive\s*lesson/i.test(String(a.type || '')));
    const games = activities.filter(a => !/interactive\s*lesson/i.test(String(a.type || '')));

    const presentations = resources.filter(r => String(r.resource_type) === 'Presentation');
    const flashcards = resources.filter(r => String(r.resource_type) === 'Flashcards');
    const worksheets = resources.filter(r => String(r.resource_type) === 'Worksheet');
    const otherResources = resources.filter(r => !['Presentation','Flashcards','Worksheet'].includes(String(r.resource_type)));

    appendSection('🧩 Interactive Lesson', lessonActivities.map(a => activityCard(a, true)));
    appendSection('🖥️ Presentation', presentations.map(resourceCard), 'resource-list');
    appendSection('🃏 Flashcards', flashcards.map(resourceCard), 'resource-list');
    appendSection('📝 Worksheet', worksheets.map(resourceCard), 'resource-list');
    appendSection('🎮 Interactive Game', games.map(a => activityCard(a, false)));
    appendSection('📁 Other Resources', otherResources.map(resourceCard), 'resource-list');

    if (!lessonActivities.length && !games.length && !resources.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state unit-no-materials';
      empty.innerHTML = '<div><strong>Curriculum information is ready.</strong><br>No presentation, flashcards, worksheet, interactive lesson or game has been attached yet.</div>';
      els.content.appendChild(empty);
    }

    track({ eventType:'unit_view', unitId:state.unit.id });
  }

  // ---------------------------------------------------------------------
  // Home + custom route dispatcher
  // ---------------------------------------------------------------------
  renderYears = renderLibraryHome;
  renderActivities = renderUnitDashboard;

  render = async function () {
    els.content.innerHTML = '';

    if (state.view === 'curriculumYears') return renderCurriculumYears();
    if (state.view === 'topics') return renderTopics();
    if (state.view === 'topicPackages') return renderTopicPackages();

    return nativeRender();
  };

  // ---------------------------------------------------------------------
  // Back navigation for the two library entrances
  // ---------------------------------------------------------------------
  els.backBtn.addEventListener('click', (event) => {
    if (state.view === 'curriculumYears') {
      event.preventDefault();
      event.stopImmediatePropagation();
      state.librarySource='home';
      state.view='years';
      render();
      return;
    }

    if (state.view === 'grades' && state.librarySource === 'curriculum') {
      event.preventDefault();
      event.stopImmediatePropagation();
      state.year=null;
      state.view='curriculumYears';
      render();
      return;
    }

    if (state.view === 'topics') {
      event.preventDefault();
      event.stopImmediatePropagation();
      state.librarySource='home';
      state.view='years';
      render();
      return;
    }

    if (state.view === 'topicPackages') {
      event.preventDefault();
      event.stopImmediatePropagation();
      state.view='topics';
      render();
      return;
    }

    if (state.view === 'activities' && state.librarySource === 'topic') {
      event.preventDefault();
      event.stopImmediatePropagation();
      state.unit=null;
      state.view='topicPackages';
      render();
    }
  }, true);

  // ---------------------------------------------------------------------
  // Admin Resource Manager: add Presentation as an iCloud resource type.
  // Existing resource behavior is unchanged.
  // ---------------------------------------------------------------------
  renderAdminResources = function (panel) {
    const result = nativeRenderAdminResources(panel);
    const select = panel.querySelector('#resourceType');
    if (select && ![...select.options].some(o => o.value === 'Presentation')) {
      const option = document.createElement('option');
      option.value = 'Presentation';
      option.textContent = 'Presentation';
      select.insertBefore(option, select.firstChild);
    }
    return result;
  };
})();
