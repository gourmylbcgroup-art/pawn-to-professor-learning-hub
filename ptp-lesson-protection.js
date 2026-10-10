/* Pawn to Professor — Shared Lesson Protection
   Blocks common browser save actions inside each interactive lesson.
   IMPORTANT: This is deterrence only; screenshots/devtools cannot be fully prevented.
*/
(() => {
  'use strict';

  const PROTECTED = 'img,picture,canvas,svg,video,[data-protect-media]';

  function showNotice(message) {
    let box = document.getElementById('ptp-protection-message');
    if (!box) {
      box = document.createElement('div');
      box.id = 'ptp-protection-message';
      Object.assign(box.style, {
        position:'fixed',
        left:'50%',
        bottom:'18px',
        transform:'translateX(-50%)',
        zIndex:'2147483647',
        padding:'9px 14px',
        borderRadius:'999px',
        background:'rgba(8,47,37,.94)',
        color:'#fff',
        font:'700 12px system-ui,sans-serif',
        boxShadow:'0 8px 25px rgba(0,0,0,.25)',
        opacity:'0',
        transition:'opacity .15s ease',
        pointerEvents:'none'
      });
      document.body.appendChild(box);
    }

    box.textContent = message;
    box.style.opacity = '1';
    clearTimeout(box._timer);
    box._timer = setTimeout(() => {
      box.style.opacity = '0';
    }, 1400);
  }

  function protectMedia(root = document) {
    try {
      root.querySelectorAll(PROTECTED).forEach(el => {
        el.setAttribute('draggable','false');
        el.style.webkitUserDrag = 'none';
        el.style.userSelect = 'none';
        el.style.webkitUserSelect = 'none';
        el.style.webkitTouchCallout = 'none';
      });
    } catch {}
  }

  document.addEventListener('contextmenu', event => {
    if (event.target instanceof Element &&
        event.target.closest(PROTECTED)) {
      event.preventDefault();
      event.stopPropagation();
      showNotice('Saving lesson images is disabled.');
    }
  }, true);

  document.addEventListener('dragstart', event => {
    if (event.target instanceof Element &&
        event.target.closest(PROTECTED)) {
      event.preventDefault();
      event.stopPropagation();
      showNotice('Dragging lesson images is disabled.');
    }
  }, true);

  document.addEventListener('keydown', event => {
    const mod = event.ctrlKey || event.metaKey;
    const key = String(event.key || '').toLowerCase();

    if (mod && ['s','p','u'].includes(key)) {
      event.preventDefault();
      event.stopPropagation();
      showNotice('Saving or printing this lesson is disabled.');
    }
  }, true);

  protectMedia(document);

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof Element) {
          protectMedia(node);
        }
      }
    }
  });

  observer.observe(document.documentElement, {
    childList:true,
    subtree:true
  });

  globalThis.PTP_LESSON_PROTECTION = { version:'1.0' };
})();
