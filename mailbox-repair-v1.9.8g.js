/* Pawn to Professor v1.9.8g — Mailbox Repair
   Load LAST, after admin-menu-v1.9.8.js and any performance patch.
*/
(() => {
  if (typeof state === 'undefined' || typeof renderAdmin === 'undefined') return;

  const VERSION = '1.9.8g';
  let selectedThreadId = null;
  let selectedUserId = null;

  function esc(v='') {
    if (typeof escapeHtml === 'function') return escapeHtml(v);
    return String(v).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  async function authJson(url, payload) {
    const headers = await authHeaders();
    const res = await fetch(url, {
      method:'POST',
      headers,
      cache:'no-store',
      body:JSON.stringify(payload)
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'Mailbox action failed.');
    return body;
  }

  const supportApi = payload =>
    authJson('/api/security?action=support-message', payload);

  const deleteApi = payload =>
    authJson('/api/security?action=support-message', payload);

  async function loadThreads() {
    let q = state.client
      .from('support_threads')
      .select('*')
      .order('last_message_at', { ascending:false });

    if (selectedUserId) q = q.eq('member_id', selectedUserId);

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
    const clean = [...new Set((ids || []).filter(Boolean))];
    if (!clean.length) return new Map();

    const { data, error } = await state.client
      .from('profiles')
      .select('id,username,display_name,contact_email,member_type,role,status')
      .in('id', clean);

    if (error) return new Map();
    return new Map((data || []).map(p => [p.id,p]));
  }

  function memberName(member) {
    return member?.display_name || member?.username || 'Member';
  }

  function categoryLabel(value='') {
    return ({
      general:'General',
      access_payment:'Access / Payment',
      technical:'Technical',
      account:'Account',
      welcome:'Welcome',
      other:'Other'
    })[value] || value;
  }

  function statusLabel(value='') {
    return ({
      new:'New',
      awaiting_payment:'Awaiting Payment',
      payment_received:'Payment Received',
      access_granted:'Access Granted',
      closed:'Closed'
    })[value] || value;
  }

  function receipt(m) {
    if (!['admin','system'].includes(m.sender_kind)) return '';
    if (m.read_at) return `<div class="mailbox-receipt read">✓✓ Read · ${esc(new Date(m.read_at).toLocaleString())}</div>`;
    if (m.delivered_at) return `<div class="mailbox-receipt delivered">✓✓ Delivered · ${esc(new Date(m.delivered_at).toLocaleString())}</div>`;
    return `<div class="mailbox-receipt sent">✓ Sent · ${esc(new Date(m.created_at).toLocaleString())}</div>`;
  }

  function openCompose({ userId = '' } = {}) {
    document.querySelector('.v198g-compose-modal')?.remove();

    const members = (state.adminUsers || [])
      .filter(u => u.role === 'user' && u.status === 'active')
      .sort((a,b) => memberName(a).localeCompare(memberName(b)));

    const modal = document.createElement('div');
    modal.className = 'mailbox-admin-compose-modal v198g-compose-modal';
    modal.innerHTML = `
      <section class="mailbox-admin-compose-card" role="dialog" aria-modal="true">
        <div class="mailbox-compose-head">
          <div>
            <h2>📨 New Message</h2>
            <p>Private message from Admin to a Teacher or Learner.</p>
          </div>
          <button class="btn btn-small btn-ghost" data-close type="button">✕</button>
        </div>

        <div class="mailbox-admin-compose-grid">
          <label class="wide">
            Member
            <select data-member>
              <option value="">Choose member…</option>
              ${members.map(m => `
                <option value="${m.id}" ${m.id===userId?'selected':''}>
                  ${esc(memberName(m))} · ${esc(m.member_type || 'member')} · ${esc(m.username || '')}
                </option>`).join('')}
            </select>
          </label>

          <label>
            Category
            <select data-category>
              <option value="general">General</option>
              <option value="access_payment">Access / Payment</option>
              <option value="technical">Technical</option>
              <option value="account">Account</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label class="wide">
            Subject
            <input data-subject maxlength="180" placeholder="Message subject">
          </label>

          <label class="wide">
            Message
            <textarea data-body maxlength="8000" rows="7" placeholder="Write your message…"></textarea>
          </label>

          <label class="checkbox-card wide">
            <input data-email type="checkbox" checked>
            Also send an email notification
          </label>
        </div>

        <div class="button-row">
          <button class="btn btn-ghost" data-close type="button">Cancel</button>
          <button class="btn btn-accent" data-send type="button">Send Private Message</button>
        </div>
      </section>
    `;

    modal.querySelectorAll('[data-close]').forEach(btn =>
      btn.addEventListener('click', () => modal.remove())
    );

    const sendBtn = modal.querySelector('[data-send]');
    sendBtn.addEventListener('click', async () => {
      if (sendBtn.disabled) return;

      const memberId = modal.querySelector('[data-member]').value;
      const subject = modal.querySelector('[data-subject]').value.trim();
      const body = modal.querySelector('[data-body]').value.trim();
      const category = modal.querySelector('[data-category]').value;
      const sendEmail = modal.querySelector('[data-email]').checked;

      if (!memberId) return toast('Choose a member.');
      if (!subject || !body) return toast('Add a subject and message.');

      sendBtn.disabled = true;
      sendBtn.textContent = 'Sending…';

      let result;
      try {
        result = await supportApi({
          action:'admin_broadcast',
          audience:'one',
          userIds:[memberId],
          category,
          subject,
          body,
          sendEmail
        });
      } catch (err) {
        toast(err.message || 'Message could not be sent.');
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send Private Message';
        return;
      }

      modal.remove();
      selectedThreadId = null;
      selectedUserId = memberId;
      toast(
        `Message delivered.${result.emailFailed ? ' Mailbox delivery succeeded; email notification failed.' : ''}`
      );

      if (state.view === 'admin') {
        state.adminTab = 'messages';
        render();
      }
    });

    document.body.appendChild(modal);
  }

  async function renderThread(panel, thread, member) {
    const messages = await loadMessages(thread.id);
    const senders = await loadProfiles(messages.map(m => m.sender_id));

    await supportApi({ action:'mark_read', threadId:thread.id }).catch(() => {});

    panel.innerHTML = `
      <div class="mailbox-thread-head">
        <div>
          <button id="v198gBack" class="btn btn-small btn-ghost" type="button">← All Messages</button>
          <h2>${esc(thread.subject)}</h2>
          <div class="meta">
            ${esc(memberName(member))}
            ${member?.username ? `· ${esc(member.username)}` : ''}
            · ${esc(categoryLabel(thread.category))}
          </div>
        </div>
        <span class="mailbox-status ${esc(thread.status)}">${esc(statusLabel(thread.status))}</span>
      </div>

      <div class="mailbox-thread-admin-actions">
        <label>
          Workflow status
          <select id="v198gStatus">
            ${['new','awaiting_payment','payment_received','access_granted','closed'].map(s =>
              `<option value="${s}" ${thread.status===s?'selected':''}>${esc(statusLabel(s))}</option>`
            ).join('')}
          </select>
        </label>
        <button id="v198gManageUser" class="btn btn-small btn-ghost" type="button">👤 Manage User</button>
        <button id="v198gDeleteThread" class="btn btn-small btn-danger" type="button">🗑 Delete Conversation</button>
      </div>

      <div class="mailbox-messages">
        ${messages.map(m => {
          const sender = senders.get(m.sender_id);
          const label = m.sender_kind === 'member'
            ? memberName(sender || member)
            : (sender ? memberName(sender) : 'Pawn to Professor Admin');

          return `
            <article class="mailbox-message ${esc(m.sender_kind)}" data-message="${m.id}">
              <div class="mailbox-message-label">
                <strong>${esc(label)}</strong>
                <span>${esc(new Date(m.created_at).toLocaleString())}</span>
              </div>
              <div class="mailbox-message-body">${esc(m.body)}</div>
              ${receipt(m)}
              <div style="margin-top:.45em">
                <button class="btn btn-small btn-danger" data-delete-message="${m.id}" type="button">🗑 Delete Message</button>
              </div>
            </article>`;
        }).join('')}
      </div>

      <div class="mailbox-reply">
        <label>
          Reply privately to ${esc(memberName(member))}
          <textarea id="v198gReply" maxlength="8000" placeholder="Write your reply…"></textarea>
        </label>
        <button id="v198gSendReply" class="btn btn-accent" type="button">Send Reply</button>
      </div>
    `;

    panel.querySelector('#v198gBack').addEventListener('click', () => {
      selectedThreadId = null;
      renderAdminMailbox(panel);
    });

    panel.querySelector('#v198gStatus').addEventListener('change', async e => {
      const old = thread.status;
      try {
        await supportApi({
          action:'set_status',
          threadId:thread.id,
          status:e.target.value
        });
        thread.status = e.target.value;
        toast(`Message status: ${statusLabel(e.target.value)}.`);
      } catch (err) {
        e.target.value = old;
        toast(err.message);
      }
    });

    panel.querySelector('#v198gManageUser').addEventListener('click', async () => {
      if (!state.adminUsers?.length) await loadAdminUsers();
      state.selectedAdminUser = state.adminUsers.find(u => u.id === thread.member_id) || null;
      state.adminTab = 'users';
      render();
    });

    panel.querySelector('#v198gDeleteThread').addEventListener('click', async () => {
      const confirmText = prompt(
        `Permanently delete this whole conversation and all its messages?\n\nSubject: ${thread.subject}\n\nType DELETE to confirm:`
      );
      if (confirmText !== 'DELETE') return;

      try {
        await deleteApi({ action:'delete_thread', threadId:thread.id });
        selectedThreadId = null;
        toast('Conversation deleted.');
        renderAdminMailbox(panel);
      } catch (err) {
        toast(err.message);
      }
    });

    panel.querySelectorAll('[data-delete-message]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Permanently delete this message?')) return;
        btn.disabled = true;
        try {
          const result = await deleteApi({
            action:'delete_message',
            messageId:btn.dataset.deleteMessage
          });
          toast(result.threadDeleted
            ? 'Message deleted. The empty conversation was also removed.'
            : 'Message deleted.');
          if (result.threadDeleted) {
            selectedThreadId = null;
            renderAdminMailbox(panel);
          } else {
            renderThread(panel, thread, member);
          }
        } catch (err) {
          toast(err.message);
          btn.disabled = false;
        }
      });
    });

    const replyBtn = panel.querySelector('#v198gSendReply');
    replyBtn.addEventListener('click', async () => {
      if (replyBtn.disabled) return;
      const body = panel.querySelector('#v198gReply').value.trim();
      if (!body) return toast('Write a reply first.');

      replyBtn.disabled = true;
      replyBtn.textContent = 'Sending…';

      try {
        await supportApi({ action:'reply', threadId:thread.id, body });
      } catch (err) {
        toast(err.message || 'Reply could not be sent.');
        replyBtn.disabled = false;
        replyBtn.textContent = 'Send Reply';
        return;
      }

      toast('Reply sent.');
      try {
        await renderThread(panel, thread, member);
      } catch (err) {
        toast(`Reply sent. Conversation refresh had a problem: ${err.message || err}`);
      }
    });
  }

  async function renderAdminMailbox(panel) {
    panel.innerHTML = `
      <div class="mailbox-toolbar">
        <div>
          <h2>📨 Messages</h2>
          <p class="admin-note">
            Admin can message Teachers and Learners. Members can message Admin only.
          </p>
        </div>
        <button id="v198gNewMessage" class="btn btn-accent" type="button">+ New Message</button>
      </div>
      <div id="v198gMailboxArea">
        <div class="empty-state" style="height:120px">Loading messages…</div>
      </div>
    `;

    const threads = await loadThreads();
    const members = await loadProfiles(threads.map(t => t.member_id));
    const area = panel.querySelector('#v198gMailboxArea');

    panel.querySelector('#v198gNewMessage').addEventListener('click', () =>
      openCompose(selectedUserId ? { userId:selectedUserId } : {})
    );

    if (selectedThreadId) {
      const thread = threads.find(t => t.id === selectedThreadId);
      if (thread) {
        await renderThread(panel, thread, members.get(thread.member_id));
        return;
      }
      selectedThreadId = null;
    }

    area.innerHTML = `
      <div class="mailbox-admin-filter">
        <input id="v198gSearch" class="admin-search" placeholder="Search member, subject or category">
        <select id="v198gStatusFilter">
          <option value="">All statuses</option>
          ${['new','awaiting_payment','payment_received','access_granted','closed'].map(s =>
            `<option value="${s}">${esc(statusLabel(s))}</option>`
          ).join('')}
        </select>
        ${selectedUserId ? `<button id="v198gClearUser" class="btn btn-small btn-ghost" type="button">Show All Members</button>` : ''}
      </div>

      <div class="mailbox-list">
        ${threads.length ? threads.map(t => {
          const m = members.get(t.member_id);
          const unread = Number(t.admin_unread_count || 0);
          return `
            <button class="mailbox-thread-card ${unread?'unread':''}" data-thread="${t.id}" type="button">
              <span>
                <strong>${esc(t.subject)}</strong>
                <small>${esc(memberName(m))} · ${esc(categoryLabel(t.category))} · ${esc(new Date(t.last_message_at).toLocaleString())}</small>
              </span>
              <span>
                ${unread ? `<span class="mailbox-unread-pill">${unread}</span>` : ''}
                <span class="mailbox-status ${esc(t.status)}">${esc(statusLabel(t.status))}</span>
              </span>
            </button>`;
        }).join('') : '<div class="empty-state" style="height:120px">No messages found.</div>'}
      </div>
    `;

    const filter = () => {
      const q = area.querySelector('#v198gSearch').value.trim().toLowerCase();
      const status = area.querySelector('#v198gStatusFilter').value;
      area.querySelectorAll('[data-thread]').forEach(btn => {
        const t = threads.find(x => x.id === btn.dataset.thread);
        const m = members.get(t?.member_id);
        const text = `${t?.subject||''} ${t?.category||''} ${memberName(m)} ${m?.username||''}`.toLowerCase();
        btn.hidden = !!((q && !text.includes(q)) || (status && t?.status !== status));
      });
    };

    area.querySelector('#v198gSearch').addEventListener('input', filter);
    area.querySelector('#v198gStatusFilter').addEventListener('change', filter);

    area.querySelector('#v198gClearUser')?.addEventListener('click', () => {
      selectedUserId = null;
      selectedThreadId = null;
      renderAdminMailbox(panel);
    });

    area.querySelectorAll('[data-thread]').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedThreadId = btn.dataset.thread;
        renderAdminMailbox(panel);
      });
    });
  }

  const previousRenderAdmin = renderAdmin;
  renderAdmin = function(...args) {
    const result = previousRenderAdmin(...args);

    const tabs = els.content.querySelector('.admin-tabs');
    const panel = els.content.querySelector('#adminPanel');
    if (!tabs || !panel) return result;

    const matches = [...tabs.querySelectorAll('button')].filter(btn =>
      /📨\s*Messages|^Messages(?:\s*\(\d+\))?$/i.test((btn.textContent||'').trim())
    );

    let button = matches.shift() || document.createElement('button');
    matches.forEach(b => b.remove());

    if (!button.isConnected) {
      button.type = 'button';
      button.className = 'btn btn-ghost';
      tabs.appendChild(button);
    }

    const clean = button.cloneNode(true);
    clean.textContent = '📨 Messages';
    clean.classList.toggle('active', state.adminTab === 'messages');
    button.replaceWith(clean);

    clean.addEventListener('click', () => {
      state.adminTab = 'messages';
      selectedThreadId = null;
      selectedUserId = null;
      render();
    });

    const dashboard = [...tabs.querySelectorAll('button')].find(b =>
      /Dashboard/i.test(b.textContent || '')
    );
    if (dashboard?.nextSibling !== clean) {
      tabs.insertBefore(clean, dashboard?.nextSibling || tabs.firstChild);
    }

    if (state.adminTab === 'messages') {
      renderAdminMailbox(panel).catch(err => {
        panel.innerHTML = `<div class="empty-state">${esc(err.message || 'Could not load messages.')}</div>`;
      });
    }

    return result;
  };

  if (typeof renderAdminUserPermissions === 'function') {
    const previousUserPermissions = renderAdminUserPermissions;

    renderAdminUserPermissions = async function(container, user) {
      await previousUserPermissions(container, user);
      if (!container || !user || user.role !== 'user') return;

      if (container.querySelector('[data-v198g-user-mailbox]')) return;

      const row = document.createElement('div');
      row.dataset.v198gUserMailbox = 'true';
      row.className = 'button-row';
      row.style.marginBottom = '.7em';
      row.innerHTML = `
        <button class="btn btn-small btn-accent" data-message-user type="button">📨 Message ${esc(user.display_name || user.username)}</button>
        <button class="btn btn-small btn-ghost" data-open-user-mailbox type="button">📬 Open Mailbox</button>
      `;

      const heading = container.querySelector('h3');
      if (heading) heading.insertAdjacentElement('afterend', row);
      else container.prepend(row);

      row.querySelector('[data-message-user]').addEventListener('click', () => {
        openCompose({ userId:user.id });
      });

      row.querySelector('[data-open-user-mailbox]').addEventListener('click', () => {
        selectedUserId = user.id;
        selectedThreadId = null;
        state.adminTab = 'messages';
        render();
      });
    };
  }

  globalThis.PTP_MAILBOX_REPAIR = {
    version:VERSION,
    openForUser(userId) {
      selectedUserId = userId || null;
      selectedThreadId = null;
      state.adminTab = 'messages';
      render();
    }
  };
})();
