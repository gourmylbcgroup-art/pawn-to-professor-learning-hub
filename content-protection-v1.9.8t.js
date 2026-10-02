/* Pawn to Professor v1.9.8t — Content Protection / Screenshot Deterrence
   Load on BOTH:
   - index.html
   - play.html

   IMPORTANT:
   This is deterrence, not absolute screenshot prevention.
   A browser must receive visible content in order to display it.
*/
(() => {
  'use strict';

  const VERSION = '1.9.8t';
  const WATERMARK_ID = 'ptp-protection-watermark';
  const NOTICE_ID = 'ptp-protection-notice';
  const CLASS = 'ptp-protected-content';
  let currentLabel = '';
  let applied = false;

  function esc(v='') {
    return String(v).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function isEditable(target) {
    if (!target) return false;
    return !!target.closest?.('input,textarea,select,[contenteditable="true"],[contenteditable=""]');
  }

  function protectRoot() {
    // Main portal page
    const portal = document.getElementById('portalView');
    if (portal && !portal.classList.contains('hidden')) return portal;

    // Secure player page
    const player = document.getElementById('playerShell');
    if (player) return player;

    return document.body;
  }

  function watermarkText(label) {
    const who = label ? `Licensed to: ${label}` : 'Authorized member';
    return `${who} • pawntoprofessor.com`;
  }

  function renderWatermark(label) {
    currentLabel = label || currentLabel || 'Authorized member';

    let wm = document.getElementById(WATERMARK_ID);
    if (!wm) {
      wm = document.createElement('div');
      wm.id = WATERMARK_ID;
      wm.setAttribute('aria-hidden','true');
      document.body.appendChild(wm);
    }

    const text = watermarkText(currentLabel);
    wm.innerHTML = Array.from({length:18}, (_,i) =>
      `<span>${esc(text)}</span>`
    ).join('');
  }

  function showNotice(message='Protected content — screenshots and copying are discouraged.') {
    let n = document.getElementById(NOTICE_ID);
    if (!n) {
      n = document.createElement('div');
      n.id = NOTICE_ID;
      n.setAttribute('role','status');
      document.body.appendChild(n);
    }
    n.textContent = message;
    n.classList.add('show');
    clearTimeout(n._hideTimer);
    n._hideTimer = setTimeout(() => n.classList.remove('show'), 1800);
  }

  function markProtected() {
    const root = protectRoot();
    root?.classList?.add(CLASS);
    document.documentElement.classList.add('ptp-protection-enabled');
    applied = true;
  }

  function installGuards() {
    if (document.documentElement.dataset.ptpProtectionGuards === '1') return;
    document.documentElement.dataset.ptpProtectionGuards = '1';

    // Disable context menu inside protected content.
    document.addEventListener('contextmenu', e => {
      if (!applied) return;
      if (isEditable(e.target)) return;
      e.preventDefault();
      showNotice('Right-click saving is disabled for protected content.');
    }, true);

    // Disable image/link dragging that makes casual saving easier.
    document.addEventListener('dragstart', e => {
      if (!applied) return;
      if (e.target?.closest?.('img,a,iframe,video,audio')) {
        e.preventDefault();
      }
    }, true);

    // Reduce casual clipboard copying while allowing form fields.
    document.addEventListener('copy', e => {
      if (!applied || isEditable(e.target)) return;
      const root = protectRoot();
      if (!root?.contains(e.target)) return;
      e.preventDefault();
      showNotice('Copying protected learning content is disabled.');
    }, true);

    document.addEventListener('cut', e => {
      if (!applied || isEditable(e.target)) return;
      const root = protectRoot();
      if (!root?.contains(e.target)) return;
      e.preventDefault();
    }, true);

    // Block obvious browser "save/print/view-source" shortcuts.
    // This is a deterrent only; it does not make browser assets impossible to inspect.
    document.addEventListener('keydown', e => {
      if (!applied) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = String(e.key || '').toLowerCase();

      if (mod && ['s','p','u'].includes(key)) {
        e.preventDefault();
        e.stopPropagation();
        showNotice('Saving/printing protected content is disabled.');
        return;
      }

      if (key === 'printscreen') {
        showNotice('This page is watermarked to the authorized account.');
      }
    }, true);

    // Prevent default print workflow from exposing clean content.
    window.addEventListener('beforeprint', () => {
      document.documentElement.classList.add('ptp-print-block');
    });
    window.addEventListener('afterprint', () => {
      document.documentElement.classList.remove('ptp-print-block');
    });

    // Keep newly inserted images non-draggable.
    const obs = new MutationObserver(() => {
      if (!applied) return;
      protectRoot()?.querySelectorAll?.('img').forEach(img => {
        img.draggable = false;
        img.setAttribute('draggable','false');
      });
    });
    obs.observe(document.documentElement, {childList:true,subtree:true});
  }

  async function getPortalMemberLabel() {
    try {
      if (globalThis.state?.profile) {
        const p = globalThis.state.profile;
        if (p.role === 'user') return p.username || p.display_name || 'Member';
        // Do not watermark Admin / Owner portal use.
        if (['admin','owner'].includes(p.role)) return null;
      }
    } catch {}
    return undefined;
  }

  async function getPlayerMemberLabel() {
    // play.html has Supabase JS already loaded.
    if (!globalThis.supabase?.createClient) return 'Authorized member';

    try {
      const cfgRes = await fetch('/api/config', {cache:'no-store'});
      if (!cfgRes.ok) return 'Authorized member';
      const cfg = await cfgRes.json();

      const client = globalThis.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth:{persistSession:true,autoRefreshToken:true}
      });

      const {data:{session}} = await client.auth.getSession();
      if (!session?.user?.id) return 'Authorized member';

      const {data:profile} = await client
        .from('profiles')
        .select('username,display_name,role')
        .eq('id',session.user.id)
        .maybeSingle();

      if (profile && ['admin','owner'].includes(profile.role)) return null;
      return profile?.username || profile?.display_name || 'Authorized member';
    } catch {
      return 'Authorized member';
    }
  }

  async function apply() {
    installGuards();

    const isPlayer = !!document.getElementById('playerShell');
    if (isPlayer) {
      const label = await getPlayerMemberLabel();
      if (label === null) return;
      markProtected();
      renderWatermark(label);
      return;
    }

    // Portal can boot asynchronously; wait for profile.
    for (let i=0; i<120; i++) {
      const label = await getPortalMemberLabel();

      if (label === null) {
        // Admin / Owner: do not interfere with normal management work.
        return;
      }

      if (label) {
        markProtected();
        renderWatermark(label);
        return;
      }

      await new Promise(r => setTimeout(r,100));
    }
  }

  // Re-check when portal visibility changes after login/logout.
  const bootObserver = new MutationObserver(() => {
    const portal = document.getElementById('portalView');
    if (!portal) return;

    if (!portal.classList.contains('hidden')) {
      apply();
    } else {
      document.documentElement.classList.remove('ptp-protection-enabled');
      document.getElementById(WATERMARK_ID)?.remove();
      applied = false;
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      bootObserver.observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:['class']});
      apply();
    }, {once:true});
  } else {
    bootObserver.observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:['class']});
    apply();
  }

  globalThis.PTP_CONTENT_PROTECTION = {
    version: VERSION,
    refresh: apply
  };
})();
