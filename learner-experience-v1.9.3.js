/* Pawn to Professor v1.9.3 — Learner Topic Experience
   ------------------------------------------------------------
   Learner home:
     - Browse by Topic
     - Community (when enabled)
   No Curriculum browsing.
   No Teacher Tools.

   Topic catalogue:
     - counts ONLY lessons whose Units the learner can currently access
     - hides every topic with 0 accessible lessons
     - shows ONLY accessible lesson cards
     - never shows locked lesson cards to Learners

   During the 7-day trial, existing DB access rules mean this naturally
   becomes a catalogue of accessible Unit 1 topics only.

   Teachers, Admin and Owner keep their existing experience.
*/
(() => {
  if (typeof state === 'undefined' || typeof render === 'undefined') return;

  const VERSION = '1.9.3';
  const learnerState = {
    topics: [],
    topicsLoaded: false,
    selectedTopic: null,
    packages: []
  };

  function isLearner() {
    try {
      return !!state.profile
        && state.profile.role === 'user'
        && state.profile.member_type === 'learner'
        && !(typeof isStaff === 'function' && isStaff());
    } catch {
      return false;
    }
  }

  function esc(value='') {
    if (typeof escapeHtml === 'function') return escapeHtml(value);
    return String(value).replace(/[&<>'"]/g, ch => ({
      '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
    }[ch]));
  }

  function track(params) {
    try { globalThis.ptpTrackUsage?.(params); } catch {}
  }

  function unitPathParts(unitId) {
    const unit = state.units.find(u => u.id === unitId);
    const grade = state.grades.find(g => g.id === unit?.grade_id);
    const year = state.years.find(y => y.id === grade?.school_year_id);
    return { unit, grade, year };
  }

  function homeTile({icon,title,subtitle,onClick}) {
    return makeTile({ icon, title, subtitle, onClick });
  }

  async function ensureLearnerTopics() {
    if (learnerState.topicsLoaded) return;
    const { data, error } = await state.client
      .from('content_topics')
      .select('id,name,slug,icon,description,sort_order,published')
      .eq('published', true)
      .order('sort_order');
    if (error) throw error;
    learnerState.topics = data || [];
    learnerState.topicsLoaded = true;
  }

  async function accessiblePublishedPackages() {
    const { data, error } = await state.client
      .from('teaching_packages')
      .select('id,primary_unit_id,topic_id,title,subtopic,published')
      .eq('published', true)
      .order('title');
    if (error) throw error;

    // This is the key rule: Learners only see packages whose Unit appears
    // in accessible_unit_ids() / state.ownAccess.
    return (data || []).filter(pkg =>
      pkg.primary_unit_id && state.ownAccess.has(pkg.primary_unit_id)
    );
  }

  async function renderLearnerHome() {
    setHeader(`Welcome, ${state.profile.display_name || state.profile.username || 'Learner'}`, []);
    els.content.innerHTML = '';

    // Defensive: Teacher Tools must never remain loaded in a Learner browser.
    if (Array.isArray(state.tools)) state.tools = [];

    const grid = document.createElement('div');
    grid.className = 'tile-grid library-home-grid';

    grid.appendChild(homeTile({
      icon:'🌍',
      title:'Browse by Topic',
      subtitle:'Choose an English topic and start learning',
      onClick:()=>{
        state.librarySource='topic';
        state.view='topics';
        render();
      }
    }));

    if (state.settings.community_enabled) {
      grid.appendChild(homeTile({
        icon:'💬',
        title:'Community',
        subtitle:'Questions, announcements and allowed discussions',
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

    els.content.appendChild(grid);
    track({ eventType:'portal_home_view' });
  }

  async function renderLearnerTopics() {
    setHeader('Browse by Topic', ['Topics']);
    els.content.innerHTML = '<div class="empty-state">Loading your topics…</div>';

    try {
      await ensureLearnerTopics();
      const packages = await accessiblePublishedPackages();

      // Count only accessible lessons.
      const counts = new Map();
      packages.forEach(pkg => {
        if (!pkg.topic_id) return;
        counts.set(pkg.topic_id, (counts.get(pkg.topic_id) || 0) + 1);
      });

      els.content.innerHTML = '';
      const grid = document.createElement('div');
      grid.className = 'tile-grid topic-grid';

      learnerState.topics.forEach(topic => {
        const count = counts.get(topic.id) || 0;

        // IMPORTANT: Learners never see an empty topic.
        if (count <= 0) return;

        grid.appendChild(makeTile({
          icon:topic.icon || '🌍',
          title:topic.name,
          subtitle:`${count} lesson${count === 1 ? '' : 's'}`,
          onClick:()=>{
            learnerState.selectedTopic = topic;
            state.librarySource='topic';
            state.view='topicPackages';
            render();
          }
        }));
      });

      if (!grid.children.length) {
        const trialEnded = !!state.profile?.trial_started_at
          && (!state.profile?.trial_ends_at || new Date(state.profile.trial_ends_at) <= new Date());

        els.content.innerHTML = `
          <div class="empty-state">
            <div>
              <strong>🔒 No learning topics are currently available.</strong><br>
              ${trialEnded
                ? 'Your free trial has ended. Paid or assigned access is required to open more learning content.'
                : 'No lessons are currently assigned to this account.'}
            </div>
          </div>`;
      } else {
        els.content.appendChild(grid);
      }

      track({ eventType:'learner_topics_view' });
    } catch (error) {
      els.content.innerHTML =
        `<div class="empty-state">${esc(error.message || 'Could not load your topics.')}</div>`;
    }
  }

  async function renderLearnerTopicPackages() {
    const topic = learnerState.selectedTopic;
    if (!topic) {
      state.view = 'topics';
      return render();
    }

    setHeader(topic.name, ['Topics', topic.name]);
    els.content.innerHTML = '<div class="empty-state">Loading lessons…</div>';

    try {
      const { data, error } = await state.client
        .from('teaching_packages')
        .select('id,primary_unit_id,topic_id,title,subtopic,published')
        .eq('topic_id', topic.id)
        .eq('published', true)
        .order('title');
      if (error) throw error;

      // Never render a locked card for a Learner.
      learnerState.packages = (data || []).filter(pkg =>
        pkg.primary_unit_id && state.ownAccess.has(pkg.primary_unit_id)
      );

      els.content.innerHTML = '';
      const grid = document.createElement('div');
      grid.className = 'topic-package-list';

      learnerState.packages.forEach(pkg => {
        const path = unitPathParts(pkg.primary_unit_id);
        if (!path.unit) return;

        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'topic-package-card';
        card.innerHTML = `
          <span class="topic-package-icon">${esc(topic.icon || '🌍')}</span>
          <span class="topic-package-copy">
            <strong>${esc(pkg.title)}</strong>
            <small>${esc(pkg.subtopic || topic.name)}</small>
          </span>
          <span class="topic-package-arrow">›</span>
        `;
        card.addEventListener('click', () => {
          // Access is checked again before opening.
          if (!state.ownAccess.has(path.unit.id)) {
            return toast('This lesson is not currently available to this account.');
          }

          state.year = path.year || null;
          state.grade = path.grade || null;
          state.unit = path.unit;
          state.librarySource = 'topic';
          state.view = 'activities';
          render();
        });
        grid.appendChild(card);
      });

      if (!grid.children.length) {
        els.content.innerHTML =
          '<div class="empty-state"><div><strong>No available lessons in this topic.</strong><br>This topic will reappear automatically when an accessible lesson is available.</div></div>';
      } else {
        els.content.appendChild(grid);
      }

      track({ eventType:'learner_topic_packages_view' });
    } catch (error) {
      els.content.innerHTML =
        `<div class="empty-state">${esc(error.message || 'Could not load this topic.')}</div>`;
    }
  }

  function cleanUnitPrefix(text='') {
    return String(text).replace(/^\s*Unit\s+\d+\s*[—–-]\s*/i, '').trim();
  }

  function sanitizeLearnerLesson() {
    if (!isLearner() || state.view !== 'activities' || state.librarySource !== 'topic') return;

    // Remove curriculum/year/grade/unit breadcrumbs.
    if (els.breadcrumb) {
      const topicName = learnerState.selectedTopic?.name || 'Topic';
      els.breadcrumb.textContent = `Browse by Topic › ${topicName}`;
    }

    // Header should be learning-facing, not curriculum-facing.
    const pageTitle = document.querySelector('#pageTitle');
    if (pageTitle) {
      const cleaned = cleanUnitPrefix(pageTitle.textContent);
      if (cleaned) pageTitle.textContent = cleaned;
    }

    const dashboard = els.content.querySelector('.unit-teaching-dashboard');
    if (dashboard) {
      const kicker = dashboard.querySelector('.unit-dashboard-title .brand-kicker');
      if (kicker) kicker.textContent = 'LEARNING TOPIC';

      const title = dashboard.querySelector('.unit-dashboard-title h2');
      if (title) {
        const cleaned = cleanUnitPrefix(title.textContent);
        if (cleaned) title.textContent = cleaned;
      }

      // Hide Grade / Unit path.
      dashboard.querySelector('.unit-dashboard-title p')?.remove();

      // Curriculum Objective is for Teachers, not Learners.
      dashboard.querySelector('.objective-card')?.remove();

      const grid = dashboard.querySelector('.unit-info-grid');
      if (grid) {
        grid.style.gridTemplateColumns = 'repeat(2,minmax(0,1fr))';
        const vocab = grid.querySelector('.vocabulary-card');
        if (vocab) vocab.style.gridColumn = 'auto';
      }
    }

    // Teacher Guide files are teacher-facing resources.
    els.content.querySelectorAll('.unit-resource-card').forEach(card => {
      const kind = card.querySelector('.unit-resource-kind')?.textContent || '';
      if (/teacher\s*guide/i.test(kind)) {
        const section = card.closest('.unit-material-section');
        card.remove();
        if (section && !section.querySelector('.unit-resource-card, .activity-card')) {
          section.remove();
        }
      }
    });

    els.content.querySelectorAll('.unit-no-materials').forEach(node => {
      node.innerHTML =
        '<div><strong>Learning materials are being prepared.</strong><br>'
        + 'No lesson, activity or learning resource has been attached yet.</div>';
    });
  }

  function learnerForbiddenRoute() {
    if (!isLearner()) return false;
    return ['curriculumYears','grades','units','tools'].includes(state.view)
      || (state.view === 'activities' && state.librarySource !== 'topic');
  }

  const nativeRenderV193 = render;

  render = async function (...args) {
    if (!isLearner()) return nativeRenderV193(...args);

    if (learnerForbiddenRoute()) {
      state.librarySource = 'topic';
      state.view = 'topics';
      state.year = null;
      state.grade = null;
      state.unit = null;
    }

    if (state.view === 'years') return renderLearnerHome();
    if (state.view === 'topics') return renderLearnerTopics();
    if (state.view === 'topicPackages') return renderLearnerTopicPackages();

    // Community remains available. Activity pages are rendered by the
    // existing secure Unit dashboard and then simplified for Learners.
    const result = await nativeRenderV193(...args);

    sanitizeLearnerLesson();
    requestAnimationFrame(sanitizeLearnerLesson);
    setTimeout(sanitizeLearnerLesson, 25);
    setTimeout(sanitizeLearnerLesson, 120);

    return result;
  };

  // The original app can call renderYears directly.
  if (typeof renderYears === 'function') {
    const nativeRenderYearsV193 = renderYears;
    renderYears = function (...args) {
      if (isLearner()) return renderLearnerHome();
      return nativeRenderYearsV193(...args);
    };
  }

  // If the Unit dashboard finishes asynchronously, clean teacher-facing
  // curriculum labels as soon as they appear.
  let sanitizeTimer = null;
  const observer = new MutationObserver(() => {
    if (!isLearner() || state.view !== 'activities') return;
    clearTimeout(sanitizeTimer);
    sanitizeTimer = setTimeout(sanitizeLearnerLesson, 10);
  });

  const startObserver = () => {
    if (els?.content) {
      observer.observe(els.content, { childList:true, subtree:true });
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver, { once:true });
  } else {
    startObserver();
  }

  globalThis.PTP_LEARNER_EXPERIENCE_VERSION = VERSION;
})();
