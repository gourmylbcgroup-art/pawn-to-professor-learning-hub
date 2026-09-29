/* Pawn to Professor v1.9.8h — Mailbox Home + Quick Delete
   Load AFTER mailbox-repair-v1.9.8g.js.

   Adds:
   - Admin/Owner home tile: 📨 Messages (unread count)
   - Quick 🗑 Delete Conversation beside each Admin mailbox thread
*/
(() => {
  if (typeof state === 'undefined' || typeof render === 'undefined') return;

  const VERSION = '1.9.8h';
  let observer = null;

  function isStaffAccount() {
    try { return typeof isStaff === 'function' && isStaff(); }
    catch { return ['admin','owner'].includes(state.profile?.role); }
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

  async function unreadCount() {
    const { data, error } = await state.client
      .from('support_threads')
      .select('admin_unread_count');

    if (error) return 0;
    return (data || []).reduce(
      (sum,row) => sum + Number(row.admin_unread_count || 0),
      0
    );
  }

  function openAdminMessages() {
    state.adminTab = 'messages';
    state.view = 'admin';
    render();
  }

  function addStaffHomeTile() {
    if (!isStaffAccount() || state.view !== 'years') return;

    const grid = els?.content?.querySelector('.tile-grid');
    if (!grid || grid.querySelector('[data-v198h-mailbox-home]')) return;

    const tile = makeTile({
      icon:'📨',
      title:'Messages',
      subtitle:'Open Admin mailbox',
      onClick:openAdminMessages
    });

    tile.dataset.v198hMailboxHome = 'true';
    grid.appendChild(tile);

    unreadCount().then(count => {
      if (!tile.isConnected) return;
      const subtitle = tile.querySelector('.tile-subtitle');
      if (subtitle) {
        subtitle.textContent = count > 0
          ? `${count} unread message${count === 1 ? '' : 's'}`
          : 'No unread messages';
      }
      const title = tile.querySelector('.tile-title');
      if (title) title.textContent = count > 0 ? `Messages (${count})` : 'Messages';
    }).catch(() => {});
  }

  async function deleteThread(threadId, row) {
    const confirmText = prompt(
      'Permanently delete this conversation and all of its messages?\n\nType DELETE to confirm:'
    );
    if (confirmText !== 'DELETE') return;

    const btn = row.querySelector('[data-v198h-delete-thread]');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Deleting…';
    }

    try {
      await authJson('/api/mailbox-admin-v1.9.8g', {
        action:'delete_thread',
        threadId
      });

      row.remove();
      toast('Conversation deleted.');

      const list = els?.content?.querySelector('.mailbox-list');
      if (list && !list.querySelector('[data-thread]')) {
        list.innerHTML =
          '<div class="empty-state" style="height:120px">No messages found.</div>';
      }

      // Refresh Admin menu/home unread count on the next ordinary render.
    } catch (err) {
      toast(err.message || 'Conversation could not be deleted.');
      if (btn) {
        btn.disabled = false;
        btn.textContent = '🗑 Delete';
      }
    }
  }

  function enhanceMailboxList() {
    if (!isStaffAccount()) return;
    if (state.view !== 'admin' || state.adminTab !== 'messages') return;

    const list = els?.content?.querySelector('.mailbox-list');
    if (!list) return;

    list.querySelectorAll('.mailbox-thread-card[data-thread]').forEach(card => {
      if (card.dataset.v198hWrapped === 'true') return;
      card.dataset.v198hWrapped = 'true';

      const threadId = card.dataset.thread;
      const row = document.createElement('div');
      row.className = 'v198h-mailbox-row';
      row.style.display = 'grid';
      row.style.gridTemplateColumns = 'minmax(0, 1fr) auto';
      row.style.gap = '.45em';
      row.style.alignItems = 'stretch';
      row.style.marginBottom = '.4em';

      card.parentNode.insertBefore(row, card);
      row.appendChild(card);

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn btn-small btn-danger';
      del.dataset.v198hDeleteThread = threadId;
      del.textContent = '🗑 Delete';
      del.title = 'Delete this conversation';

      del.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        deleteThread(threadId, row);
      });

      row.appendChild(del);
    });
  }

  // Wrap the home renderer so the staff mailbox tile is part of the normal UI.
  if (typeof renderYears === 'function') {
    const nativeRenderYearsV198h = renderYears;
    renderYears = function(...args) {
      const result = nativeRenderYearsV198h(...args);
      addStaffHomeTile();
      return result;
    };
  }

  // Also enhance after every top-level render.
  const nativeRenderV198h = render;
  render = async function(...args) {
    const result = await nativeRenderV198h(...args);
    setTimeout(() => {
      addStaffHomeTile();
      enhanceMailboxList();
    }, 0);
    return result;
  };

  // Mailbox list can redraw internally without calling the global render(),
  // so observe the content area and enhance new thread rows automatically.
  function startObserver() {
    if (observer || !els?.content) return;
    observer = new MutationObserver(() => {
      if (state.view === 'years') addStaffHomeTile();
      if (state.view === 'admin' && state.adminTab === 'messages') {
        enhanceMailboxList();
      }
    });
    observer.observe(els.content, { childList:true, subtree:true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver, { once:true });
  } else {
    startObserver();
  }

  globalThis.PTP_MAILBOX_UI = { version:VERSION };
})();
