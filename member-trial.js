/* Pawn to Professor v1.9.0
   Teacher / Learner registration + 7-day Unit 1 trial experience.
   This file is intentionally additive so the existing v1.7 site stays intact.
*/
(() => {
  if (typeof state === 'undefined' || typeof els === 'undefined') return;

  const V18 = '1.9.0';

  function esc(v = '') {
    if (typeof escapeHtml === 'function') return escapeHtml(v);
    return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function isTrialActive(profile = state.profile) {
    if (!profile?.trial_started_at || !profile?.trial_ends_at) return false;
    return new Date(profile.trial_started_at) <= new Date() && new Date(profile.trial_ends_at) > new Date();
  }

  function trialStatus(profile = state.profile) {
    if (!profile?.trial_started_at) return 'Not started';
    if (profile.trial_ends_at && new Date(profile.trial_ends_at) > new Date()) return 'ACTIVE';
    return 'EXPIRED';
  }

  function formatDateTime(value) {
    if (!value) return '—';
    try {
      return new Intl.DateTimeFormat(undefined, {
        year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'
      }).format(new Date(value));
    } catch { return String(value); }
  }

  // -----------------------------------------------------------------------
  // 1) Registration UI: Teacher / Learner + age / guardian + terms
  // -----------------------------------------------------------------------
  function installRegistrationFields() {
    const form = els.registerForm;
    if (!form || form.querySelector('#v18RegistrationFields')) return;

    const block = document.createElement('div');
    block.id = 'v18RegistrationFields';
    block.className = 'v18-registration-fields';
    block.innerHTML = `
      <div class="v18-account-type">
        <div class="v18-field-title">I am registering as:</div>
        <div class="v18-choice-grid">
          <label class="v18-choice-card">
            <input type="radio" name="v18MemberType" value="teacher" checked>
            <span><strong>👩‍🏫 Teacher</strong><small>Teaching resources, curriculum browsing and classroom materials.</small></span>
          </label>
          <label class="v18-choice-card">
            <input type="radio" name="v18MemberType" value="learner">
            <span><strong>🎓 Learner</strong><small>Assigned learning content, interactive lessons and activities.</small></span>
          </label>
        </div>
      </div>

      <div id="v18TeacherAge" class="v18-age-block">
        <label class="checkbox-card v18-checkbox">
          <input id="v18TeacherAdult" type="checkbox">
          I confirm that I am 18 years old or older.
        </label>
      </div>

      <div id="v18LearnerAge" class="v18-age-block hidden">
        <label>Age group
          <select id="v18LearnerAgeSelect">
            <option value="">Choose…</option>
            <option value="adult">18 years old or older</option>
            <option value="minor">Under 18 years old</option>
          </select>
        </label>
      </div>

      <div id="v18GuardianFields" class="v18-guardian-fields hidden">
        <div class="two-col">
          <label>Parent / guardian name
            <input id="v18GuardianName" autocomplete="name" placeholder="Parent or guardian name">
          </label>
          <label>Parent / guardian email
            <input id="v18GuardianEmail" type="email" autocomplete="email" placeholder="parent@example.com">
          </label>
        </div>
        <label class="checkbox-card v18-checkbox">
          <input id="v18GuardianConsent" type="checkbox">
          I confirm that I am the parent/legal guardian, or that my parent/legal guardian has given permission for this learner account.
        </label>
      </div>

      <div>
        <div class="v18-field-title">Terms & Privacy</div>
        <div id="v19LegalChecks" class="v19-legal-checks">
          <div class="v19-legal-status">Loading the current agreements…</div>
        </div>
      </div>

      <div class="v18-trial-note">
        <strong>🎁 7-day trial after approval</strong>
        <span>When an administrator approves a new public registration, all published Unit 1 content is available for 7 days. After that, paid or assigned access is required.</span>
      </div>
    `;

    const buttonRow = form.querySelector('.button-row');
    if (buttonRow) form.insertBefore(block, buttonRow);
    else form.appendChild(block);

    const teacherAge = block.querySelector('#v18TeacherAge');
    const learnerAge = block.querySelector('#v18LearnerAge');
    const learnerAgeSelect = block.querySelector('#v18LearnerAgeSelect');
    const guardianFields = block.querySelector('#v18GuardianFields');
    const guardianName = block.querySelector('#v18GuardianName');
    const guardianEmail = block.querySelector('#v18GuardianEmail');
    const guardianConsent = block.querySelector('#v18GuardianConsent');
    const legalChecks = block.querySelector('#v19LegalChecks');
    let currentLegalDocs = [];

    function currentType() {
      return block.querySelector('input[name="v18MemberType"]:checked')?.value || 'teacher';
    }

    function isMinorLearner() {
      return currentType()==='learner' && learnerAgeSelect.value==='minor';
    }

    async function renderLegalChecks() {
      const type=currentType();
      legalChecks.innerHTML='<div class="v19-legal-status">Loading the current agreements…</div>';
      try {
        if(!globalThis.PTPLegal) throw new Error('Legal module is not loaded.');
        currentLegalDocs=await globalThis.PTPLegal.requiredDocuments(type);
        const needed=globalThis.PTPLegal.requiredTypes(type);
        const missing=needed.filter(t=>!currentLegalDocs.some(d=>d.document_type===t));
        if(missing.length) {
          legalChecks.innerHTML='<div class="v19-legal-warning">Registration is temporarily unavailable because the current legal documents are incomplete. Please contact the administrator.</div>';
          return;
        }

        const guardian=isMinorLearner();
        legalChecks.innerHTML=currentLegalDocs.map(doc=>{
          const privacy=doc.document_type==='privacy_policy';
          const name=globalThis.PTPLegal.types[doc.document_type]||doc.title;
          const sentence=guardian
            ? (privacy
                ? `My parent/legal guardian acknowledges the ${name} on my behalf.`
                : `My parent/legal guardian agrees to the ${name} on my behalf.`)
            : (privacy ? `I acknowledge the ${name}.` : `I agree to the ${name}.`);
          return `
            <label class="v19-legal-check">
              <input type="checkbox" data-legal-accept="${doc.id}" data-legal-type="${doc.document_type}">
              <span>${esc(sentence)} <small>(v${esc(doc.version)})</small></span>
              <button type="button" data-view-legal="${doc.document_type}">View</button>
            </label>`;
        }).join('');
        legalChecks.querySelectorAll('[data-view-legal]').forEach(btn=>btn.addEventListener('click',()=>{
          const doc=currentLegalDocs.find(d=>d.document_type===btn.dataset.viewLegal);
          globalThis.PTPLegal.openDocument(doc);
        }));
      } catch(err) {
        legalChecks.innerHTML=`<div class="v19-legal-warning">${esc(err.message||'Could not load the current agreements.')}</div>`;
      }
    }

    function syncRegistrationType() {
      const learner = currentType() === 'learner';
      teacherAge.classList.toggle('hidden', learner);
      learnerAge.classList.toggle('hidden', !learner);
      if (!learner) {
        learnerAgeSelect.value = '';
        guardianFields.classList.add('hidden');
        guardianName.required = false;
        guardianEmail.required = false;
        guardianConsent.required = false;
      }
      renderLegalChecks();
    }

    function syncGuardianFields() {
      const showGuardian = learnerAgeSelect.value === 'minor';
      guardianFields.classList.toggle('hidden', !showGuardian);
      guardianName.required = showGuardian;
      guardianEmail.required = showGuardian;
      guardianConsent.required = showGuardian;
      renderLegalChecks();
    }

    block.querySelectorAll('input[name="v18MemberType"]').forEach(r => r.addEventListener('change', syncRegistrationType));
    learnerAgeSelect.addEventListener('change', syncGuardianFields);
    syncRegistrationType();
    syncGuardianFields();

    // Capture phase prevents the older core registration listener from sending
    // a request without the new member/age/legal fields.
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();

      const password = els.registerPassword.value;
      if (password !== els.registerPassword2.value) {
        els.registerMessage.textContent = 'The two passwords do not match.';
        return;
      }

      const memberType = currentType();
      let adultConfirmed = false;
      let guardianNameValue = '';
      let guardianEmailValue = '';
      let guardianConsentValue = false;

      if (memberType === 'teacher') {
        adultConfirmed = block.querySelector('#v18TeacherAdult').checked;
        if (!adultConfirmed) {
          els.registerMessage.textContent = 'Teacher accounts require confirmation that you are 18 or older.';
          return;
        }
      } else {
        const ageChoice = learnerAgeSelect.value;
        if (!ageChoice) {
          els.registerMessage.textContent = 'Please choose the learner age group.';
          return;
        }
        adultConfirmed = ageChoice === 'adult';
        if (!adultConfirmed) {
          guardianNameValue = guardianName.value.trim();
          guardianEmailValue = guardianEmail.value.trim();
          guardianConsentValue = guardianConsent.checked;
          if (!guardianNameValue || !guardianEmailValue || !guardianConsentValue) {
            els.registerMessage.textContent = 'A parent/guardian name, email and permission are required for learners under 18.';
            return;
          }
        }
      }

      // Refresh legal versions immediately before submission so a newly
      // published version cannot be silently bypassed.
      try {
        globalThis.PTPLegal?.clearCache?.();
        currentLegalDocs = await globalThis.PTPLegal.requiredDocuments(memberType);
      } catch(err) {
        els.registerMessage.textContent = err.message || 'Could not verify the current Terms.';
        return;
      }

      const requiredTypes=globalThis.PTPLegal.requiredTypes(memberType);
      const acceptedBoxes=[...legalChecks.querySelectorAll('[data-legal-accept]:checked')];
      const acceptedIds=acceptedBoxes.map(x=>x.dataset.legalAccept);
      const acceptedTypes=new Set(acceptedBoxes.map(x=>x.dataset.legalType));

      if(requiredTypes.some(t=>!acceptedTypes.has(t))) {
        // Re-render because the current legal versions may have changed.
        await renderLegalChecks();
        els.registerMessage.textContent = 'Please review and accept all required Terms and the Privacy Policy.';
        return;
      }

      els.registerMessage.textContent = 'Sending request…';
      try {
        const res = await fetch('/api/register-request', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            username:els.registerUsername.value,
            displayName:els.registerName.value,
            email:els.registerEmail.value,
            password,
            memberType,
            adultConfirmed,
            guardianName:guardianNameValue,
            guardianEmail:guardianEmailValue,
            guardianConsent:guardianConsentValue,
            acceptedDocumentIds:acceptedIds
          })
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          els.registerMessage.textContent = body.error || 'Registration could not be completed.';
          if(res.status===409) renderLegalChecks();
          return;
        }
        form.reset();
        syncRegistrationType();
        syncGuardianFields();
        showLogin('Registration received. Your account is waiting for administrator approval. Your 7-day Unit 1 trial will begin when approved.');
      } catch (err) {
        els.registerMessage.textContent = err.message || 'Registration could not be completed.';
      }
    }, true);
  }

  // -----------------------------------------------------------------------
  // 2) Teacher Tools are staff-only for both Teacher and Learner accounts
  // -----------------------------------------------------------------------
  if (typeof loadExternalTools === 'function') {
    const nativeLoadExternalTools = loadExternalTools;
    loadExternalTools = async function () {
      if (!isStaff()) {
        state.tools = [];
        return;
      }
      return nativeLoadExternalTools();
    };
  }

  // -----------------------------------------------------------------------
  // 3) Home experience + trial status banner
  // -----------------------------------------------------------------------
  if (typeof renderYears === 'function') {
    const nativeRenderYearsV18 = renderYears;
    renderYears = function () {
      nativeRenderYearsV18();
      if (!state.profile || isStaff()) return;

      const learner = state.profile.member_type === 'learner';
      if (learner) {
        els.content.querySelectorAll('.tile-title').forEach(node => {
          if (node.textContent.trim() === 'Browse by Curriculum') node.textContent = 'My Learning';
          if (node.textContent.trim() === 'Browse by Topic') node.textContent = 'Browse Topics';
        });
      }

      const active = isTrialActive();
      const expiredNoAccess = state.profile.trial_started_at && !active && state.ownAccess.size === 0;
      if (!active && !expiredNoAccess) return;

      const banner = document.createElement('div');
      banner.className = `v18-trial-banner ${active ? 'active' : 'expired'}`;
      if (active) {
        banner.innerHTML = `
          <div class="v18-trial-icon">🎁</div>
          <div><strong>7-Day Trial Active</strong><span>All published Unit 1 content is open until ${esc(formatDateTime(state.profile.trial_ends_at))}.</span></div>
        `;
      } else {
        banner.innerHTML = `
          <div class="v18-trial-icon">🔒</div>
          <div><strong>Your trial has ended</strong><span>Your account remains active, but learning content now requires paid or assigned access.</span></div>
        `;
      }
      els.content.prepend(banner);
    };
  }

  // -----------------------------------------------------------------------
  // 4) Admin registration requests show account type / age details.
  //    Approval starts the trial via the database trigger.
  // -----------------------------------------------------------------------
  if (typeof renderAdminRequests === 'function') {
    const nativeRenderAdminRequestsV18 = renderAdminRequests;
    renderAdminRequests = function (panel) {
      nativeRenderAdminRequestsV18(panel);
      const pending = state.adminUsers.filter(u => u.status === 'pending');
      const cards = [...panel.querySelectorAll('.request-card')];
      cards.forEach((card, index) => {
        const user = pending[index];
        if (!user) return;
        const type = user.member_type === 'learner' ? '🎓 Learner' : '👩‍🏫 Teacher';
        const age = user.adult_confirmed === true ? '18+' : (user.guardian_consent_at ? 'Under 18 · guardian permission recorded' : 'Age confirmation unavailable');
        const details = document.createElement('div');
        details.className = 'v18-request-meta';
        details.innerHTML = `<strong>${type}</strong><span>${esc(age)}</span>${user.guardian_name ? `<span>Guardian: ${esc(user.guardian_name)} · ${esc(user.guardian_email || '')}</span>` : ''}`;
        const actions = card.querySelector('.request-actions');
        if (actions) card.insertBefore(details, actions);

        const approve = card.querySelector('[data-approve]');
        if (approve) {
          approve.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            approve.disabled = true;
            const { error } = await state.client.from('profiles').update({status:'active'}).eq('id', user.id);
            if (error) {
              approve.disabled = false;
              return toast(error.message);
            }
            await logAudit('registration_approved','profile',user.id,{username:user.username,member_type:user.member_type || 'teacher',trial_days:7});
            toast(`${user.username} approved. Their 7-day Unit 1 trial has started.`);
            await loadAdminUsers();
            render();
          }, true);
        }
      });
    };
  }

  // -----------------------------------------------------------------------
  // 5) Admin Users & Access: show/change Teacher/Learner + trial dates
  // -----------------------------------------------------------------------
  if (typeof renderAdminUserPermissions === 'function') {
    const nativeRenderAdminUserPermissionsV18 = renderAdminUserPermissions;
    renderAdminUserPermissions = async function (container, user) {
      await nativeRenderAdminUserPermissionsV18(container, user);
      if (!container || !user) return;

      const firstGrid = container.querySelector('.admin-form-grid');
      if (firstGrid && !container.querySelector('#v18MemberTypeAdmin')) {
        const typeLabel = document.createElement('label');
        typeLabel.innerHTML = `Account type<select id="v18MemberTypeAdmin"><option value="teacher" ${user.member_type === 'learner' ? '' : 'selected'}>Teacher</option><option value="learner" ${user.member_type === 'learner' ? 'selected' : ''}>Learner</option></select>`;
        firstGrid.insertBefore(typeLabel, firstGrid.firstChild);
      }

      if (!container.querySelector('.v18-admin-trial-card')) {
        const trialCard = document.createElement('div');
        trialCard.className = `v18-admin-trial-card ${trialStatus(user).toLowerCase().replace(' ','-')}`;
        trialCard.innerHTML = `
          <strong>🎁 Registration Trial</strong>
          <div><span>Status</span><b>${esc(trialStatus(user))}</b></div>
          <div><span>Started</span><b>${esc(formatDateTime(user.trial_started_at))}</b></div>
          <div><span>Ends</span><b>${esc(formatDateTime(user.trial_ends_at))}</b></div>
          <p>${user.registration_source === 'public' ? 'Public registration: approval starts one 7-day Unit 1 trial.' : 'This account was not created through the public-registration trial flow.'}</p>
        `;
        const grid = container.querySelector('.admin-form-grid');
        if (grid) grid.insertAdjacentElement('afterend', trialCard);
        else container.prepend(trialCard);
      }
    };
  }

  if (typeof saveUserAndPermissions === 'function') {
    const nativeSaveUserAndPermissionsV18 = saveUserAndPermissions;
    saveUserAndPermissions = async function (container, user) {
      const memberSelect = container?.querySelector('#v18MemberTypeAdmin');
      if (memberSelect && memberSelect.value !== (user.member_type || 'teacher')) {
        const { error } = await state.client.from('profiles').update({member_type:memberSelect.value}).eq('id',user.id);
        if (error) return toast(error.message);
        user.member_type = memberSelect.value;
      }
      return nativeSaveUserAndPermissionsV18(container, user);
    };
  }

  // Keep a visible version marker for troubleshooting without changing UI.
  globalThis.PTP_MEMBER_TRIAL_VERSION = V18;
  installRegistrationFields();

  // If a remembered session finished loading unusually quickly, enforce the
  // new member experience immediately as well as on the next navigation.
  setTimeout(() => {
    try {
      if (state.profile && !isStaff()) {
        state.tools = [];
        if (state.view === 'years') render();
      }
    } catch { /* normal startup will apply the same rules */ }
  }, 0);
})();
