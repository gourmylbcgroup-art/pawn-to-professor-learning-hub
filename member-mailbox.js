/* Pawn to Professor v1.9.6
   Private Member Mailbox + Welcome + Trial/Access Contact System
   Loaded LAST so it can safely extend all previous patches.
*/
(() => {
  if (typeof state === 'undefined' || typeof render === 'undefined') return;

  const VERSION = '1.9.6';
  let memberSelectedThreadId = null;
  let adminSelectedThreadId = null;
  let composeSeed = null;
  let homeEnhanceTimer = null;

  const STATUS_LABELS = {
    new: 'New',
    awaiting_payment: 'Awaiting Payment',
    payment_received: 'Payment Received',
    access_granted: 'Access Granted',
    closed: 'Closed'
  };

  const CATEGORY_LABELS = {
    general: 'General',
    access_payment: 'Access / Payment',
    technical: 'Technical',
    account: 'Account',
    welcome: 'Welcome',
    other: 'Other'
  };

  function esc(v='') {
    if (typeof escapeHtml === 'function') return escapeHtml(v);
    return String(v).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function isNormalMember() {
    return !!state.profile && state.profile.role === 'user' && !isStaff();
  }

  function trialMode() {
    if (!isNormalMember()) return 'none';

    if (globalThis.PTP_PAYMENT_STATE?.hadPaidAccess && !globalThis.PTP_PAYMENT_STATE?.active) {
      return 'annual_expired';
    }

    const started = state.profile.trial_started_at
      ? new Date(state.profile.trial_started_at)
      : null;
    const ends = state.profile.trial_ends_at
      ? new Date(state.profile.trial_ends_at)
      : null;
    const now = new Date();

    if (started && ends && started <= now && ends > now) return 'active';
    if (started && ends && ends <= now && state.ownAccess.size === 0) return 'expired';
    return 'current_access';
  }

  function memberLabel() {
    if (state.profile?.member_type === 'learner') return 'Learner';
    if (state.profile?.member_type === 'teacher') return 'Teacher';
    return 'Member';
  }

  async function api(payload) {
    const headers = await authHeaders();
    const res = await fetch('/api/security?action=support-message', {
      method: 'POST',
      headers,
      cache: 'no-store',
      body: JSON.stringify(payload)
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'Message action failed.');
    return body;
  }

  async function loadThreads({ admin = false } = {}) {
    let q = state.client
      .from('support_threads')
      .select('*')
      .order('last_message_at', { ascending:false });

    if (!admin) q = q.eq('member_id', state.session.user.id);

    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  async function loadMessages(threadId) {
    const { data, error } = await state.client
      .from('support_messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at');

    if (error) throw error;
    return data || [];
  }

  async function loadProfiles(ids) {
    const cleanIds = [...new Set((ids || []).filter(Boolean))];
    if (!cleanIds.length) return new Map();

    const { data } = await state.client
      .from('profiles')
      .select('id,username,display_name,contact_email,member_type,role,status')
      .in('id', cleanIds);

    return new Map((data || []).map(p => [p.id, p]));
  }

  function statusPill(status) {
    return `<span class="mailbox-status ${esc(status)}">${esc(STATUS_LABELS[status] || status)}</span>`;
  }

  function threadCard(thread, { admin = false, member = null } = {}) {
    const unread = admin
      ? Number(thread.admin_unread_count || 0)
      : Number(thread.member_unread_count || 0);

    const subtitle = admin && member
      ? `${member.display_name || member.username} · ${CATEGORY_LABELS[thread.category] || thread.category}`
      : `${CATEGORY_LABELS[thread.category] || thread.category}`;

    return `
      <button class="mailbox-thread-card ${unread ? 'unread' : ''}"
              data-thread-id="${thread.id}" type="button">
        <span>
          <strong>${esc(thread.subject)}</strong>
          <small>${esc(subtitle)} · ${new Date(thread.last_message_at).toLocaleString()}</small>
        </span>
        <span>
          ${unread ? `<span class="mailbox-unread-pill">${unread}</span>` : ''}
          ${statusPill(thread.status)}
        </span>
      </button>`;
  }

  function composeHtml(seed = {}) {
    const category = seed.category || 'general';
    const subject = seed.subject || '';
    const body = seed.body || '';

    return `
      <div class="mailbox-compose">
        <div class="mailbox-compose-grid">
          <label>
            Category
            <select id="mailboxComposeCategory">
              ${['general','access_payment','technical','account','other'].map(v =>
                `<option value="${v}" ${v===category?'selected':''}>${esc(CATEGORY_LABELS[v])}</option>`
              ).join('')}
            </select>
          </label>
          <label>
            Subject
            <input id="mailboxComposeSubject" maxlength="180" value="${esc(subject)}" placeholder="How can we help?">
          </label>
        </div>

        <label>
          Private message
          <textarea id="mailboxComposeBody" maxlength="8000" placeholder="Write your message to the administrator…">${esc(body)}</textarea>
        </label>

        ${state.profile?.member_type === 'learner' ? `
          <div class="mailbox-safety-note">
            🔐 This message is private between your account and the administrators.
            Please do not include passwords or unnecessary sensitive personal information.
          </div>` : ''}

        <div class="button-row">
          <button id="mailboxCancelCompose" class="btn btn-ghost" type="button">Cancel</button>
          <button id="mailboxSendCompose" class="btn btn-accent" type="button">Send to Admin</button>
        </div>
      </div>`;
  }

  async function renderMemberMailbox() {
    setHeader('My Messages', ['My Messages']);
    els.content.innerHTML = '<div class="empty-state">Loading your private messages…</div>';

    let threads;
    try {
      threads = await loadThreads();
    } catch (err) {
      els.content.innerHTML = `<div class="empty-state">${esc(err.message || 'Could not load messages.')}</div>`;
      return;
    }

    if (state.view !== 'mailbox') return;

    if (composeSeed) {
      els.content.innerHTML = `
        <div class="mailbox-toolbar">
          <h3>📨 Message Admin</h3>
          <span class="admin-note">Private support</span>
        </div>
        ${composeHtml(composeSeed)}
      `;

      els.content.querySelector('#mailboxCancelCompose').addEventListener('click', () => {
        composeSeed = null;
        render();
      });

      els.content.querySelector('#mailboxSendCompose').addEventListener('click', async e => {
        const btn = e.currentTarget;
        const category = els.content.querySelector('#mailboxComposeCategory').value;
        const subject = els.content.querySelector('#mailboxComposeSubject').value.trim();
        const body = els.content.querySelector('#mailboxComposeBody').value.trim();

        if (!subject || !body) return toast('Add a subject and message.');

        btn.disabled = true;
        btn.textContent = 'Sending…';

        try {
          const result = await api({
            action: 'new_thread',
            category,
            subject,
            body,
            context: composeSeed.context || {}
          });

          composeSeed = null;
          memberSelectedThreadId = result.threadId;
          toast('Private message sent to Admin.');
          render();
        } catch (err) {
          toast(err.message);
          btn.disabled = false;
          btn.textContent = 'Send to Admin';
        }
      });
      return;
    }

    if (memberSelectedThreadId) {
      const thread = threads.find(t => t.id === memberSelectedThreadId);
      if (!thread) memberSelectedThreadId = null;
      else {
        await renderMemberThread(thread);
        return;
      }
    }

    els.content.innerHTML = `
      <div class="mailbox-toolbar">
        <div>
          <h3>📨 My Messages</h3>
          <p class="admin-note">Private conversations with Pawn to Professor Admin.</p>
        </div>
        <button id="mailboxNewMessage" class="btn btn-accent" type="button">+ Message Admin</button>
      </div>

      <div class="mailbox-list">
        ${threads.length
          ? threads.map(t => threadCard(t)).join('')
          : '<div class="empty-state" style="height:120px">No private messages yet.</div>'}
      </div>
    `;

    els.content.querySelector('#mailboxNewMessage').addEventListener('click', () => {
      composeSeed = {
        category: 'general',
        subject: '',
        body: ''
      };
      render();
    });

    els.content.querySelectorAll('[data-thread-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        memberSelectedThreadId = btn.dataset.threadId;
        render();
      });
    });
  }

  async function renderMemberThread(thread) {
    let messages;
    try {
      messages = await loadMessages(thread.id);
      await api({ action:'mark_read', threadId:thread.id }).catch(() => {});
    } catch (err) {
      els.content.innerHTML = `<div class="empty-state">${esc(err.message)}</div>`;
      return;
    }

    const profiles = await loadProfiles(messages.map(m => m.sender_id));

    els.content.innerHTML = `
      <div class="mailbox-thread-head">
        <div>
          <button id="mailboxBackToList" class="btn btn-small btn-ghost" type="button">← Messages</button>
          <h3>${esc(thread.subject)}</h3>
          <div class="meta">${esc(CATEGORY_LABELS[thread.category] || thread.category)}</div>
        </div>
        ${statusPill(thread.status)}
      </div>

      <div class="mailbox-messages">
        ${messages.map(m => {
          const sender = profiles.get(m.sender_id);
          const label = m.sender_kind === 'member'
            ? 'You'
            : (sender?.display_name || sender?.username || 'Pawn to Professor Admin');

          return `
            <article class="mailbox-message ${esc(m.sender_kind)}">
              <div class="mailbox-message-label">
                <strong>${esc(label)}</strong>
                <span>${new Date(m.created_at).toLocaleString()}</span>
              </div>
              <div class="mailbox-message-body">${esc(m.body)}</div>
            </article>`;
        }).join('')}
      </div>

      <div class="mailbox-reply">
        <label>
          Reply privately
          <textarea id="mailboxReplyBody" maxlength="8000" placeholder="Write your reply…"></textarea>
        </label>
        <button id="mailboxSendReply" class="btn btn-accent" type="button">Send Reply</button>
      </div>
    `;

    els.content.querySelector('#mailboxBackToList').addEventListener('click', () => {
      memberSelectedThreadId = null;
      render();
    });

    els.content.querySelector('#mailboxSendReply').addEventListener('click', async e => {
      const body = els.content.querySelector('#mailboxReplyBody').value.trim();
      if (!body) return toast('Write a reply first.');

      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = 'Sending…';

      try {
        await api({ action:'reply', threadId:thread.id, body });
        toast('Reply sent.');
        render();
      } catch (err) {
        toast(err.message);
        btn.disabled = false;
        btn.textContent = 'Send Reply';
      }
    });
  }

  async function unreadMemberCount() {
    if (!isNormalMember()) return 0;
    const { data } = await state.client
      .from('support_threads')
      .select('member_unread_count')
      .eq('member_id', state.session.user.id);

    return (data || []).reduce((sum, row) => sum + Number(row.member_unread_count || 0), 0);
  }

  async function unreadAdminCount() {
    if (!isStaff()) return 0;
    const { data } = await state.client
      .from('support_threads')
      .select('admin_unread_count');

    return (data || []).reduce((sum, row) => sum + Number(row.admin_unread_count || 0), 0);
  }

  async function enhanceMemberHome() {
    if (!isNormalMember() || state.view !== 'years') return;
    const grid = els.content.querySelector('.tile-grid');
    if (!grid || grid.querySelector('[data-mailbox-home]')) return;

    const tile = makeTile({
      icon: '📨',
      title: 'My Messages',
      subtitle: 'Private message to Admin',
      onClick: () => {
        memberSelectedThreadId = null;
        composeSeed = null;
        state.view = 'mailbox';
        render();
      }
    });

    tile.dataset.mailboxHome = 'true';
    tile.classList.add('mailbox-home-tile');
    grid.appendChild(tile);

    const count = await unreadMemberCount().catch(() => 0);
    if (state.view !== 'years' || !tile.isConnected) return;

    if (count > 0) {
      const subtitle = tile.querySelector('.tile-subtitle');
      subtitle.textContent = `${count} unread private message${count===1?'':'s'}`;
    }
  }

  function accessCopy(unit) {
    const mode = trialMode();
    const title = unit?.title ? `${unit.name} — ${unit.title}` : (unit?.name || 'this content');

    if (mode === 'active') {
      return {
        heading: '🔒 This content is not included in your free trial',
        text: `Your 3-day trial gives you access to selected Unit 1 content. ${title} is not currently included.`,
        button: '📨 Message Admin About Access'
      };
    }

    if (mode === 'expired') {
      return {
        heading: '⏰ Your free trial has ended',
        text: 'Your account is still active, but your free learning access has finished. Contact the administrator to continue with a one-year paid access plan.',
        button: '💳 Contact Admin to Continue'
      };
    }

    if (mode === 'annual_expired') {
      return {
        heading: '⏰ Your annual access has ended',
        text: 'Your account is still active, but your one-year learning access has expired. Community and My Messages remain available. Contact the administrator to renew.',
        button: '💳 Renew Annual Access'
      };
    }

    return {
      heading: '🔒 This content is not included in your current access',
      text: `${title} is outside your current access. Contact the administrator if you would like to add this content or choose another access plan.`,
      button: '📨 Message Admin'
    };
  }

  function seedForAccess(unit) {
    const title = unit?.title ? `${unit.name} — ${unit.title}` : (unit?.name || 'learning content');
    const mode = trialMode();

    const subject = mode === 'annual_expired'
      ? 'Renew my annual access'
      : mode === 'expired'
        ? 'Continue after my free trial'
        : `Request access to ${title}`;

    const body = mode === 'annual_expired'
      ? `My one-year Pawn to Professor access has ended and I would like to renew.\n\nPlease confirm the current renewal price and payment instructions.`
      : mode === 'expired'
        ? `My 3-day free trial has ended and I would like to continue using Pawn to Professor.\n\nPlease send me information about the current one-year access price and payment options.`
        : `I tried to open:\n${title}\n\nMy current access does not include this content. I would like information about getting access.`;

    return {
      category: 'access_payment',
      subject,
      body,
      context: {
        source: 'locked_content',
        unit_id: unit?.id || null,
        unit_name: unit?.name || null,
        unit_title: unit?.title || null,
        access_reason: mode
      }
    };
  }

  function closeAccessModal() {
    document.querySelector('.mailbox-access-modal')?.remove();
  }

  function showAccessModal(unit = null) {
    if (!isNormalMember()) return;
    closeAccessModal();

    const copy = accessCopy(unit);
    const modal = document.createElement('div');
    modal.className = 'mailbox-access-modal';
    modal.innerHTML = `
      <section class="mailbox-access-card" role="dialog" aria-modal="true">
        <h2>${esc(copy.heading)}</h2>
        <p>${esc(copy.text)}</p>
        <div class="mailbox-access-actions">
          <button class="btn btn-accent" data-contact type="button">${esc(copy.button)}</button>
          <button class="btn btn-ghost" data-close type="button">Back</button>
        </div>
      </section>
    `;

    modal.querySelector('[data-close]').addEventListener('click', closeAccessModal);
    modal.addEventListener('click', e => {
      if (e.target === modal) closeAccessModal();
    });

    modal.querySelector('[data-contact]').addEventListener('click', () => {
      composeSeed = seedForAccess(unit);
      memberSelectedThreadId = null;
      closeAccessModal();
      state.view = 'mailbox';
      render();
    });

    document.body.appendChild(modal);
  }

  function enhanceLockedUnitTiles() {
    if (!isNormalMember() || state.view !== 'units' || !state.grade) return;

    const units = state.units.filter(u => u.grade_id === state.grade.id);
    const byName = new Map(units.map(u => [String(u.name).trim(), u]));

    els.content.querySelectorAll('.menu-tile.locked').forEach(tile => {
      if (tile.dataset.mailboxLockEnhanced === 'true') return;
      const name = tile.querySelector('.tile-title')?.textContent?.trim();
      const unit = byName.get(name);
      if (!unit) return;

      // Clone strips the old "toast only" click handler.
      const clone = tile.cloneNode(true);
      clone.dataset.mailboxLockEnhanced = 'true';
      clone.addEventListener('click', e => {
        e.preventDefault();
        showAccessModal(unit);
      });
      tile.replaceWith(clone);
    });
  }

  function enhanceTrialBanner() {
    if (!isNormalMember() || state.view !== 'years') return;
    const banner = els.content.querySelector('.v18-trial-banner');
    if (!banner || banner.querySelector('.mailbox-trial-action')) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-small btn-accent mailbox-trial-action';
    btn.textContent = banner.classList.contains('expired')
      ? '📨 Contact Admin to Continue'
      : '📨 Ask About More Access';

    btn.addEventListener('click', () => {
      composeSeed = seedForAccess(null);
      if (!banner.classList.contains('expired')) {
        composeSeed.subject = 'Ask about more access during my trial';
        composeSeed.body =
          'My 3-day trial is active and I would like information about accessing more Pawn to Professor content.';
        composeSeed.context.source = 'trial_banner';
      }
      state.view = 'mailbox';
      render();
    });

    banner.appendChild(btn);
  }

  function enhanceLearnerEmptyTopics() {
    if (!isNormalMember() || state.profile?.member_type !== 'learner' || state.view !== 'topics') return;
    if (trialMode() !== 'expired') return;

    const empty = els.content.querySelector('.empty-state');
    if (!empty || empty.querySelector('.mailbox-expired-contact')) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-accent mailbox-expired-contact';
    btn.textContent = '📨 Contact Admin to Continue';
    btn.addEventListener('click', () => {
      composeSeed = seedForAccess(null);
      state.view = 'mailbox';
      render();
    });

    empty.appendChild(document.createElement('br'));
    empty.appendChild(btn);
  }

  function enhanceAfterRender() {
    if (!isNormalMember()) return;

    clearTimeout(homeEnhanceTimer);
    homeEnhanceTimer = setTimeout(() => {
      enhanceMemberHome();
      enhanceLockedUnitTiles();
      enhanceTrialBanner();
      enhanceLearnerEmptyTopics();
    }, 0);

    setTimeout(() => {
      enhanceMemberHome();
      enhanceLockedUnitTiles();
      enhanceTrialBanner();
      enhanceLearnerEmptyTopics();
    }, 80);
  }

  // -----------------------------------------------------------------------
  // Admin Messages
  // -----------------------------------------------------------------------
  async function renderAdminMessages(panel) {
    panel.innerHTML = `
      <h2>📨 Messages</h2>
      <p class="admin-note">
        Private member support, access and payment conversations.
        A new member message emails Stéphane and every active Admin/Owner.
      </p>
      <div id="mailboxAdminArea"><div class="empty-state" style="height:120px">Loading messages…</div></div>
    `;

    let threads;
    try {
      threads = await loadThreads({ admin:true });
    } catch (err) {
      panel.querySelector('#mailboxAdminArea').innerHTML =
        `<div class="empty-state">${esc(err.message)}</div>`;
      return;
    }

    if (state.adminTab !== 'messages') return;

    const members = await loadProfiles(threads.map(t => t.member_id));
    const area = panel.querySelector('#mailboxAdminArea');

    if (adminSelectedThreadId) {
      const thread = threads.find(t => t.id === adminSelectedThreadId);
      if (thread) {
        await renderAdminThread(area, thread, members.get(thread.member_id));
        renderAdminWelcomeSettings(panel);
        return;
      }
      adminSelectedThreadId = null;
    }

    area.innerHTML = `
      <div class="mailbox-admin-filter">
        <input id="mailboxAdminSearch" class="admin-search" placeholder="Search member, subject or category">
        <select id="mailboxAdminStatus">
          <option value="">All statuses</option>
          ${Object.entries(STATUS_LABELS).map(([value,label]) =>
            `<option value="${value}">${esc(label)}</option>`
          ).join('')}
        </select>
      </div>

      <div id="mailboxAdminList" class="mailbox-list">
        ${threads.length
          ? threads.map(t => threadCard(t, { admin:true, member:members.get(t.member_id) })).join('')
          : '<div class="empty-state" style="height:120px">No private member messages yet.</div>'}
      </div>
    `;

    const filter = () => {
      const search = area.querySelector('#mailboxAdminSearch').value.trim().toLowerCase();
      const status = area.querySelector('#mailboxAdminStatus').value;

      area.querySelectorAll('[data-thread-id]').forEach(btn => {
        const thread = threads.find(t => t.id === btn.dataset.threadId);
        const member = members.get(thread?.member_id);
        const text = `${thread?.subject || ''} ${thread?.category || ''} ${member?.username || ''} ${member?.display_name || ''}`.toLowerCase();
        btn.hidden = !!((search && !text.includes(search)) || (status && thread?.status !== status));
      });
    };

    area.querySelector('#mailboxAdminSearch').addEventListener('input', filter);
    area.querySelector('#mailboxAdminStatus').addEventListener('change', filter);

    area.querySelectorAll('[data-thread-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        adminSelectedThreadId = btn.dataset.threadId;
        renderAdminMessages(panel);
      });
    });

    renderAdminWelcomeSettings(panel);
  }

  async function renderAdminThread(area, thread, member) {
    let messages;
    try {
      messages = await loadMessages(thread.id);
      await api({ action:'mark_read', threadId:thread.id }).catch(() => {});
    } catch (err) {
      area.innerHTML = `<div class="empty-state">${esc(err.message)}</div>`;
      return;
    }

    const senders = await loadProfiles(messages.map(m => m.sender_id));

    area.innerHTML = `
      <div class="mailbox-thread-head">
        <div>
          <button id="mailboxAdminBack" class="btn btn-small btn-ghost" type="button">← All Messages</button>
          <h3>${esc(thread.subject)}</h3>
          <div class="meta">
            ${esc(member?.display_name || member?.username || 'Member')}
            ${member?.username ? `· ${esc(member.username)}` : ''}
            · ${esc(CATEGORY_LABELS[thread.category] || thread.category)}
          </div>
        </div>
        ${statusPill(thread.status)}
      </div>

      <div class="mailbox-thread-admin-actions">
        <label>
          Workflow status
          <select id="mailboxThreadStatus">
            ${Object.entries(STATUS_LABELS).map(([value,label]) =>
              `<option value="${value}" ${thread.status===value?'selected':''}>${esc(label)}</option>`
            ).join('')}
          </select>
        </label>
        <button id="mailboxManageAccess" class="btn btn-small btn-ghost" type="button">👤 Manage Member Access</button>\n        <button id="mailboxRecordPayment" class="btn btn-small btn-accent" type="button">💰 Record Payment</button>
      </div>

      <div class="mailbox-messages">
        ${messages.map(m => {
          const sender = senders.get(m.sender_id);
          const label = m.sender_kind === 'member'
            ? (sender?.display_name || sender?.username || 'Member')
            : (sender?.display_name || sender?.username || 'Pawn to Professor Admin');

          return `
            <article class="mailbox-message ${esc(m.sender_kind)}">
              <div class="mailbox-message-label">
                <strong>${esc(label)}</strong>
                <span>${new Date(m.created_at).toLocaleString()}</span>
              </div>
              <div class="mailbox-message-body">${esc(m.body)}</div>
            </article>`;
        }).join('')}
      </div>

      <div class="mailbox-reply">
        <label>
          Reply privately to ${esc(member?.display_name || member?.username || 'member')}
          <textarea id="mailboxAdminReply" maxlength="8000" placeholder="Write your reply…"></textarea>
        </label>
        <button id="mailboxAdminSendReply" class="btn btn-accent" type="button">Send Reply</button>
      </div>
    `;

    area.querySelector('#mailboxAdminBack').addEventListener('click', () => {
      adminSelectedThreadId = null;
      const panel = area.closest('#adminPanel');
      renderAdminMessages(panel);
    });

    area.querySelector('#mailboxThreadStatus').addEventListener('change', async e => {
      try {
        await api({
          action:'set_status',
          threadId:thread.id,
          status:e.target.value
        });
        toast(`Message status: ${STATUS_LABELS[e.target.value]}.`);
      } catch (err) {
        toast(err.message);
        e.target.value = thread.status;
      }
    });

    area.querySelector('#mailboxManageAccess').addEventListener('click', async () => {
      const target = state.adminUsers.find(u => u.id === thread.member_id);
      if (!target) {
        await loadAdminUsers();
      }
      state.selectedAdminUser = state.adminUsers.find(u => u.id === thread.member_id) || null;
      state.adminTab = 'users';
      render();
    });

    area.querySelector('#mailboxRecordPayment')?.addEventListener('click', () => {
      if (globalThis.PTP_PAYMENTS?.openRecordPayment) {
        globalThis.PTP_PAYMENTS.openRecordPayment(thread.member_id, thread.id);
      } else {
        toast('Payments module is still loading.');
      }
    });

    area.querySelector('#mailboxAdminSendReply').addEventListener('click', async e => {
      const body = area.querySelector('#mailboxAdminReply').value.trim();
      if (!body) return toast('Write a reply first.');

      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = 'Sending…';

      try {
        await api({ action:'reply', threadId:thread.id, body });
        toast('Reply sent. The member was emailed.');
        renderAdminMessages(area.closest('#adminPanel'));
      } catch (err) {
        toast(err.message);
        btn.disabled = false;
        btn.textContent = 'Send Reply';
      }
    });
  }

  async function renderAdminWelcomeSettings(panel) {
    if (panel.querySelector('.mailbox-admin-settings')) return;

    const wrap = document.createElement('div');
    wrap.className = 'mailbox-admin-settings';
    wrap.innerHTML = `
      <details>
        <summary>⚙️ Mailbox & Welcome Settings</summary>
        <div class="mailbox-admin-settings-grid">
          <label>
            Teacher welcome message
            <textarea id="mailboxWelcomeTeacher"></textarea>
          </label>
          <label>
            Learner welcome message
            <textarea id="mailboxWelcomeLearner"></textarea>
          </label>
        </div>
        <p class="admin-note">Use <strong>{{name}}</strong> where you want the member's display name inserted.</p>
        <label class="checkbox-card">
          <input id="mailboxEmailToggle" type="checkbox">
          Email notifications for private mailbox messages and Admin replies
        </label>
        <button id="mailboxSaveSettings" class="btn btn-accent btn-small" type="button">Save Mailbox Settings</button>
      </details>
    `;
    panel.appendChild(wrap);

    const { data, error } = await state.client
      .from('portal_settings')
      .select('welcome_teacher_message,welcome_learner_message,support_email_notifications_enabled')
      .eq('id',1)
      .maybeSingle();

    if (error) {
      wrap.innerHTML = `<p class="admin-note">${esc(error.message)}</p>`;
      return;
    }

    wrap.querySelector('#mailboxWelcomeTeacher').value = data?.welcome_teacher_message || '';
    wrap.querySelector('#mailboxWelcomeLearner').value = data?.welcome_learner_message || '';
    wrap.querySelector('#mailboxEmailToggle').checked = data?.support_email_notifications_enabled !== false;

    wrap.querySelector('#mailboxSaveSettings').addEventListener('click', async () => {
      const patch = {
        welcome_teacher_message: wrap.querySelector('#mailboxWelcomeTeacher').value.trim(),
        welcome_learner_message: wrap.querySelector('#mailboxWelcomeLearner').value.trim(),
        support_email_notifications_enabled: wrap.querySelector('#mailboxEmailToggle').checked,
        updated_at: new Date().toISOString(),
        updated_by: state.session.user.id
      };

      const { error:updateError } = await state.client
        .from('portal_settings')
        .update(patch)
        .eq('id',1);

      if (updateError) return toast(updateError.message);
      Object.assign(state.settings, patch);
      await logAudit('mailbox_settings_updated','portal_settings','1',{
        email_notifications: patch.support_email_notifications_enabled
      });
      toast('Mailbox and welcome settings saved.');
    });
  }

  // -----------------------------------------------------------------------
  // Approval interception:
  // clone the Approve button AFTER v1.8 rendered it, removing its older
  // direct database click handler, then use the secure approval endpoint.
  // -----------------------------------------------------------------------
  if (typeof renderAdminRequests === 'function') {
    const nativeRequestsMailbox = renderAdminRequests;

    renderAdminRequests = function (panel) {
      nativeRequestsMailbox(panel);

      const pending = state.adminUsers.filter(u => u.status === 'pending');
      const cards = [...panel.querySelectorAll('.request-card')];

      cards.forEach((card, index) => {
        const user = pending[index];
        const oldBtn = card.querySelector('[data-approve]');
        if (!user || !oldBtn || oldBtn.dataset.mailboxApproval === 'true') return;

        const btn = oldBtn.cloneNode(true);
        btn.dataset.mailboxApproval = 'true';
        oldBtn.replaceWith(btn);

        btn.addEventListener('click', async e => {
          e.preventDefault();
          e.stopPropagation();
          btn.disabled = true;
          btn.textContent = 'Approving…';

          try {
            const headers = await authHeaders();
            const res = await fetch('/api/security?action=approve-registration', {
              method:'POST',
              headers,
              cache:'no-store',
              body:JSON.stringify({ userId:user.id })
            });
            const body = await res.json().catch(() => ({}));

            if (!res.ok) throw new Error(body.error || 'Could not approve registration.');

            toast(
              body.welcomeWarning
                ? `${user.username} approved. Trial started; welcome message needs attention.`
                : `${user.username} approved. Trial started and private welcome message sent.`
            );

            await loadAdminUsers();
            render();
          } catch (err) {
            toast(err.message);
            btn.disabled = false;
            btn.textContent = 'Approve';
          }
        });
      });
    };
  }

  // -----------------------------------------------------------------------
  // Locked Unit interception for Teachers / normal members that browse the
  // Curriculum tree. Learners remain Topic-only as designed in v1.9.3.
  // -----------------------------------------------------------------------
  if (typeof renderUnits === 'function') {
    const nativeRenderUnitsMailbox = renderUnits;
    renderUnits = function (...args) {
      const result = nativeRenderUnitsMailbox(...args);
      setTimeout(enhanceLockedUnitTiles, 0);
      return result;
    };
  }

  // -----------------------------------------------------------------------
  // Admin tab
  // -----------------------------------------------------------------------
  if (typeof renderAdmin === 'function') {
    const nativeRenderAdminMailbox = renderAdmin;

    renderAdmin = function (...args) {
      nativeRenderAdminMailbox(...args);

      const tabs = els.content.querySelector('.admin-tabs');
      const panel = els.content.querySelector('#adminPanel');
      if (!tabs || !panel) return;

      let btn = [...tabs.querySelectorAll('button')].find(node =>
        /📨\s*Messages|Messages\s*\(/i.test(node.textContent || '')
      );

      if (!btn) {
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-ghost';
        btn.textContent = '📨 Messages';
        tabs.appendChild(btn);
      }

      const cleanBtn = btn.cloneNode(true);
      cleanBtn.classList.toggle('active', state.adminTab === 'messages');
      btn.replaceWith(cleanBtn);

      cleanBtn.addEventListener('click', () => {
        state.adminTab = 'messages';
        adminSelectedThreadId = null;
        render();
      });

      unreadAdminCount().then(count => {
        if (!cleanBtn.isConnected) return;
        cleanBtn.textContent = count > 0 ? `📨 Messages (${count})` : '📨 Messages';
      }).catch(() => {});

      if (state.adminTab === 'messages') {
        renderAdminMessages(panel);
      }
    };
  }

  // -----------------------------------------------------------------------
  // Custom member mailbox route + post-render enhancement.
  // -----------------------------------------------------------------------
  const nativeRenderMailbox = render;

  render = async function (...args) {
    if (state.view === 'mailbox') {
      els.content.innerHTML = '';
      await renderMemberMailbox();
      return;
    }

    const result = await nativeRenderMailbox(...args);
    enhanceAfterRender();
    return result;
  };

  // Back button: handle mailbox before app.js's ordinary navigation handler.
  els.backBtn.addEventListener('click', e => {
    if (state.view !== 'mailbox') return;

    e.preventDefault();
    e.stopImmediatePropagation();

    if (composeSeed) {
      composeSeed = null;
      render();
      return;
    }

    if (memberSelectedThreadId) {
      memberSelectedThreadId = null;
      render();
      return;
    }

    state.view = 'years';
    render();
  }, true);

  // Keep mailbox available even after the trial expires.
  const observer = new MutationObserver(() => {
    if (!state.profile) return;
    enhanceAfterRender();
  });

  const startObserver = () => {
    if (els?.content) observer.observe(els.content, { childList:true, subtree:true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver, { once:true });
  } else {
    startObserver();
  }

  globalThis.PTP_MAILBOX = {
    version: VERSION,
    open: (seed = null) => {
      if (!isNormalMember()) return;
      composeSeed = seed;
      memberSelectedThreadId = null;
      state.view = 'mailbox';
      render();
    },
    showAccess: showAccessModal
  };
})();
