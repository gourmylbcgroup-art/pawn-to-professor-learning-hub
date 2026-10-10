/* Pawn to Professor v1.9.8w — Learning Hub right-click / save-as blocker */
(() => {
  'use strict';
  const VERSION = '1.9.8w';
  const MEDIA_SELECTOR = [
    'img',
    'picture',
    'canvas',
    'svg',
    'video',
    '.resource-thumb',
    '.flashcard',
    '.slide-image',
    '.presentation-slide',
    '[data-protect-media]'
  ].join(',');

  function notice(text) {
    let el = document.getElementById('ptpProtectionNotice');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ptpProtectionNotice';
      Object.assign(el.style, {
        position: 'fixed',
        left: '50%',
        bottom: '18px',
        transform: 'translateX(-50%)',
        zIndex: '2147483647',
        background: 'rgba(11,47,39,.94)',
        color: '#fff',
        padding: '10px 14px',
        borderRadius: '999px',
        font: '700 12px/1.2 system-ui, sans-serif',
        boxShadow: '0 10px 28px rgba(0,0,0,.25)',
        opacity: '0',
        transition: 'opacity .18s ease',
        pointerEvents: 'none'
      });
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.opacity = '1';
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.style.opacity = '0'; }, 1500);
  }

  function markProtectedMedia(root = document) {
    try {
      root.querySelectorAll('img,video,canvas,svg,picture').forEach(el => {
        el.setAttribute('draggable', 'false');
        el.dataset.ptpProtected = 'true';
      });
      root.querySelectorAll('a[download]').forEach(a => {
        a.dataset.ptpProtectedDownload = 'true';
      });
    } catch {}
  }

  function isProtectedTarget(node) {
    if (!node || !(node instanceof Element)) return false;
    return Boolean(
      node.closest(MEDIA_SELECTOR) ||
      node.closest('a[download]') ||
      node.closest('[data-ptp-protect-zone="true"]')
    );
  }

  function looksLikeDirectMediaUrl(url) {
    return /\.(png|jpe?g|webp|gif|svg|bmp|avif|pdf)(\?|#|$)/i.test(String(url || ''));
  }

  document.addEventListener('contextmenu', (e) => {
    if (isProtectedTarget(e.target) || (e.target instanceof Element && e.target.closest('#gameStage, .resource-card, .package-card, .slides-grid, .viewer-modal, .modal'))) {
      e.preventDefault();
      e.stopPropagation();
      notice('Right-click saving is disabled on Pawn to Professor.');
    }
  }, true);

  document.addEventListener('dragstart', (e) => {
    if (isProtectedTarget(e.target)) {
      e.preventDefault();
      notice('Dragging/downloading this content is disabled.');
    }
  }, true);

  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const key = String(e.key || '').toLowerCase();
    if (mod && (key === 's' || key === 'p' || key === 'u')) {
      e.preventDefault();
      e.stopPropagation();
      notice('Saving/printing/source shortcuts are disabled here.');
      return;
    }
    if (key === 'printscreen') {
      notice('Please respect Pawn to Professor content rights.');
    }
  }, true);

  document.addEventListener('click', (e) => {
    const link = e.target instanceof Element ? e.target.closest('a') : null;
    if (!link) return;
    const href = link.getAttribute('href') || '';
    const isDirectDownload = link.hasAttribute('download') || looksLikeDirectMediaUrl(href);
    if (isDirectDownload && !link.dataset.ptpAllowDirectDownload) {
      e.preventDefault();
      e.stopPropagation();
      notice('Direct image/file download is disabled. Use authorized website tools only.');
    }
  }, true);

  document.addEventListener('auxclick', (e) => {
    const link = e.target instanceof Element ? e.target.closest('a') : null;
    if (!link) return;
    const href = link.getAttribute('href') || '';
    if ((link.hasAttribute('download') || looksLikeDirectMediaUrl(href)) && !link.dataset.ptpAllowDirectDownload) {
      e.preventDefault();
      e.stopPropagation();
      notice('Opening protected files in a new tab is disabled.');
    }
  }, true);

  document.addEventListener('copy', (e) => {
    const sel = document.getSelection?.();
    const anchor = sel && sel.anchorNode && sel.anchorNode.parentElement;
    if (anchor && isProtectedTarget(anchor)) {
      e.preventDefault();
      notice('Copying protected content is disabled.');
    }
  }, true);

  markProtectedMedia(document);
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node instanceof Element) markProtectedMedia(node);
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  globalThis.PTP_HUB_PROTECTION = { version: VERSION, refresh: () => markProtectedMedia(document) };
})();
