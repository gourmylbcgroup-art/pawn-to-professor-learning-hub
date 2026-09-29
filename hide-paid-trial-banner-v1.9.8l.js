/* Pawn to Professor v1.9.8l — Hide Trial Banner for Paid Members
   Load after payments-accounting.js and member-trial.js.
*/
(() => {
  const VERSION = '1.9.8l';

  function hideTrialWhenPaid() {
    try {
      const paid = globalThis.PTP_PAYMENT_STATE?.active === true;
      if (!paid) return;

      document.querySelectorAll('.v18-trial-banner').forEach(node => node.remove());

      // Also remove any legacy trial banner that may be rendered by older code.
      document.querySelectorAll('[class*="trial-banner"]').forEach(node => {
        const text = (node.textContent || '').toLowerCase();
        if (text.includes('trial active') || text.includes('3-day trial') || text.includes('7-day trial')) {
          node.remove();
        }
      });
    } catch {
      // Never block the member home screen.
    }
  }

  // Run immediately and again after normal render cycles.
  const run = () => {
    hideTrialWhenPaid();
    setTimeout(hideTrialWhenPaid, 0);
    setTimeout(hideTrialWhenPaid, 250);
  };

  if (typeof render === 'function') {
    const nativeRenderV198l = render;
    render = async function(...args) {
      const result = await nativeRenderV198l(...args);
      run();
      return result;
    };
  }

  const observer = new MutationObserver(() => hideTrialWhenPaid());

  const start = () => {
    const root = document.getElementById('boardApp') || document.body;
    observer.observe(root, { childList:true, subtree:true });
    run();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once:true });
  } else {
    start();
  }

  globalThis.PTP_HIDE_PAID_TRIAL = {
    version: VERSION,
    refresh: run
  };
})();
