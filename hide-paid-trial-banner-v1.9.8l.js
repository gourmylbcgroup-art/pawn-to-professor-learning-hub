/* Pawn to Professor v1.9.8l2 — Hide Trial Banner when Paid Access is Active
   Robust fix: detects paid status from BOTH payment state and the visible paid banner.
*/
(() => {
  const VERSION = '1.9.8l2';

  function paidAccessIsVisible() {
    if (globalThis.PTP_PAYMENT_STATE?.active === true) return true;

    const root = document.getElementById('boardApp') || document.body;
    const text = (root?.textContent || '').toLowerCase();

    return text.includes('one-year access active') ||
           text.includes('one year access active');
  }

  function removeTrialBanner() {
    try {
      if (!paidAccessIsVisible()) return;

      document.querySelectorAll('.v18-trial-banner').forEach(node => node.remove());

      document.querySelectorAll('[class*="trial"]').forEach(node => {
        const text = (node.textContent || '').toLowerCase();
        if (
          text.includes('3-day trial active') ||
          text.includes('7-day trial active') ||
          text.includes('trial active')
        ) {
          node.remove();
        }
      });

      // Fallback: remove a card whose visible text says Trial Active.
      document.querySelectorAll('#boardApp div, #boardApp section, #boardApp article').forEach(node => {
        if (!node.parentElement) return;
        const ownText = (node.textContent || '').trim().toLowerCase();

        if (
          ownText.includes('3-day trial active') ||
          ownText.includes('7-day trial active')
        ) {
          // Prefer the smallest containing card, not a large parent container.
          const childHasSame = [...node.children].some(child => {
            const t = (child.textContent || '').toLowerCase();
            return t.includes('3-day trial active') || t.includes('7-day trial active');
          });
          if (!childHasSame) node.remove();
        }
      });
    } catch {
      // Cosmetic patch must never break the portal.
    }
  }

  function refresh() {
    removeTrialBanner();
    setTimeout(removeTrialBanner, 0);
    setTimeout(removeTrialBanner, 100);
    setTimeout(removeTrialBanner, 500);
    setTimeout(removeTrialBanner, 1200);
  }

  if (typeof render === 'function') {
    const nativeRender = render;
    render = async function(...args) {
      const result = await nativeRender(...args);
      refresh();
      return result;
    };
  }

  const observer = new MutationObserver(() => {
    if (paidAccessIsVisible()) removeTrialBanner();
  });

  const start = () => {
    const root = document.getElementById('boardApp') || document.body;
    if (root) observer.observe(root, { childList:true, subtree:true, characterData:true });
    refresh();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once:true });
  } else {
    start();
  }

  globalThis.PTP_HIDE_PAID_TRIAL = {
    version: VERSION,
    refresh
  };
})();
